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
  DeliverySummaryReport,
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
    const areas = await Area.find({ managers: req.user._id });
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
    console.log('addDeliverer: Input:', { areaId, email, userId: req.user._id });

    // Validate input
    if (!areaId || !email) {
      return res.status(400).json({ message: 'Area ID and email are required' });
    }

    // Check area access
    const area = await Area.findOne({ _id: areaId, managers: req.user._id });
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
        managers: req.user._id
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
    const areas = await Area.find({ managers: req.user._id });
    const areaIds = areas.map(area => area._id);

    const requests = await SubscriptionChangeRequest.find({
      status: 'Pending'
    })
    .populate({
      path: 'subscriptionId',
      match: { areaId: { $in: areaIds } }
    })
    .populate('userId', 'firstName lastName email')
    .populate('publicationId')
    .populate('newAddressId')
    .lean();

    // Filter out requests for subscriptions not in manager's areas
    const validRequests = requests.filter(req => req.subscriptionId);

    res.json({ requests: validRequests });
  } catch (error) {
    handleError(res, error);
  }
};

// Handle subscription request
exports.handleSubscriptionRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status, comments } = req.body;

    const request = await SubscriptionChangeRequest.findById(id)
      .populate('subscriptionId')
      .populate('publicationId');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Verify the subscription is in manager's area
    const area = await Area.findOne({
      _id: request.subscriptionId.areaId,
      managers: req.user._id
    });

    if (!area) {
      return res.status(403).json({ message: 'Not authorized to handle this request' });
    }

    request.status = status;
    request.processedBy = req.user._id;
    request.processedDate = new Date();
    request.comments = comments;

    if (status === 'Approved') {
      switch (request.requestType) {
        case 'New':
          await Subscription.create([{
            userId: request.userId,
            publicationId: request.publicationId._id,
            quantity: request.newQuantity || 1,
            startDate: request.effectiveDate,
            addressId: request.newAddressId,
            areaId: area._id
          }], { session });
          break;

        case 'Modify':
          const subscription = await Subscription.findById(request.subscriptionId);
          if (request.newQuantity) subscription.quantity = request.newQuantity;
          if (request.newAddressId) subscription.addressId = request.newAddressId;
          await subscription.save({ session });
          break;

        case 'Cancel':
          await Subscription.findByIdAndUpdate(
            request.subscriptionId,
            {
              status: 'Cancelled',
              endDate: request.effectiveDate
            },
            { session }
          );
          break;
      }
    }

    await request.save({ session });
    await session.commitTransaction();

    res.json({ 
      message: 'Subscription request handled successfully',
      request
    });
  } catch (error) {
    await session.abortTransaction();
    handleError(res, error);
  } finally {
    session.endSession();
  }
};

// Get delivery schedules
exports.getSchedules = async (req, res) => {
  try {
    const { date } = req.query;
    const queryDate = date ? new Date(date) : new Date();
    queryDate.setHours(0, 0, 0, 0);

    const areas = await Area.find({ managers: req.user._id });
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
  try {
    const { personnelId, date, areaId, routeId, notes } = req.body;

    // Verify area belongs to manager
    const area = await Area.findOne({
      _id: areaId,
      managers: req.user._id
    });

    if (!area) {
      return res.status(403).json({ message: 'Not authorized to create schedule for this area' });
    }

    const schedule = await DeliverySchedule.create({
      personnelId,
      date,
      areaId,
      routeId,
      notes,
      status: 'Pending'
    });

    res.status(201).json({ 
      message: 'Schedule created successfully',
      schedule
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Get bills
exports.getBills = async (req, res) => {
  try {
    const { month, year, status } = req.query;
    const areas = await Area.find({ managers: req.user._id });
    const areaIds = areas.map(area => area._id);

    const query = {
      areaId: { $in: areaIds }
    };

    if (month) query.billMonth = parseInt(month);
    if (year) query.billYear = parseInt(year);
    if (status) query.status = status;

    const bills = await Bill.find(query)
      .populate('userId', 'firstName lastName email')
      .populate({
        path: 'billItems',
        populate: {
          path: 'publicationId',
          select: 'name price'
        }
      })
      .lean();

    res.json({ bills });
  } catch (error) {
    handleError(res, error);
  }
};

// Generate bills
exports.generateBills = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { month, year } = req.body;
    const areas = await Area.find({ managers: req.user._id });
    const areaIds = areas.map(area => area._id);

    // Get all active subscriptions in manager's areas
    const subscriptions = await Subscription.find({
      areaId: { $in: areaIds },
      status: 'Active'
    })
    .populate('publicationId')
    .populate('userId');

    const bills = [];
    const billItems = [];

    for (const subscription of subscriptions) {
      let existingBill = bills.find(b => 
        b.userId.toString() === subscription.userId._id.toString() &&
        b.areaId.toString() === subscription.areaId.toString()
      );

      if (!existingBill) {
        existingBill = {
          userId: subscription.userId._id,
          billDate: new Date(),
          billMonth: month,
          billYear: year,
          totalAmount: 0,
          dueDate: new Date(year, month, 15), // Due on 15th of billing month
          status: 'Unpaid',
          areaId: subscription.areaId,
          billNumber: `BILL-${year}${month.toString().padStart(2, '0')}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          outstandingAmount: 0
        };
        bills.push(existingBill);
      }

      const amount = subscription.publicationId.price * subscription.quantity;
      existingBill.totalAmount += amount;
      existingBill.outstandingAmount += amount;

      billItems.push({
        billId: existingBill._id,
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

    const createdBills = await Bill.create(bills, { session });
    const billIds = createdBills.map(bill => bill._id);
    
    // Update billId in billItems
    billItems.forEach(item => {
      const bill = createdBills.find(b => 
        b.userId.toString() === item.userId.toString() &&
        b.areaId.toString() === item.areaId.toString()
      );
      item.billId = bill._id;
    });

    await BillItem.create(billItems, { session });

    await session.commitTransaction();
    res.status(201).json({ 
      message: 'Bills generated successfully',
      billIds
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
    const areas = await Area.find({ managers: req.user._id });
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
    const areas = await Area.find({ managers: req.user._id });
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
    const areas = await Area.find({ managers: req.user._id });
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
        generatedBy: req.user._id,
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
    const areas = await Area.find({ managers: req.user._id });
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
    const areas = await Area.find({ managers: req.user._id });
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

module.exports = exports;