/**
 * Роуты справочника цехов
 * GET /api/workshops — список цехов
 */

const express = require('express');
const db = require('../models');

const router = express.Router();

/**
 * GET /api/workshops
 * Список активных цехов
 */
router.get('/', async (req, res, next) => {
  try {
    const workshops = await db.Workshop.findAll({
      where: { is_active: true },
      order: [['id']],
      attributes: ['id', 'name', 'floors_count'],
    });
    res.json(workshops);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
