/**
 * Роуты клиентов
 * GET /api/clients — список клиентов
 */

const express = require('express');
const db = require('../models');

const router = express.Router();

/**
 * GET /api/clients
 * Список клиентов из БД
 */
router.get('/', async (req, res, next) => {
  try {
    const clients = await db.Client.findAll({ order: [['name']] });
    res.json(clients);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
