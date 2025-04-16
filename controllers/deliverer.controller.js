const mongoose = require('mongoose');
const {
  DeliveryRoute,
  DeliverySchedule,
  DeliveryItem,
  DeliveryPersonnel,
  DelivererPayment,
  User,
  Subscription
} = require('../models');

// Helper function to handle errors
const handleError = (res, error) => {
  console.error('Error:', error);
  return res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
};

// Get all routes assigned to the deliverer
exports.getRoutes = async (req, res) => {
  try {
    console.log('User ID:', req.user.id);
    const personnel = await DeliveryPersonnel.findOne({
      userId: req.user.id
    }).populate('areasAssigned');
    
    console.log('Personnel:', personnel);

    if (!personnel) {
      return res.status(404).json({ message: 'Delivery personnel record not found' });
    }

    const routes = await DeliveryRoute.find({ 
      personnelId: personnel._id,
      areaId: { $in: personnel.areasAssigned.map(area => area._id) },
      isActive: true 
    })
    .populate('areaId', 'name city state')
    .lean();

    res.json({ routes });
  } catch (error) {
    handleError(res, error);
  }
};

// Get today's delivery schedule
exports.getSchedule = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const schedule = await DeliverySchedule.findOne({
      personnelId: req.user.deliveryPersonnel,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    })
    .populate('routeId', 'routeName routeDescription')
    .populate('areaId', 'name city state')
    .lean();

    if (!schedule) {
      return res.status(404).json({ message: 'No schedule found for today' });
    }

    res.json({ schedule });
  } catch (error) {
    handleError(res, error);
  }
};

// Get delivery items for today
exports.getDeliveryItems = async (req, res) => {
  try {
    console.log('User ID:', req.user.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const schedules = await DeliverySchedule.find({
      personnelId: req.user.deliveryPersonnel,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    console.log('Schedules:', schedules);

    if (!schedules || schedules.length === 0) {
      return res.status(404).json({ message: 'No schedules found for today' });
    }

    const scheduleIds = schedules.map((schedule) => schedule._id);

    const items = await DeliveryItem.find({ scheduleId: { $in: scheduleIds } })
      .populate('subscriptionId', 'userId quantity deliveryPreferences')
      .populate('addressId', 'streetAddress city state postalCode deliveryInstructions')
      .populate('publicationId', 'name language')
      .sort({ 'addressId.postalCode': 1 })
      .lean();

      console.log('Items:', items);

    res.json({ items });
  } catch (error) {
    handleError(res, error);
  }
};

// Update delivery status for an item
exports.updateDeliveryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, deliveryNotes } = req.body;

    if (!['Delivered', 'Failed', 'Skipped'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const item = await DeliveryItem.findById(id);
    if (!item) {
      return res.status(404).json({ message: 'Delivery item not found' });
    }

    // Verify the item belongs to the deliverer's schedule
    const schedule = await DeliverySchedule.findOne({
      _id: item.scheduleId,
      personnelId: req.user.deliveryPersonnel
    });

    if (!schedule) {
      return res.status(403).json({ message: 'Not authorized to update this delivery' });
    }

    item.status = status;
    item.deliveryNotes = deliveryNotes;
    item.deliveryTime = new Date();
    item.updatedAt = new Date();
    await item.save();

    res.json({ message: 'Delivery status updated successfully', item });
  } catch (error) {
    handleError(res, error);
  }
};

// Upload delivery proof
exports.uploadDeliveryProof = async (req, res) => {
  try {
    const { itemId } = req.body;
    const photoUrl = req.file?.path; // Assuming file upload middleware is configured

    if (!photoUrl) {
      return res.status(400).json({ message: 'No photo provided' });
    }

    const item = await DeliveryItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Delivery item not found' });
    }

    // Verify the item belongs to the deliverer's schedule
    const schedule = await DeliverySchedule.findOne({
      _id: item.scheduleId,
      personnelId: req.user.deliveryPersonnel
    });

    if (!schedule) {
      return res.status(403).json({ message: 'Not authorized to update this delivery' });
    }

    item.photoProof = photoUrl;
    item.updatedAt = new Date();
    await item.save();

    res.status(201).json({ message: 'Delivery proof uploaded successfully', item });
  } catch (error) {
    handleError(res, error);
  }
};

// Get earnings summary
exports.getEarnings = async (req, res) => {
  try {
    const { month, year } = req.query;
    const currentDate = new Date();
    const queryMonth = parseInt(month) || currentDate.getMonth() + 1;
    const queryYear = parseInt(year) || currentDate.getFullYear();

    const personnel = await DeliveryPersonnel.findOne({
      userId: req.user.id
    });

    console.log('Personnel:', personnel);

    if (!personnel) {
      return res.status(404).json({ message: 'Delivery personnel record not found' });
    }

    const earnings = await DelivererPayment.find({
      personnelId: personnel._id,
      paymentMonth: queryMonth,
      paymentYear: queryYear
    })
    .populate({
      path: 'personnelId',
      select: 'commissionRate bankDetails'
    })
    .lean();

    console.log('Earnings:', earnings);

    if (!earnings || earnings.length === 0) {
      return res.json({
        earnings: [{
          month: queryMonth,
          year: queryYear,
          amount: 0,
          status: 'Pending',
          commissionRate: personnel.commissionRate
        }]
      });
    }

    res.json({ earnings });
  } catch (error) {
    handleError(res, error);
  }
};

// Get payment history
exports.getPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const personnel = await DeliveryPersonnel.findOne({
      userId: req.user.id
    });

    if (!personnel) {
      return res.status(404).json({ message: 'Delivery personnel record not found' });
    }

    const payments = await DelivererPayment.find({
      personnelId: personnel._id
    })
    .sort({ paymentYear: -1, paymentMonth: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

    console.log('Payments:', payments);

    const total = await DelivererPayment.countDocuments({
      personnelId: personnel._id
    });

    res.json({
      payments,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Get customers in delivery route
exports.getCustomers = async (req, res) => {
  try {
    const personnel = await DeliveryPersonnel.findOne({
      userId: req.user.id
    });

    if (!personnel) {
      return res.status(404).json({ message: 'Delivery personnel record not found' });
    }

    // Get customers from assigned areas
    const areas = await Area.find({
      _id: { $in: personnel.areasAssigned },
      deliverers: req.user.id
    }).populate({
      path: 'publications',
      select: 'name language publicationType price'
    });

    // Get active subscriptions for these areas
    const subscriptions = await Subscription.find({
      areaId: { $in: areas.map(area => area._id) },
      status: 'Active'
    })
    .populate('userId', 'firstName lastName phone email')
    .populate('addressId', 'streetAddress city state postalCode deliveryInstructions')
    .populate('publicationId', 'name language publicationType')
    .lean();

    // Group by customer
    const customers = subscriptions.reduce((acc, subscription) => {
      const customer = acc.find(c => c.userId._id.toString() === subscription.userId._id.toString());
      
      if (customer) {
        customer.subscriptions.push({
          id: subscription._id,
          publication: subscription.publicationId,
          address: subscription.addressId,
          quantity: subscription.quantity,
          deliveryPreferences: subscription.deliveryPreferences
        });
      } else {
        acc.push({
          userId: subscription.userId,
          subscriptions: [{
            id: subscription._id,
            publication: subscription.publicationId,
            address: subscription.addressId,
            quantity: subscription.quantity,
            deliveryPreferences: subscription.deliveryPreferences
          }]
        });
      }
      
      return acc;
    }, []);

    res.json({ 
      areas,
      customers 
    });
  } catch (error) {
    handleError(res, error);
  }
};



module.exports = exports;