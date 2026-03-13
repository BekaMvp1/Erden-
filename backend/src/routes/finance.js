/**
 * Роуты финансового модуля (БДР/БДДС)
 * admin/manager — редактирование плана и факта
 * technologist/operator — только просмотр
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');

const router = express.Router();

const MONTHS_2026 = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];

/** Проверка прав на редактирование */
const canEditFinance = (req) => ['admin', 'manager'].includes(req.user?.role);

/**
 * GET /api/finance/2026/bdr
 * Таблица БДР 2026: категории × месяцы, план + факт
 */
router.get('/2026/bdr', async (req, res, next) => {
  try {
    const data = await buildFinanceTable('BDR');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/finance/2026/bdds
 * Таблица БДДС 2026: категории × месяцы, план + факт
 */
router.get('/2026/bdds', async (req, res, next) => {
  try {
    const data = await buildFinanceTable('BDDS');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

async function buildFinanceTable(type) {
  const categories = await db.FinanceCategory.findAll({
    where: { type },
    order: [['sort_order', 'ASC'], ['id', 'ASC']],
  });

  const plans = await db.FinancePlan2026.findAll({
    where: { type },
    include: [{ model: db.FinanceCategory, as: 'FinanceCategory' }],
  });

  const facts = await db.FinanceFact.findAll({
    where: { type },
    attributes: ['category_id', 'date', 'amount'],
    raw: true,
  });

  const factByCategoryMonth = {};
  for (const f of facts) {
    const month = String(f.date).slice(0, 7);
    const key = `${f.category_id}_${month}`;
    factByCategoryMonth[key] = (factByCategoryMonth[key] || 0) + parseFloat(f.amount);
  }

  const planByCategoryMonth = {};
  for (const p of plans) {
    const key = `${p.category_id}_${p.month}`;
    planByCategoryMonth[key] = parseFloat(p.planned_amount);
  }

  const rows = categories.map((cat) => {
    const row = {
      category_id: cat.id,
      category_name: cat.name,
      months: {},
      row_planned_total: 0,
      row_fact_total: 0,
    };
    for (const month of MONTHS_2026) {
      const planVal = planByCategoryMonth[`${cat.id}_${month}`] ?? 0;
      const factVal = factByCategoryMonth[`${cat.id}_${month}`] ?? 0;
      row.months[month] = { planned_amount: planVal, fact_amount: factVal };
      row.row_planned_total += planVal;
      row.row_fact_total += factVal;
    }
    return row;
  });

  const totals = { planned: {}, fact: {} };
  for (const month of MONTHS_2026) {
    totals.planned[month] = 0;
    totals.fact[month] = 0;
    for (const row of rows) {
      totals.planned[month] += row.months[month].planned_amount;
      totals.fact[month] += row.months[month].fact_amount;
    }
  }

  return {
    type,
    categories: rows,
    months: MONTHS_2026,
    totals,
  };
}

/**
 * PUT /api/finance/plan
 * Обновление планового значения. Только admin/manager.
 */
router.put('/plan', async (req, res, next) => {
  try {
    if (!canEditFinance(req)) {
      return res.status(403).json({ error: 'Недостаточно прав для редактирования плана' });
    }

    const { type, category_id, month, planned_amount } = req.body;
    if (!type || !category_id || !month) {
      return res.status(400).json({ error: 'Укажите type, category_id, month' });
    }
    if (!['BDR', 'BDDS'].includes(type)) {
      return res.status(400).json({ error: 'type должен быть BDR или BDDS' });
    }

    const cat = await db.FinanceCategory.findByPk(category_id);
    if (!cat || cat.type !== type) {
      return res.status(400).json({ error: 'Категория не найдена или не соответствует типу' });
    }

    const amount = parseFloat(planned_amount);
    if (isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: 'planned_amount должен быть числом >= 0' });
    }

    const [plan, created] = await db.FinancePlan2026.findOrCreate({
      where: { type, category_id, month },
      defaults: { planned_amount: amount },
    });

    if (!created) {
      await plan.update({ planned_amount: amount });
    }

    await logAudit(req.user.id, 'UPDATE', 'finance_plan', plan.id);

    res.json({ ok: true, plan: plan.toJSON() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/finance/fact
 * Добавление факта. Только admin/manager.
 */
router.post('/fact', async (req, res, next) => {
  try {
    if (!canEditFinance(req)) {
      return res.status(403).json({ error: 'Недостаточно прав для добавления факта' });
    }

    const { type, category_id, date, amount, comment, order_id } = req.body;
    if (!type || !category_id || !date || amount === undefined) {
      return res.status(400).json({ error: 'Укажите type, category_id, date, amount' });
    }
    if (!['BDR', 'BDDS'].includes(type)) {
      return res.status(400).json({ error: 'type должен быть BDR или BDDS' });
    }

    const cat = await db.FinanceCategory.findByPk(category_id);
    if (!cat || cat.type !== type) {
      return res.status(400).json({ error: 'Категория не найдена или не соответствует типу' });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
      return res.status(400).json({ error: 'amount должен быть числом' });
    }

    const fact = await db.FinanceFact.create({
      type,
      category_id,
      date,
      amount: amountNum,
      comment: comment || null,
      order_id: order_id || null,
    });

    await logAudit(req.user.id, 'CREATE', 'finance_fact', fact.id);

    res.status(201).json(fact);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
