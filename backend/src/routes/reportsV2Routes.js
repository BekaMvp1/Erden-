/**
 * Роуты отчётов v2
 * GET /api/reports/v2/kpi, floors, technologists, sewers, orders-late, plan-fact, export.csv
 */

const express = require('express');
const controller = require('../controllers/reportsV2Controller');

const router = express.Router();

router.get('/kpi', controller.getKpi);
router.get('/floors', controller.getFloors);
router.get('/technologists', controller.getTechnologists);
router.get('/sewers', controller.getSewers);
router.get('/orders-late', controller.getOrdersLate);
router.get('/plan-fact', controller.getPlanFact);
router.get('/export.csv', controller.exportCsv);

module.exports = router;
