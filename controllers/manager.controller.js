const mongoose = require('mongoose');
const {
  Area,
  User,
  DeliveryPersonnel,
  Publication,
  SubscriptionChangeRequest,
  DeliverySchedule,
  Bill,
  BillItem,
  Payment,
  PaymentReminder,
  DelivererPayment,
  DeliveryRoute,
  DeliverySummaryReport,
  Subscription,
  RouteAddress,
  DeliveryItem
} = require('../models');

// Helper function to handle errors
const handleError = (res, error) => {
  console.error('Error:', error);
  return res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
};

// Get all areas under manager's control
exports.getAreas = async (req, res) => {
  try {
    const areas = await Area.find({ 
      managers: req.user.id,
      isActive: true 
    })
    .select('name description city state postalCodes')
    .populate('managers', 'firstName lastName email phone')
    .populate('deliverers', 'firstName lastName email phone')
    .populate('publications', 'name language price publicationType')
    .lean();

    res.json({ areas });
  } catch (error) {
    handleError(res, error);
  }
};


// Get all customers in manager's areas
exports.getCustomers = async (req, res) => {
  try {
    const areas = await Area.find({ managers: req.user.id });
    const areaIds = areas.map(area => area._id);
    console.log('getCustomers: Area IDs:', areaIds);

    const customers = await User.find({
      role: 'Customer',
      areas: { $in: areaIds },
      isActive: true
    })
    .select('firstName lastName email phone defaultAddress notificationPreferences')
    .populate('defaultAddress')
    .lean();

    const customersWithSubscriptions = await Promise.all(
      customers.map(async (customer) => {
        const subscriptions = await Subscription.find({
          userId: customer._id,
          status: 'Active'
        })
        .populate('publicationId')
        .populate('addressId')
        .lean();

        return {
          ...customer,
          subscriptions
        };
      })
    );

    res.json({ customers: customersWithSubscriptions });
  } catch (error) {
    handleError(res, error);
  }
};

// Get all deliverers in manager's areas
exports.getDeliverers = async (req, res) => {
  try {
    const areas = await Area.find({ managers: req.user.id });
    const areaIds = areas.map(area => area._id);

    const deliverers = await DeliveryPersonnel.find({
      areasAssigned: { $in: areaIds },
      isActive: true
    })
    .populate('userId', 'firstName lastName email phone')
    .populate('areasAssigned', 'name city')
    .lean();

    res.json({ deliverers });
  } catch (error) {
    handleError(res, error);
  }
};

