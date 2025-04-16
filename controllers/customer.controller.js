const { 
  User, 
  Publication, 
  Subscription, 
  SubscriptionChangeRequest,
  SubscriptionPause,
  Address,
  Bill,
  BillItem,
  Payment,
  DeliveryItem,
  CustomerActivity
} = require('../models');
const {mongoose} = require('mongoose');

// Get managers in customer's area
exports.getManagers = async (req, res) => {
  try {
    const customer = await User.findById(req.user.id).populate('areas');
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const areaIds = customer.areas.map(area => area._id);
    
    const managers = await User.find({
      role: 'Manager',
      areas: { $in: areaIds },
      isActive: true
    }).select('-password');

    res.json({ managers });
  } catch (error) {
    console.error('Get managers error:', error);
    res.status(500).json({ 
      message: 'Error fetching managers',
      error: error.message 
    });
  }
};

// Get publications available in customer's area
exports.getPublications = async (req, res) => {
  try {
    const customer = await User.findById(req.user.id).populate('areas');
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const areaIds = customer.areas.map(area => area._id);
    
    const publications = await Publication.find({
      areas: { $in: areaIds },
      isActive: true
    });

    res.json({ publications });
  } catch (error) {
    console.error('Get publications error:', error);
    res.status(500).json({ 
      message: 'Error fetching publications',
      error: error.message 
    });
  }
};

// Get customer's active subscriptions
exports.getSubscriptions = async (req, res) => {
  try {
    console.log('Fetching subscriptions for user:', req.user.id);
    const subscriptions = await Subscription.find({
      userId: req.user.id,
      status: { $in: ['Active', 'Paused'] }
    })
    .populate('publicationId')
    .populate('addressId')
    .populate('delivererId', '-password');

    res.json({ subscriptions });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ 
      message: 'Error fetching subscriptions',
      error: error.message 
    });
  }
};

// Create new subscription request
exports.createSubscription = async (req, res) => {
  try {
    const { publicationId, quantity, deliveryPreferences, addressId } = req.body;


    console.log('Creating subscription with data:', req.body);

    // Validate inputs
    if (!mongoose.Types.ObjectId.isValid(publicationId)) {
      return res.status(400).json({ message: 'Invalid publication ID format' });
    }
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ message: 'Invalid address ID format' });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be a positive integer' });
    }
    if (!deliveryPreferences || !deliveryPreferences.placement) {
      return res.status(400).json({ message: 'Delivery placement is required' });
    }


    // Validate publication
    const publication = await Publication.findOne({ _id: publicationId, isActive: true });
    console.log('Publication found:', publication);
    if (!publication) {
      return res.status(404).json({ message: 'Publication not found or inactive' });
    }

    // Validate address
    const address = await Address.findOne({
      _id: addressId,
      userId: req.user.id,
      isActive: true,
    });
    console.log('Address found:', address);
    if (!address) {
      return res.status(404).json({ message: 'Address not found or inactive' });
    }

    // Create subscription
    const subscription = new Subscription({
      userId: req.user.id,
      publicationId,
      quantity,
      addressId: address._id,
      areaId: address.areaId,
      deliveryPreferences: {
        placement: deliveryPreferences.placement,
        additionalInstructions: deliveryPreferences.additionalInstructions || address.deliveryInstructions,
      },
      startDate: new Date(), // Required field
      status: 'Active', // Valid enum value
    });
    await subscription.save();

    // Create subscription change request
    const subscriptionRequest = new SubscriptionChangeRequest({
      userId: req.user.id,
      requestType: 'New',
      subscriptionId: subscription._id,
      publicationId,
      newQuantity: quantity,
      newAddressId: address._id,
      deliveryPreferences: {
        placement: deliveryPreferences.placement,
        additionalInstructions: deliveryPreferences.additionalInstructions || address.deliveryInstructions,
      },
      effectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'Pending',
      requestDate: new Date(),
    });

    console.log('subscriptionRequest:', subscriptionRequest);
    await subscriptionRequest.save();

    // Log activity
    const activity = new CustomerActivity({
      userId: req.user.id,
      activityType: 'New Subscription',
      details: `Requested new subscription for ${publication.name}`,
    });
    await activity.save();

    res.status(201).json({
      message: 'Subscription request created successfully',
      subscriptionRequest,
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({
      message: 'Error creating subscription request',
      error: error.message,
    });
  }
};

