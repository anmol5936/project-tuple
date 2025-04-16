const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Users Schema - Base for all user types
const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    required: true, 
    enum: ['Manager', 'Deliverer', 'Customer'] 
  },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  dateCreated: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  areas: [{ type: Schema.Types.ObjectId, ref: 'Area' }],
  defaultAddress: { type: Schema.Types.ObjectId, ref: 'Address' },
  notificationPreferences: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false }
  }
});

// Area Schema - Represents geographical regions
const AreaSchema = new Schema({
    name: { type: String, required: true },
    description: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCodes: [{ type: String }],
    managers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    deliverers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    customers: [{ type: Schema.Types.ObjectId, ref: 'User' }],  // Fixed capitalization
    publications: [{ type: Schema.Types.ObjectId, ref: 'Publication' }],
    isActive: { type: Boolean, default: true }
  });

// Address Schema

const AddressSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  streetAddress: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  postalCode: { type: String, required: true },
  areaId: { type: Schema.Types.ObjectId, ref: 'Area' },
  latitude: { type: Number },
  longitude: { type: Number },
  deliveryInstructions: { type: String },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
});

// Publication Schema
const PublicationSchema = new Schema({
  name: { type: String, required: true },
  language: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  publicationType: { 
    type: String, 
    required: true, 
    enum: ['Daily', 'Weekly', 'Monthly', 'Quarterly'] 
  },
  publicationDays: [{
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  }],
  managerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  areas: [{ type: Schema.Types.ObjectId, ref: 'Area' }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Subscription Schema
const SubscriptionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  publicationId: { type: Schema.Types.ObjectId, ref: 'Publication', required: true },
  quantity: { type: Number, default: 1 },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  status: { 
    type: String, 
    default: 'Active', 
    enum: ['Active', 'Paused', 'Cancelled', 'Suspended'] 
  },
  addressId: { type: Schema.Types.ObjectId, ref: 'Address', required: true },
  areaId: { type: Schema.Types.ObjectId, ref: 'Area' },
  delivererId: { type: Schema.Types.ObjectId, ref: 'User' },
  deliveryPreferences: {
    placement: { type: String, default: 'Door' },
    additionalInstructions: { type: String }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Subscription Change Request Schema
const subscriptionChangeRequestSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  requestType: {
    type: String,
    enum: ['New', 'Update', 'Cancel'],
    required: true,
  },
  subscriptionId: {
    type: Schema.Types.ObjectId,
    ref: 'Subscription',
  },
  publicationId: {
    type: Schema.Types.ObjectId,
    ref: 'Publication',
  },
  newQuantity: Number,
  newAddressId: {
    type: Schema.Types.ObjectId,
    ref: 'Address',
  },
  deliveryPreferences: {
    placement: String,
    additionalInstructions: String,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  requestDate: {
    type: Date,
    default: Date.now,
  },
  effectiveDate: {
    type: Date,
    required: true,
  },
  comments: String,
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  processedDate: Date,
});

// Subscription Pause Schema
const SubscriptionPauseSchema = new Schema({
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Delivery Personnel Schema
const DeliveryPersonnelSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  joiningDate: { type: Date, required: true },
  areasAssigned: [{ type: Schema.Types.ObjectId, ref: 'Area' }],
  isActive: { type: Boolean, default: true },
  manager: { type: Schema.Types.ObjectId, ref: 'User' },
  bankDetails: {
    accountName: { type: String },
    accountNumber: { type: String },
    bankName: { type: String },
    ifscCode: { type: String }
  },
  commissionRate: { type: Number, default: 2.5 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Delivery Route Schema
const DeliveryRouteSchema = new Schema({
  personnelId: { type: Schema.Types.ObjectId, ref: 'DeliveryPersonnel', required: true },
  routeName: { type: String, required: true },
  routeDescription: { type: String },
  areaId: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
  optimizationCriteria: {
    type: String,
    default: 'Distance',
    enum: ['Distance', 'Time', 'Custom']
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Route Address Schema
const RouteAddressSchema = new Schema({
  routeId: { type: Schema.Types.ObjectId, ref: 'DeliveryRoute', required: true },
  addressId: { type: Schema.Types.ObjectId, ref: 'Address', required: true },
  sequenceNumber: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Daily Delivery Schedule Schema
const DeliveryScheduleSchema = new Schema({
  personnelId: { type: Schema.Types.ObjectId, ref: 'DeliveryPersonnel', required: true },
  date: { type: Date, required: true },
  status: { 
    type: String, 
    default: 'Pending', 
    enum: ['Pending', 'In Progress', 'Completed'] 
  },
  areaId: { type: Schema.Types.ObjectId, ref: 'Area' },
  routeId: { type: Schema.Types.ObjectId, ref: 'DeliveryRoute' },
  startTime: { type: Date },
  endTime: { type: Date },
  notes: { type: String },
  weatherConditions: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Delivery Items Schema
const DeliveryItemSchema = new Schema({
  scheduleId: { type: Schema.Types.ObjectId, ref: 'DeliverySchedule', required: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
  addressId: { type: Schema.Types.ObjectId, ref: 'Address', required: true },
  publicationId: { type: Schema.Types.ObjectId, ref: 'Publication', required: true },
  quantity: { type: Number, default: 1 },
  status: { 
    type: String, 
    default: 'Pending', 
    enum: ['Pending', 'Delivered', 'Failed', 'Skipped'] 
  },
  deliveryNotes: { type: String },
  deliveryTime: { type: Date },
  photoProof: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Bill Schema
const BillSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  billDate: { type: Date, required: true },
  billMonth: { type: Number, required: true },
  billYear: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  status: { 
    type: String, 
    default: 'Unpaid', 
    enum: ['Unpaid', 'Partially Paid', 'Paid', 'Overdue'] 
  },
  areaId: { type: Schema.Types.ObjectId, ref: 'Area' },
  billNumber: { type: String, required: true, unique: true },
  outstandingAmount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Bill Items Schema
const BillItemSchema = new Schema({
  billId: { type: Schema.Types.ObjectId, ref: 'Bill', required: true },
  publicationId: { type: Schema.Types.ObjectId, ref: 'Publication', required: true },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  deliveryPeriod: {
    from: { type: Date, required: true },
    to: { type: Date, required: true }
  },
  createdAt: { type: Date, default: Date.now }
});

// Payment Schema
const PaymentSchema = new Schema({
  billId: { type: Schema.Types.ObjectId, ref: 'Bill', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  paymentDate: { type: Date, required: true },
  amount: { type: Number, required: true },
  paymentMethod: { 
    type: String, 
    required: true, 
    enum: ['Cash', 'Cheque', 'Online', 'UPI', 'Card'] 
  },
  referenceNumber: { type: String },
  receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { 
    type: String, 
    default: 'Completed', 
    enum: ['Pending', 'Completed', 'Failed', 'Refunded'] 
  },
  receiptNumber: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Payment Reminder Schema
const PaymentReminderSchema = new Schema({
  billId: { type: Schema.Types.ObjectId, ref: 'Bill', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reminderDate: { type: Date, required: true },
  reminderType: { 
    type: String, 
    required: true, 
    enum: ['First Notice', 'Final Notice', 'Subscription Suspension Notice'] 
  },
  message: { type: String, required: true },
  status: { 
    type: String, 
    default: 'Pending', 
    enum: ['Pending', 'Sent', 'Resolved'] 
  },
  deliveryMethod: {
    type: String,
    enum: ['Email', 'SMS', 'Print'],
    default: 'Print'
  },
  sentAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Deliverer Payment Schema
const DelivererPaymentSchema = new Schema({
  personnelId: { type: Schema.Types.ObjectId, ref: 'DeliveryPersonnel', required: true },
  paymentMonth: { type: Number, required: true },
  paymentYear: { type: Number, required: true },
  amount: { type: Number, required: true },
  commissionRate: { type: Number, default: 2.5 },
  paymentDate: { type: Date },
  status: { 
    type: String, 
    default: 'Pending', 
    enum: ['Pending', 'Paid'] 
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Cheque'],
    default: 'Bank Transfer'
  },
  transactionId: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Deliverer Payment Details Schema
const DelivererPaymentDetailSchema = new Schema({
  paymentId: { type: Schema.Types.ObjectId, ref: 'DelivererPayment', required: true },
  publicationId: { type: Schema.Types.ObjectId, ref: 'Publication', required: true },
  deliveryCount: { type: Number, required: true },
  publicationValue: { type: Number, required: true },
  commissionAmount: { type: Number, required: true },
  areaId: { type: Schema.Types.ObjectId, ref: 'Area' },
  createdAt: { type: Date, default: Date.now }
});

// Delivery Summary Report Schema
const DeliverySummaryReportSchema = new Schema({
  reportMonth: { type: Number, required: true },
  reportYear: { type: Number, required: true },
  generatedDate: { type: Date, required: true },
  generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reportData: { type: Object },
  publications: [{
    publicationId: { type: Schema.Types.ObjectId, ref: 'Publication' },
    totalDelivered: { type: Number },
    revenue: { type: Number }
  }],
  areaId: { type: Schema.Types.ObjectId, ref: 'Area' },
  totalRevenue: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

// Customer Activity Log Schema
const CustomerActivitySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  activityType: {
    type: String,
    enum: ['New Subscription', 'Cancellation', 'Modification', 'Pause Request', 'Payment', 'Address Update'],
    required: true
  },
  details: { type: String },
  timestamp: { type: Date, default: Date.now }
});

// System Log Schema
const SystemLogSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  actionType: { type: String, required: true },
  actionDetails: { type: String },
  ipAddress: { type: String },
  timestamp: { type: Date, default: Date.now }
});

// Create models from schemas
const User = mongoose.model('User', UserSchema);
const Area = mongoose.model('Area', AreaSchema);
const Address = mongoose.model('Address', AddressSchema);
const Publication = mongoose.model('Publication', PublicationSchema);
const Subscription = mongoose.model('Subscription', SubscriptionSchema);
const SubscriptionChangeRequest = mongoose.model('SubscriptionChangeRequest', subscriptionChangeRequestSchema);
const SubscriptionPause = mongoose.model('SubscriptionPause', SubscriptionPauseSchema);
const DeliveryPersonnel = mongoose.model('DeliveryPersonnel', DeliveryPersonnelSchema);
const DeliveryRoute = mongoose.model('DeliveryRoute', DeliveryRouteSchema);
const RouteAddress = mongoose.model('RouteAddress', RouteAddressSchema);
const DeliverySchedule = mongoose.model('DeliverySchedule', DeliveryScheduleSchema);
const DeliveryItem = mongoose.model('DeliveryItem', DeliveryItemSchema);
const Bill = mongoose.model('Bill', BillSchema);
const BillItem = mongoose.model('BillItem', BillItemSchema);
const Payment = mongoose.model('Payment', PaymentSchema);
const PaymentReminder = mongoose.model('PaymentReminder', PaymentReminderSchema);
const DelivererPayment = mongoose.model('DelivererPayment', DelivererPaymentSchema);
const DelivererPaymentDetail = mongoose.model('DelivererPaymentDetail', DelivererPaymentDetailSchema);
const DeliverySummaryReport = mongoose.model('DeliverySummaryReport', DeliverySummaryReportSchema);
const CustomerActivity = mongoose.model('CustomerActivity', CustomerActivitySchema);
const SystemLog = mongoose.model('SystemLog', SystemLogSchema);

// Export all models
module.exports = {
  User,
  Area,
  Address,
  Publication,
  Subscription,
SubscriptionChangeRequest,
  SubscriptionPause,
  DeliveryPersonnel,
  DeliveryRoute,
  RouteAddress,
  DeliverySchedule,
  DeliveryItem,
  Bill,
  BillItem,
  Payment,
  PaymentReminder,
  DelivererPayment,
  DelivererPaymentDetail,
  DeliverySummaryReport,
  CustomerActivity,
  SystemLog
};