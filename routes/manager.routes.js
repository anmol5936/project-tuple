const express = require('express');
const router = express.Router();
const managerController = require('../controllers/manager.controller');
const { authorizeRole,authenticateToken } = require('../middleware/auth');

router.use(authenticateToken,authorizeRole(['Manager']));

router.get('/areas', managerController.getAreas);
router.post('/routes', managerController.createRoute);
router.get('/customers', managerController.getCustomers);
router.get('/deliverers', managerController.getDeliverers);
router.post('/deliverers', managerController.addDeliverer);
router.get('/publications', managerController.getPublications);
router.post('/publications', managerController.addPublication);
router.put('/publications/:id', managerController.updatePublication);
router.get('/subscription-requests', managerController.getSubscriptionRequests);
router.put('/subscription-requests/:id', managerController.handleSubscriptionRequest);
router.get('/schedules', managerController.getSchedules);
router.post('/schedules', managerController.createSchedule);
router.get('/bills', managerController.getBills);
router.post('/bills/generate', managerController.generateBills);
router.get('/payments', managerController.getPayments);
router.post('/payment-reminders', managerController.sendPaymentReminders);
router.get('/reports/delivery', managerController.generateDeliveryReport);
router.get('/reports/financial', managerController.generateFinancialReport);
router.post('/deliverer-payments', managerController.processDelivererPayments);
// In manager routes
router.get('/personnel/:userId', managerController.getPersonnelIdByUserId);
router.get('/routes', managerController.getRoutes);


module.exports = router;