// Add new deliverer
exports.addDeliverer = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, areaId, bankDetails, commissionRate } = req.body;
    console.log('addDeliverer: Input:', { areaId, email, userId: req.user.id });

    // Validate input
    if (!areaId || !email) {
      return res.status(400).json({ message: 'Area ID and email are required' });
    }

    // Check area access
    const area = await Area.findOne({ _id: areaId, managers: req.user.id });
    console.log('addDeliverer: Area found:', area);
    if (!area) {
      return res.status(403).json({ message: 'Invalid area assignment or unauthorized' });
    }

    // Create user
    const user = new User({
      username: email,
      email,
      password: Math.random().toString(36).slice(-8),
      role: 'Deliverer',
      firstName,
      lastName,
      phone,
      areas: [areaId],
      isActive: true
    });
    await user.save();
    console.log('addDeliverer: User created:', user._id);

    // Create delivery personnel
    const deliverer = new DeliveryPersonnel({
      userId: user._id,
      joiningDate: new Date(), // Added joining date
      areasAssigned: [areaId],
      bankDetails,
      commissionRate,
      isActive: true
    });
    await deliverer.save();
    console.log('addDeliverer: Deliverer created:', deliverer._id);

    // Update area
    area.deliverers.push(deliverer._id);
    await area.save();

    res.status(201).json({
      message: 'Deliverer created successfully',
      deliverer: {
        userId: user._id,
        firstName,
        lastName,
        email,
        phone,
        areaId,
        commissionRate,
        joiningDate: deliverer.joiningDate
      }
    });
  } catch (error) {
    console.error('addDeliverer: Error:', {
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};
// Get all publications in manager's areas
exports.getPublications = async (req, res) => {
  try {
    const publications = await Publication.find({
      managerId: req.user.id,
      isActive: true
    })
    .populate('areas', 'name city')
    .lean();

    console.log("managerId:", req.user.id);

    console.log('getPublications: Found publications:', publications.length);


    res.json({ publications });
  } catch (error) {
    handleError(res, error);
  }
};

// Add new publication
exports.addPublication = async (req, res) => {
  try {
    const {
      name,
      language,
      description,
      price,
      publicationType,
      publicationDays,
      areaId
    } = req.body;

    if (!req.user || !req.user.id) {
      console.log('Invalid req.user:', req.user);
      throw new Error('Authentication required: No user ID found');
    }

    console.log('addPublication input:', { userId: req.user.id, areaId });

    // Verify area belongs to manager
    const area = await Area.findOne({ 
      _id: areaId,
      managers: req.user.id // Use req.user.id
    });

    if (!area) {
      console.log('Area not found for:', { areaId, managerId: req.user.id });
      throw new Error('Invalid area assignment');
    }

    const publication = await Publication.create({
      name,
      language,
      description,
      price,
      publicationType,
      publicationDays,
      managerId: req.user.id, // Use req.user.id
      areas: [areaId]
    });

    // Update area with publication reference
    area.publications.push(publication._id);
    await area.save();

    res.status(201).json({ 
      message: 'Publication added successfully',
      publication
    });
  } catch (error) {
    console.error('addPublication error:', error.message);
    handleError(res, error);
  }
};

// Update publication
exports.updatePublication = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const publication = await Publication.findOne({
      _id: id,
      managerId: req.user.id
    });

    if (!publication) {
      return res.status(404).json({ message: 'Publication not found' });
    }

    // Verify areas if being updated
    if (updateData.areas) {
      const managerAreas = await Area.find({ 
        _id: { $in: updateData.areas },
        managers: req.user.id
      });

      if (managerAreas.length !== updateData.areas.length) {
        throw new Error('Invalid area assignment');
      }
    }

    Object.assign(publication, updateData);
    publication.updatedAt = new Date();
    await publication.save();

    res.json({ 
      message: 'Publication updated successfully',
      publication
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Get subscription change requests
exports.getSubscriptionRequests = async (req, res) => {
  try {
    // Find areas managed by the user
    const areas = await Area.find({ managers: req.user.id });
    console.log('getSubscriptionRequests: Areas:', areas);
    const areaIds = areas.map(area => area._id);
    const publicationIds = areas.flatMap(area => area.publications);

    // Find pending subscription change requests
    const requests = await SubscriptionChangeRequest.find({
      status: 'Pending',
    })
      .populate({
        path: 'subscriptionId',
        match: { areaId: { $in: areaIds } },
        select: 'areaId publicationId',
      })
      .populate('userId', 'firstName lastName email')
      .populate('publicationId', 'name language price')
      .populate('newAddressId', 'name city state areaId')
      .lean();

    console.log('getSubscriptionRequests: Found requests:', requests.length);
    console.log('getSubscriptionRequests: Raw requests:', JSON.stringify(requests, null, 2));

    // Filter valid requests
    const validRequests = requests.filter(req => {
      if (req.requestType === 'New') {
        // For new subscriptions, check publicationId or newAddressId
        const isPublicationInArea = req.publicationId && publicationIds.some(pubId => pubId.equals(req.publicationId._id));
        const isAddressInArea = req.newAddressId && req.newAddressId.areaId && areaIds.some(areaId => areaId.equals(req.newAddressId.areaId));
        return isPublicationInArea || isAddressInArea || (req.subscriptionId && areaIds.some(areaId => areaId.equals(req.subscriptionId.areaId)));
      }
      // For other request types, require a populated subscriptionId
      return req.subscriptionId;
    });

    console.log('getSubscriptionRequests: Valid requests:', validRequests.length);

    // Log invalid requests for debugging
    const invalidRequests = requests.filter(req => !validRequests.includes(req));
    if (invalidRequests.length > 0) {
      console.log('getSubscriptionRequests: Invalid requests:', JSON.stringify(invalidRequests, null, 2));
    }
    console.log('getSubscriptionRequests: Valid requests:', JSON.stringify(validRequests, null, 2));
    res.json({ requests: validRequests });
  } catch (error) {
    console.error('getSubscriptionRequests: Error:', error);
    res.status(500).json({
      message: 'Error fetching subscription requests',
      error: error.message,
    });
  }
};

exports.handleSubscriptionRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status, comments } = req.body;

    console.log('handleSubscriptionRequest: ID:', id);
    console.log('handleSubscriptionRequest: Payload:', req.body);

    const request = await SubscriptionChangeRequest.findById(id)
      .populate('subscriptionId')
      .populate('publicationId')
      .populate('newAddressId');

    console.log('handleSubscriptionRequest: Request:', request);

    if (!request) {
      await session.abortTransaction();
      session.endSession();
      console.log('handleSubscriptionRequest: Request not found for ID:', id);
      return res.status(404).json({ message: 'Request not found' });
    }

    console.log('checkpoint 1');

    // Verify the request is in manager's area
    let area;
    if (request.requestType === 'New') {
      area = await Area.findOne({
        $or: [
          { publications: request.publicationId._id },
          { _id: request.newAddressId?.areaId },
          { _id: request.subscriptionId?.areaId },
        ],
        managers: req.user.id,
      });
    } else {
      area = await Area.findOne({
        _id: request.subscriptionId?.areaId,
        managers: req.user.id,
      });
    }

    console.log('handleSubscriptionRequest: Area:', area);

    if (!area) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Not authorized to handle this request' });
    }

    request.status = status;
    request.processedBy = req.user.id;
    request.processedDate = new Date();
    request.comments = comments;
    console.log('handleSubscriptionRequest: Updated request:', request);

    if (status === 'Approved') {
      switch (request.requestType) {
        case 'New': {
          let subscription;
          let addressId = request.newAddressId?._id;

          if (!addressId) {
            // Fetch a default address for the user
            const defaultAddress = await Address.findOne({
              userId: request.userId,
              areaId: area._id,
              isActive: true,
            }).session(session);
            if (!defaultAddress) {
              await session.abortTransaction();
              session.endSession();
              return res.status(400).json({ message: 'No valid address found for user in this area' });
            }
            addressId = defaultAddress._id;
            request.newAddressId = defaultAddress;
            console.log('handleSubscriptionRequest: Using default address:', defaultAddress);
          }

          if (request.subscriptionId) {
            subscription = await Subscription.findById(request.subscriptionId).session(session);
            console.log('handleSubscriptionRequest: Existing Subscription:', subscription);
            if (!subscription) {
              await session.abortTransaction();
              session.endSession();
              return res.status(404).json({ message: 'Subscription not found' });
            }
          } else {
            subscription = new Subscription({
              userId: request.userId,
              publicationId: request.publicationId._id,
              quantity: request.newQuantity || 1,
              addressId,
              areaId: request.newAddressId?.areaId || area._id,
              deliveryPreferences: request.deliveryPreferences || {
                placement: 'Mailbox',
                additionalInstructions: request.newAddressId?.deliveryInstructions,
              },
              status: 'Pending',
            });
            await subscription.save({ session });
            request.subscriptionId = subscription._id;
            console.log('handleSubscriptionRequest: Created Subscription:', subscription);
          }
          subscription.status = 'Active';
          subscription.startDate = request.effectiveDate;
          await subscription.save({ session });
          break;
        }

        case 'Update': {
          const modifySubscription = await Subscription.findById(request.subscriptionId).session(session);
          if (!modifySubscription) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Subscription not found' });
          }
          if (request.newQuantity) modifySubscription.quantity = request.newQuantity;
          if (request.newAddressId) modifySubscription.addressId = request.newAddressId._id;
          if (request.deliveryPreferences) {
            modifySubscription.deliveryPreferences = {
              placement: request.deliveryPreferences.placement,
              additionalInstructions: request.deliveryPreferences.additionalInstructions || request.newAddressId?.deliveryInstructions,
            };
          }
          await modifySubscription.save({ session });
          break;
        }

        case 'Cancel': {
          await Subscription.findByIdAndUpdate(
            request.subscriptionId,
            {
              status: 'Cancelled',
              endDate: request.effectiveDate,
            },
            { session }
          );
          break;
        }
      }
    }

    await request.save({ session });
    await session.commitTransaction();

    res.json({
      message: 'Subscription request handled successfully',
      request,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Handle subscription request error:', error);
    res.status(500).json({
      message: 'Error handling subscription request',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

exports.createRoute = async (req, res) => {
  try {
    const {
      personnelId,
      routeName,
      routeDescription,
      areaId,
      optimizationCriteria = 'Distance',
      addressIds = [] // Optional array of address IDs with sequence numbers
    } = req.body;

    console.log("Route",req.body);

    // Validate input
    if (!personnelId || !routeName || !areaId) {
      return res.status(400).json({ message: 'Personnel ID, route name, and area ID are required' });
    }

    // Verify area belongs to manager
    const area = await Area.findOne({
      _id: areaId,
      managers: req.user.id
    });
    if (!area) {
      return res.status(403).json({ message: 'Not authorized to create route for this area' });
    }

    // Verify personnel is assigned to the area
    const deliverer = await DeliveryPersonnel.findOne({
      _id: personnelId,
      areasAssigned: areaId,
      isActive: true
    });
    if (!deliverer) {
      return res.status(400).json({ message: 'Invalid or unauthorized deliverer for this area' });
    }

    // Create the delivery route
    const route = await DeliveryRoute.create({
      personnelId,
      routeName,
      routeDescription,
      areaId,
      optimizationCriteria,
      isActive: true
    });

    // If addressIds are provided, create RouteAddress entries
    if (addressIds.length > 0) {
      // Validate provided addresses belong to active subscriptions in the area
      const subscriptions = await Subscription.find({
        areaId,
        addressId: { $in: addressIds.map(addr => addr.addressId) },
        status: 'Active'
      });
      const validAddressIds = subscriptions.map(sub => sub.addressId.toString());

      // Create RouteAddress entries for valid addresses
      const routeAddresses = addressIds
        .filter(addr => validAddressIds.includes(addr.addressId))
        .map((addr, index) => ({
          routeId: route._id,
          addressId: addr.addressId,
          sequenceNumber: addr.sequenceNumber || index + 1,
          createdAt: new Date()
        }));

      if (routeAddresses.length > 0) {
        await RouteAddress.create(routeAddresses);
      }

      // Warn if some addresses were invalid
      if (routeAddresses.length < addressIds.length) {
        console.warn('Some provided addresses were not linked to active subscriptions in the area');
      }
    } else {
      // Automatically include all active subscription addresses in the area
      const subscriptions = await Subscription.find({
        areaId,
        status: 'Active'
      }).populate('addressId');
      
      const routeAddresses = subscriptions.map((sub, index) => ({
        routeId: route._id,
        addressId: sub.addressId._id,
        sequenceNumber: index + 1,
        createdAt: new Date()
      }));

      if (routeAddresses.length > 0) {
        await RouteAddress.create(routeAddresses);
      }
    }

    // Populate the route with area details for response
    const populatedRoute = await DeliveryRoute.findById(route._id)
      .populate('areaId', 'name city state')
      .populate('personnelId', 'userId')
      .lean();

    res.status(201).json({
      message: 'Delivery route created successfully',
      route: populatedRoute
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Get delivery schedules
exports.getSchedules = async (req, res) => {
  try {
    const { date } = req.query;
    const queryDate = date ? new Date(date) : new Date();
    queryDate.setHours(0, 0, 0, 0);

    const areas = await Area.find({ managers: req.user.id });
    const areaIds = areas.map(area => area._id);

    const schedules = await DeliverySchedule.find({
      areaId: { $in: areaIds },
      date: {
        $gte: queryDate,
        $lt: new Date(queryDate.getTime() + 24 * 60 * 60 * 1000)
      }
    })
    .populate('personnelId')
    .populate('routeId')
    .populate('areaId')
    .lean();

    res.json({ schedules });
  } catch (error) {
    handleError(res, error);
  }
};

// Create delivery schedule
exports.createSchedule = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { personnelId, date, areaId, routeId, notes } = req.body;

    // Validate input
    if (!personnelId || !date || !areaId || !routeId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Personnel ID, date, area ID, and route ID are required' });
    }

    // Verify area belongs to manager
    const area = await Area.findOne({
      _id: areaId,
      managers: req.user.id,
    }).session(session);

    if (!area) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Not authorized to create schedule for this area' });
    }

    // Verify personnel and route
    const deliverer = await DeliveryPersonnel.findOne({
      _id: personnelId,
      areasAssigned: areaId,
      isActive: true,
    }).session(session);

    if (!deliverer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid or unauthorized deliverer for this area' });
    }

    const route = await DeliveryRoute.findOne({
      _id: routeId,
      areaId,
      personnelId,
      isActive: true,
    }).session(session);

    if (!route) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid or unauthorized route for this area and deliverer' });
    }

    // Create schedule
    const schedule = await DeliverySchedule.create(
      [
        {
          personnelId,
          date: new Date(date),
          areaId,
          routeId,
          notes,
          status: 'Pending',
        },
      ],
      { session }
    );

    // Find active subscriptions in the area
    const subscriptions = await Subscription.find({
      areaId,
      status: 'Active',
    })
      .populate('publicationId')
      .populate('addressId')
      .session(session);

    // Create DeliveryItem for each subscription
    const deliveryItems = subscriptions.map((sub) => ({
      scheduleId: schedule[0]._id,
      subscriptionId: sub._id,
      addressId: sub.addressId._id,
      publicationId: sub.publicationId._id,
      quantity: sub.quantity || 1, // Use subscription quantity
      status: 'Pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (deliveryItems.length > 0) {
      await DeliveryItem.create(deliveryItems, { session });
      console.log(`Created ${deliveryItems.length} DeliveryItem records for schedule ${schedule[0]._id}`);
    } else {
      console.log('No active subscriptions found for area:', areaId);
    }

    await session.commitTransaction();

    // Populate schedule for response
    const populatedSchedule = await DeliverySchedule.findById(schedule[0]._id)
      .populate('personnelId', 'userId')
      .populate('routeId', 'routeName routeDescription')
      .populate('areaId', 'name city state')
      .lean();

    res.status(201).json({
      message: 'Schedule created successfully with delivery items',
      schedule: populatedSchedule,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Create schedule error:', error);
    res.status(500).json({
      message: 'Error creating schedule',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// Get bills
exports.getBills = async (req, res) => {
  try {
    const { month, year, status } = req.query;
    const areas = await Area.find({ managers: req.user.id });
    const areaIds = areas.map(area => area._id);

    const query = {
      areaId: { $in: areaIds }
    };

    if (month) query.billMonth = parseInt(month);
    if (year) query.billYear = parseInt(year);
    if (status) query.status = status;

    // Fetch bills without populating billItems
    const bills = await Bill.find(query)
      .populate('userId', 'firstName lastName email')
      .lean();

    // Fetch bill items for each bill
    const billsWithItems = await Promise.all(
      bills.map(async (bill) => {
        const billItems = await BillItem.find({ billId: bill._id })
          .populate('publicationId', 'name price')
          .lean();
        return { ...bill, billItems };
      })
    );

    res.json({ bills: billsWithItems });
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({
      message: 'Error fetching bills',
      error: error.message
    });
  }
};

// Generate bills
exports.generateBills = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { month, year } = req.body;
    const areas = await Area.find({ managers: req.user.id });
    const areaIds = areas.map(area => area._id);

    // Get all active subscriptions in manager's areas
    const subscriptions = await Subscription.find({
      areaId: { $in: areaIds },
      status: 'Active'
    })
    .populate('publicationId')
    .populate('userId');

    const billsToCreate = [];
    const billItemsMap = new Map(); // To track bill items by bill

    for (const subscription of subscriptions) {
      // Find if there's already a bill for this user and area
      const billKey = `${subscription.userId._id}-${subscription.areaId}`;
      let existingBill = billItemsMap.get(billKey);

      if (!existingBill) {
        // Create a new bill
        const newBill = {
          userId: subscription.userId._id,
          billDate: new Date(),
          billMonth: month,
          billYear: year,
          totalAmount: 0,
          dueDate: new Date(year, month, 15), // Due on 15th of billing month
          status: 'Unpaid',
          areaId: subscription.areaId,
          billNumber: `BILL-${year}${month.toString().padStart(2, '0')}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          outstandingAmount: 0,
          billItems: [] // Store bill items here temporarily
        };
        billsToCreate.push(newBill);
        billItemsMap.set(billKey, newBill);
        existingBill = newBill;
      }

      // Calculate amount for this subscription
      const amount = subscription.publicationId.price * subscription.quantity;
      existingBill.totalAmount += amount;
      existingBill.outstandingAmount += amount;

      // Add bill item to the temporary collection
      existingBill.billItems.push({
        publicationId: subscription.publicationId._id,
        quantity: subscription.quantity,
        unitPrice: subscription.publicationId.price,
        totalPrice: amount,
        deliveryPeriod: {
          from: new Date(year, month - 1, 1),
          to: new Date(year, month, 0)
        }
      });
    }

    if (billsToCreate.length === 0) {
      return res.status(200).json({
        message: 'No active subscriptions found for bill generation',
        billIds: []
      });
    }

    // Create bills first
    const createdBills = await Bill.create(billsToCreate.map(bill => {
      // Remove billItems from the bill object before creating
      const { billItems, ...billData } = bill;
      return billData;
    }), { session });

    // Create bill items with correct billId references
    const allBillItems = [];
    createdBills.forEach((createdBill, index) => {
      const originalBill = billsToCreate[index];
      const billItems = originalBill.billItems.map(item => ({
        ...item,
        billId: createdBill._id
      }));
      allBillItems.push(...billItems);
    });

    await BillItem.create(allBillItems, { session });

    await session.commitTransaction();
    res.status(201).json({ 
      message: 'Bills generated successfully',
      billIds: createdBills.map(bill => bill._id)
    });
  } catch (error) {
    await session.abortTransaction();
    handleError(res, error);
  } finally {
    session.endSession();
  }
};

// Get payments
exports.getPayments = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    const areas = await Area.find({ managers: req.user.id });
    const areaIds = areas.map(area => area._id);

    const query = {
      'bill.areaId': { $in: areaIds }
    };

    if (startDate) query.paymentDate = { $gte: new Date(startDate) };
    if (endDate) query.paymentDate = { ...query.paymentDate, $lte: new Date(endDate) };
    if (status) query.status = status;

    const payments = await Payment.find(query)
      .populate('billId')
      .populate('userId', 'firstName lastName email')
      .lean();

    res.json({ payments });
  } catch (error) {
    handleError(res, error);
  }
};

// Send payment reminders
exports.sendPaymentReminders = async (req, res) => {
  try {
    const areas = await Area.find({ managers: req.user.id });
    const areaIds = areas.map(area => area._id);

    // Find overdue bills
    const overdueBills = await Bill.find({
      areaId: { $in: areaIds },
      status: { $in: ['Unpaid', 'Partially Paid'] },
      dueDate: { $lt: new Date() }
    })
    .populate('userId');

    const reminders = [];
    for (const bill of overdueBills) {
      // Check if reminder already sent recently
      const recentReminder = await PaymentReminder.findOne({
        billId: bill._id,
        reminderDate: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      });

      if (!recentReminder) {
        reminders.push({
          billId: bill._id,
          userId: bill.userId._id,
          reminderDate: new Date(),
          reminderType: 'First Notice',
          message: `Your bill ${bill.billNumber} of amount ${bill.outstandingAmount} is overdue. Please make the payment as soon as possible.`,
          status: 'Pending',
          deliveryMethod: bill.userId.notificationPreferences.email ? 'Email' : 'Print'
        });
      }
    }

    if (reminders.length > 0) {
      await PaymentReminder.create(reminders);
    }

    res.status(201).json({ 
      message: `${reminders.length} payment reminders created successfully`
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Generate delivery report
exports.generateDeliveryReport = async (req, res) => {
  try {
    const { month, year } = req.query;
    const areas = await Area.find({ managers: req.user.id });
    const areaIds = areas.map(area => area._id);

    const report = await DeliverySummaryReport.findOne({
      reportMonth: parseInt(month),
      reportYear: parseInt(year),
      'reportData.areaId': { $in: areaIds }
    });

    if (!report) {
      // Generate new report
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const deliveryItems = await DeliveryItem.find({
        'schedule.areaId': { $in: areaIds },
        createdAt: { $gte: startDate, $lte: endDate }
      })
      .populate('publicationId')
      .populate('scheduleId');

      const reportData = {
        totalDeliveries: deliveryItems.length,
        successfulDeliveries: deliveryItems.filter(item => item.status === 'Delivered').length,
        failedDeliveries: deliveryItems.filter(item => item.status === 'Failed').length,
        skippedDeliveries: deliveryItems.filter(item => item.status === 'Skipped').length,
        publications: {}
      };

      deliveryItems.forEach(item => {
        if (!reportData.publications[item.publicationId._id]) {
          reportData.publications[item.publicationId._id] = {
            name: item.publicationId.name,
            totalDelivered: 0,
            revenue: 0
          };
        }
        if (item.status === 'Delivered') {
          reportData.publications[item.publicationId._id].totalDelivered += item.quantity;
          reportData.publications[item.publicationId._id].revenue += 
            item.quantity * item.publicationId.price;
        }
      });

      const newReport = await DeliverySummaryReport.create({
        reportMonth: parseInt(month),
        reportYear: parseInt(year),
        generatedDate: new Date(),
        generatedBy: req.user.id,
        reportData
      });

      res.json({ report: newReport });
    } else {
      res.json({ report });
    }
  } catch (error) {
    handleError(res, error);
  }
};

// Generate financial report
exports.generateFinancialReport = async (req, res) => {
  try {
    const { month, year } = req.query;
    const areas = await Area.find({ managers: req.user.id });
    const areaIds = areas.map(area => area._id);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Get bills for the period
    const bills = await Bill.find({
      areaId: { $in: areaIds },
      billDate: { $gte: startDate, $lte: endDate }
    });

    // Get payments for the period
    const payments = await Payment.find({
      'bill.areaId': { $in: areaIds },
      paymentDate: { $gte: startDate, $lte: endDate }
    });

    // Get deliverer payments for the period
    const delivererPayments = await DelivererPayment.find({
      paymentMonth: parseInt(month),
      paymentYear: parseInt(year),
      'personnel.areasAssigned': { $in: areaIds }
    });

    const report = {
      period: {
        month: parseInt(month),
        year: parseInt(year)
      },
      billing: {
        totalBilled: bills.reduce((sum, bill) => sum + bill.totalAmount, 0),
        totalBills: bills.length,
        unpaidBills: bills.filter(bill => bill.status === 'Unpaid').length,
        partiallyPaidBills: bills.filter(bill => bill.status === 'Partially Paid').length,
        paidBills: bills.filter(bill => bill.status === 'Paid').length
      },
      payments: {
        totalReceived: payments.reduce((sum, payment) => sum + payment.amount, 0),
        totalPayments: payments.length,
        byMethod: payments.reduce((acc, payment) => {
          acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + payment.amount;
          return acc;
        }, {})
      },
      delivererPayments: {
        totalPaid: delivererPayments.reduce((sum, payment) => sum + payment.amount, 0),
        totalDeliverers: delivererPayments.length,
        pendingPayments: delivererPayments.filter(payment => payment.status === 'Pending').length
      },
      summary: {
        grossRevenue: bills.reduce((sum, bill) => sum + bill.totalAmount, 0),
        totalExpenses: delivererPayments.reduce((sum, payment) => sum + payment.amount, 0),
        netRevenue: bills.reduce((sum, bill) => sum + bill.totalAmount, 0) -
                   delivererPayments.reduce((sum, payment) => sum + payment.amount, 0)
      }
    };

    res.json({ report });
  } catch (error) {
    handleError(res, error);
  }
};

// Process deliverer payments
exports.processDelivererPayments = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { month, year } = req.body;
    const areas = await Area.find({ managers: req.user.id });
    const areaIds = areas.map(area => area._id);

    // Get all deliverers in manager's areas
    const deliverers = await DeliveryPersonnel.find({
      areasAssigned: { $in: areaIds },
      isActive: true
    });

    const payments = [];
    for (const deliverer of deliverers) {
      // Check if payment already processed
      const existingPayment = await DelivererPayment.findOne({
        personnelId: deliverer._id,
        paymentMonth: month,
        paymentYear: year
      });

      if (!existingPayment) {
        // Calculate deliveries and commission
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const deliveries = await DeliveryItem.find({
          'schedule.personnelId': deliverer._id,
          status: 'Delivered',
          deliveryTime: { $gte: startDate, $lte: endDate }
        })
        .populate('publicationId');

        const totalAmount = deliveries.reduce((sum, delivery) => 
          sum + (delivery.quantity * delivery.publicationId.price * (deliverer.commissionRate / 100)),
          0
        );

        payments.push({
          personnelId: deliverer._id,
          paymentMonth: month,
          paymentYear: year,
          amount: totalAmount,
          commissionRate: deliverer.commissionRate,
          status: 'Pending',
          paymentMethod: 'Bank Transfer'
        });
      }
    }

    console.log('Payments to be processed:', payments);

    if (payments.length > 0) {
      await DelivererPayment.create(payments, { session });
    }

    await session.commitTransaction();
    res.status(201).json({ 
      message: `${payments.length} deliverer payments processed successfully`
    });
  } catch (error) {
    await session.abortTransaction();
    handleError(res, error);
  } finally {
    session.endSession();
  }
};

// In manager.controller.js
exports.getPersonnelIdByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('getPersonnelIdByUserId: User ID:', userId);

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid User ID format' });
    }

    // Find DeliveryPersonnel by userId
    const personnel = await DeliveryPersonnel.findOne({ userId }).select('_id');

 

    if (!personnel) {
      return res.status(404).json({ message: 'Delivery personnel not found for this user' });
    }

    console.log('getPersonnelIdByUserId: Personnel found:', personnel._id);

    res.json({ personnelId: personnel._id });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getRoutes = async (req,res) =>{

  try {
    const { areaId } = req.query;
    const query = { isActive: true }; // Only fetch active routes
    if (areaId) {
      query.areaId = areaId;
    }
    const routes = await DeliveryRoute.find(query)
      .populate('areaId', 'name') // Populate area name
      .populate('personnelId', 'firstName lastName'); // Populate deliverer details
    res.json({ routes });
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ message: 'Failed to fetch routes' });
  }

};



module.exports = exports;