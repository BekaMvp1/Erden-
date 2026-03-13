/**
 * Роуты planner
 */

const express = require('express');
const controller = require('./planner.controller');

const router = express.Router();

router.get('/priority', controller.getPriority);
router.get('/bottleneck-map', controller.getBottleneckMap);
router.get('/recommendations', controller.getRecommendations);

module.exports = router;
