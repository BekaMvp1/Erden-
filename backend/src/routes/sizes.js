/**
 * Роуты справочника размеров (ростовка: code 40–56, S–5XL, type NUMERIC/ALPHA).
 * GET /api/sizes — список с code, type, sort_order для ростовки.
 * POST /api/sizes — добавить размер (admin/manager или при создании заказа).
 */

const express = require('express');
const db = require('../models');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const sizes = await db.Size.findAll({
      where: { is_active: true },
      order: [
        ['type', 'ASC'],
        ['sort_order', 'ASC'],
        ['id', 'ASC'],
      ],
      attributes: ['id', 'name', 'code', 'type', 'sort_order'],
    });
    res.json(sizes);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите название размера' });
    }
    const trimmed = String(name).trim();
    const existing = await db.Size.findOne({ where: { name: trimmed } });
    if (existing) {
      return res.json(existing);
    }
    const size = await db.Size.create({ name: trimmed, is_active: true });
    res.status(201).json(size);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
