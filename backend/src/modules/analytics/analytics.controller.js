/**
 * Контроллер аналитики — read-only с фильтрами
 */

const analyticsService = require('./analytics.service');

async function getOverdue(req, res, next) {
  try {
    const filters = {
      client: req.query.client,
      days: req.query.days ? parseInt(req.query.days, 10) : 0,
      status: req.query.status,
    };
    const data = await analyticsService.getOverdue(filters);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getBottlenecks(req, res, next) {
  try {
    const filters = {
      days: req.query.days ? parseInt(req.query.days, 10) : undefined,
      step: req.query.step,
    };
    const data = await analyticsService.getBottlenecks(filters);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getWorkers(req, res, next) {
  try {
    const filters = {
      days: req.query.days ? parseInt(req.query.days, 10) : 7,
      step: req.query.step,
    };
    const data = await analyticsService.getWorkers(filters);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getOrderTimeline(req, res, next) {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Некорректный ID заказа' });
    }
    const data = await analyticsService.getOrderTimeline(orderId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOverdue,
  getBottlenecks,
  getWorkers,
  getOrderTimeline,
};
