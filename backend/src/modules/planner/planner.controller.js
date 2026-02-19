/**
 * Контроллер planner
 */

const plannerService = require('./planner.service');

async function getPriority(req, res, next) {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 7;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const data = await plannerService.getPriority({ days, limit });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getBottleneckMap(req, res, next) {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 7;
    const data = await plannerService.getBottleneckMap({ days });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getRecommendations(req, res, next) {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 7;
    const data = await plannerService.getRecommendations({ days });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPriority,
  getBottleneckMap,
  getRecommendations,
};
