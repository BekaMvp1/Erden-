/**
 * Роуты панели заказов
 */

const express = require('express');
const { getBoardOrders } = require('../controllers/boardController');

const router = express.Router();

router.get('/orders', getBoardOrders);

module.exports = router;