// Modify subscription request
exports.updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, addressId, deliveryPreferences } = req.body;

    const subscription = await Subscription.findOne({
      _id: id,
      userId: req.user.id,
      status: 'Active'
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Active subscription not found' });
    }

    // Create modification request
    const modificationRequest = new SubscriptionChangeRequest({
      subscriptionId: subscription._id,
      userId: req.user.id,
      requestType: 'Modify',
      newQuantity: quantity,
      newAddressId: addressId,
      effectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      status: 'Pending'
    });

    await modificationRequest.save();

    // Log customer activity
    const activity = new CustomerActivity({
      userId: req.user.id,
      activityType: 'Modification',
      details: `Requested modification for subscription ${id}`
    });

    await activity.save();

    res.json({ 
      message: 'Modification request created successfully',
      modificationRequest 
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ 
      message: 'Error updating subscription',
      error: error.message 
    });
  }
};

// Cancel subscription request
exports.cancelSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('Cancelling subscription with ID:', id);

    // First check if subscription exists regardless of status
    const subscription = await Subscription.findOne({
      _id: id,
      userId: req.user.id
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    // If already cancelled, return an appropriate message
    if (subscription.status.toLowerCase() === 'cancelled') {
      return res.status(400).json({ message: 'Subscription is already cancelled' });
    }

    // Create cancellation request
    const cancellationRequest = new SubscriptionChangeRequest({
      subscriptionId: subscription._id,
      userId: req.user.id,
      requestType: 'Cancel',
      effectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      status: 'Pending'
    });

    console.log('cancellationRequest:', cancellationRequest);

    await cancellationRequest.save();

    // Log customer activity
    const activity = new CustomerActivity({
      userId: req.user.id,
      activityType: 'Cancellation',
      details: `Requested cancellation for subscription ${id}`
    });

    console.log('activity:', activity);

    await activity.save();

    res.json({ 
      message: 'Cancellation request created successfully',
      cancellationRequest: {
        id: cancellationRequest._id,
        status: cancellationRequest.status,
        effectiveDate: cancellationRequest.effectiveDate
      }
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ 
      message: 'Error cancelling subscription',
      error: error.message 
    });
  }
};

// Request pause in delivery
exports.requestPause = async (req, res) => {
  try {
    const { subscriptionId, startDate, endDate, reason } = req.body;

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      userId: req.user.id,
      status: 'Active'
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Active subscription not found' });
    }

    // Create pause request
    const pauseRequest = new SubscriptionPause({
      subscriptionId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason
    });

    await pauseRequest.save();

    // Update subscription status
    subscription.status = 'Paused';
    await subscription.save();

    // Log customer activity
    const activity = new CustomerActivity({
      userId: req.user.id,
      activityType: 'Pause Request',
      details: `Requested pause for subscription ${subscriptionId}`
    });

    await activity.save();

    res.json({ 
      message: 'Pause request created successfully',
      pauseRequest 
    });
  } catch (error) {
    console.error('Request pause error:', error);
    res.status(500).json({ 
      message: 'Error requesting pause',
      error: error.message 
    });
  }
};

// Get customer's bills
exports.getBills = async (req, res) => {
  try {
    const bills = await Bill.find({
      userId: req.user.id
    })
    .sort({ billDate: -1 })
    .populate('areaId');

    console.log('User ID:', req.user.id);

    res.json({ bills });
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({ 
      message: 'Error fetching bills',
      error: error.message 
    });
  }
};

// Get specific bill details
exports.getBillDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const bill = await Bill.findOne({
      _id: id,
      userId: req.user.id
    }).populate('areaId');

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const billItems = await BillItem.find({
      billId: id
    }).populate('publicationId');

    res.json({ 
      bill,
      items: billItems
    });
  } catch (error) {
    console.error('Get bill details error:', error);
    res.status(500).json({ 
      message: 'Error fetching bill details',
      error: error.message 
    });
  }
};

