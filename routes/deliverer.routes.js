const express = require('express');
const router = express.Router();
const delivererController = require('../controllers/deliverer.controller');
const { authorizeRole,authenticateToken } = require('../middleware/auth');

router.use(authenticateToken,authorizeRole(['Deliverer']));

router.get('/routes', delivererController.getRoutes);
router.get('/schedule', delivererController.getSchedule);
router.get('/items', delivererController.getDeliveryItems);
router.put('/items/:id', delivererController.updateDeliveryStatus);
router.post('/delivery-proof', delivererController.uploadDeliveryProof);
router.get('/earnings', delivererController.getEarnings);
router.get('/payment-history', delivererController.getPaymentHistory);
router.get('/customers', delivererController.getCustomers);


module.exports = router;