const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');
const { authorizeRole } = require('../middleware/auth');

router.use(authorizeRole(['Customer']));

router.get('/managers', customerController.getManagers);
router.get('/publications', customerController.getPublications);
router.get('/subscriptions', customerController.getSubscriptions);
router.post('/subscriptions', customerController.createSubscription);
router.put('/subscriptions/:id', customerController.updateSubscription);
router.delete('/subscriptions/:id', customerController.cancelSubscription);
router.post('/pause', customerController.requestPause);
router.get('/bills', customerController.getBills);
router.get('/bills/:id', customerController.getBillDetails);
router.post('/payments', customerController.makePayment);
router.get('/payment-history', customerController.getPaymentHistory);
router.post('/addresses', customerController.addAddress);
router.put('/addresses/:id', customerController.updateAddress);
router.get('/delivery-status', customerController.getDeliveryStatus);

module.exports = router;