/**
 * Контроллер помощника
 */

const assistantService = require('./assistant.service');

async function query(req, res, next) {
  try {
    const { question } = req.body || {};
    const result = await assistantService.handleQuery(question);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { query };
