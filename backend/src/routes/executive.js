/**
 * Роуты Executive Dashboard
 * Управленческая панель и автоматический контроль производства
 */

const express = require('express');
const { getSummary, getAlerts } = require('../controllers/executiveController');

const router = express.Router();

// GET /api/executive/summary — ключевые показатели
router.get('/summary', getSummary);

// GET /api/executive/alerts — предупреждения автоконтроля
router.get('/alerts', getAlerts);

module.exports = router;
