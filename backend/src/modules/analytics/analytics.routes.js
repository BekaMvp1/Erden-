/**
 * Роуты аналитики — read-only
 */

const express = require('express');
const controller = require('./analytics.controller');

const router = express.Router();

router.get('/overdue', controller.getOverdue);
router.get('/bottlenecks', controller.getBottlenecks);
router.get('/workers', controller.getWorkers);
router.get('/order/:id/timeline', controller.getOrderTimeline);

module.exports = router;
