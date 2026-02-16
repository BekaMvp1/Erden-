/**
 * Роут ИИ-ассистента
 * POST /api/ai/query
 */

const express = require('express');
const { processQuery } = require('../services/aiAnalytics');

const router = express.Router();

/**
 * POST /api/ai/query
 * Принимает { query: "текст" }, возвращает { summary, data, chart }
 */
router.post('/query', async (req, res, next) => {
  try {
    const { query } = req.body;
    const text = typeof query === 'string' ? query : '';
    const result = await processQuery(text, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
