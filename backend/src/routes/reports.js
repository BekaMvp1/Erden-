/**
 * Роуты отчётов
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();

/**
 * GET /api/reports/daily?date=YYYY-MM-DD
 */
router.get('/daily', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Укажите date' });

    const where = { planned_date: date };

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const sewers = await db.Sewer.findAll({
        where: {},
        include: [{ model: db.Technologist, as: 'Technologist', where: { floor_id: req.allowedFloorId } }],
      });
      where.sewer_id = { [Op.in]: sewers.map((s) => s.id) };
    }

    const ops = await db.OrderOperation.findAll({
      where,
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.Order, as: 'Order', include: [{ model: db.Client, as: 'Client' }] },
        { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }, { model: db.Technologist, as: 'Technologist', include: [{ model: db.Floor, as: 'Floor' }] }] },
      ],
    });

    res.json({ date, operations: ops });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/weekly?from=&to=
 */
router.get('/weekly', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Укажите from и to' });

    const where = { planned_date: { [Op.between]: [from, to] } };

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const sewers = await db.Sewer.findAll({
        include: [{ model: db.Technologist, as: 'Technologist', where: { floor_id: req.allowedFloorId } }],
      });
      where.sewer_id = { [Op.in]: sewers.map((s) => s.id) };
    }

    const ops = await db.OrderOperation.findAll({
      where,
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.Order, as: 'Order' },
        { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }] },
      ],
    });

    let plan = 0;
    let fact = 0;
    for (const op of ops) {
      const norm = parseFloat(op.Operation?.norm_minutes || 0);
      plan += (op.planned_quantity || 0) * norm;
      fact += (op.actual_quantity || 0) * norm;
    }

    res.json({ from, to, plan: Math.round(plan), fact: Math.round(fact), operations: ops });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/monthly?month=YYYY-MM
 */
router.get('/monthly', async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: 'Укажите month' });

    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    const where = { planned_date: { [Op.between]: [from, to] } };

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const sewers = await db.Sewer.findAll({
        include: [{ model: db.Technologist, as: 'Technologist', where: { floor_id: req.allowedFloorId } }],
      });
      where.sewer_id = { [Op.in]: sewers.map((s) => s.id) };
    }

    const ops = await db.OrderOperation.findAll({
      where,
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.Order, as: 'Order' },
        { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }] },
      ],
    });

    let plan = 0;
    let fact = 0;
    for (const op of ops) {
      const norm = parseFloat(op.Operation?.norm_minutes || 0);
      plan += (op.planned_quantity || 0) * norm;
      fact += (op.actual_quantity || 0) * norm;
    }

    res.json({ month, from, to, plan: Math.round(plan), fact: Math.round(fact) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/plan-fact?from=&to=
 */
router.get('/plan-fact', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Укажите from и to' });

    const where = { planned_date: { [Op.between]: [from, to] } };

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const sewers = await db.Sewer.findAll({
        include: [{ model: db.Technologist, as: 'Technologist', where: { floor_id: req.allowedFloorId } }],
      });
      where.sewer_id = { [Op.in]: sewers.map((s) => s.id) };
    }

    const ops = await db.OrderOperation.findAll({
      where,
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.Order, as: 'Order' },
        { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }, { model: db.Technologist, as: 'Technologist', include: [{ model: db.Floor, as: 'Floor' }] }] },
      ],
    });

    const byFloor = {};
    for (const op of ops) {
      const floorName = op.Sewer?.Technologist?.Floor?.name || 'Без цеха пошива';
      if (!byFloor[floorName]) byFloor[floorName] = { plan: 0, fact: 0 };
      const norm = parseFloat(op.Operation?.norm_minutes || 0);
      byFloor[floorName].plan += (op.planned_quantity || 0) * norm;
      byFloor[floorName].fact += (op.actual_quantity || 0) * norm;
    }

    Object.keys(byFloor).forEach((k) => {
      byFloor[k].plan = Math.round(byFloor[k].plan);
      byFloor[k].fact = Math.round(byFloor[k].fact);
    });

    res.json({ from, to, by_floor: byFloor });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