// Make a payment
exports.makePayment = async (req, res) => {
  try {
    const { billId, amount, paymentMethod, referenceNumber } = req.body;

    const bill = await Bill.findOne({
      _id: billId,
      userId: req.user.id
    });

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    // Create payment record
    const payment = new Payment({
      billId,
      userId: req.user.id,
      paymentDate: new Date(),
      amount,
      paymentMethod,
      referenceNumber,
      status: 'Completed',
      receiptNumber: `RCP${Date.now()}`
    });

    await payment.save();

    // Update bill status and outstanding amount
    bill.outstandingAmount = Math.max(0, bill.outstandingAmount - amount);
    bill.status = bill.outstandingAmount === 0 ? 'Paid' : 'Partially Paid';
    await bill.save();

    // Log customer activity
    const activity = new CustomerActivity({
      userId: req.user.id,
      activityType: 'Payment',
      details: `Made payment of ${amount} for bill ${billId}`
    });

    await activity.save();

    res.status(201).json({ 
      message: 'Payment processed successfully',
      payment 
    });
  } catch (error) {
    console.error('Make payment error:', error);
    res.status(500).json({ 
      message: 'Error processing payment',
      error: error.message 
    });
  }
};

// View payment history
exports.getPaymentHistory = async (req, res) => {
  try {
    const payments = await Payment.find({
      userId: req.user.id
    })
    .sort({ paymentDate: -1 })
    .populate('billId');

    res.json({ payments });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ 
      message: 'Error fetching payment history',
      error: error.message 
    });
  }
};

// Add new address
exports.addAddress = async (req, res) => {
  try {
    const { 
      streetAddress, 
      city, 
      state, 
      postalCode, 
      deliveryInstructions,
      isDefault 
    } = req.body;

    const address = new Address({
      userId: req.user.id,
      streetAddress,
      city,
      state,
      postalCode,
      deliveryInstructions,
      isDefault
    });

    await address.save();

    // If this is set as default, update user's default address
    if (isDefault) {
      await User.findByIdAndUpdate(req.user.id, {
        defaultAddress: address._id
      });
    }

    // Log customer activity
    const activity = new CustomerActivity({
      userId: req.user.id,
      activityType: 'Address Update',
      details: 'Added new delivery address'
    });

    await activity.save();

    res.status(201).json({ 
      message: 'Address added successfully',
      address 
    });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({ 
      message: 'Error adding address',
      error: error.message 
    });
  }
};

// Update address
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      streetAddress, 
      city, 
      state, 
      postalCode, 
      deliveryInstructions,
      isDefault 
    } = req.body;

    const address = await Address.findOne({
      _id: id,
      userId: req.user.id
    });

    if (!address) {
      return res.status(404).json({ message: 'Address not found' });
    }

    // Update address fields
    address.streetAddress = streetAddress || address.streetAddress;
    address.city = city || address.city;
    address.state = state || address.state;
    address.postalCode = postalCode || address.postalCode;
    address.deliveryInstructions = deliveryInstructions || address.deliveryInstructions;

    await address.save();

    // If this is set as default, update user's default address
    if (isDefault) {
      await User.findByIdAndUpdate(req.user.id, {
        defaultAddress: address._id
      });
    }

    // Log customer activity
    const activity = new CustomerActivity({
      userId: req.user.id,
      activityType: 'Address Update',
      details: `Updated address ${id}`
    });

    await activity.save();

    res.json({ 
      message: 'Address updated successfully',
      address 
    });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ 
      message: 'Error updating address',
      error: error.message 
    });
  }
};

// Check today's delivery status
exports.getDeliveryStatus = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deliveryItems = await DeliveryItem.find({
      subscriptionId: {
        $in: await Subscription.find({ 
          userId: req.user.id,
          status: 'Active'
        }).distinct('_id')
      },
      createdAt: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    })
    .populate('publicationId')
    .populate('addressId');

    res.json({ deliveryItems });
  } catch (error) {
    console.error('Get delivery status error:', error);
    res.status(500).json({ 
      message: 'Error fetching delivery status',
      error: error.message 
    });
  }
};