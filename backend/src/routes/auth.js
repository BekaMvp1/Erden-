/**
 * Роуты аутентификации
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../models');
const { QueryTypes } = require('sequelize');

const router = express.Router();

/**
 * GET /api/auth/debug — проверка БД (для диагностики)
 */
router.get('/debug', async (req, res) => {
  try {
    const result = await db.sequelize.query('SELECT id, email FROM users LIMIT 3', { type: QueryTypes.SELECT });
    const users = Array.isArray(result) ? result : (result && result[0]) || [];
    res.json({ ok: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

/**
 * POST /api/auth/login
 * Вход в систему
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Укажите email и пароль' });
    }

    const emailNorm = email.trim().toLowerCase();

    const rows = await db.sequelize.query(
      'SELECT id, name, email, role, floor_id, is_active, password_hash FROM users WHERE email = $1',
      {
        bind: [emailNorm],
        type: QueryTypes.SELECT,
      }
    );

    const user = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-me';
    const jwtExpires = process.env.JWT_EXPIRES_IN || '24h';

    const token = jwt.sign(
      { userId: user.id },
      jwtSecret,
      { expiresIn: jwtExpires }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        floor_id: user.floor_id,
      },
    });
  } catch (err) {
    console.error('Ошибка login:', err.message, err.stack);
    res.status(500).json({
      error: err.message || 'Внутренняя ошибка сервера',
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });
  }
});

module.exports = router;
