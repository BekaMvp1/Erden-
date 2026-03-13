/**
 * План пошива по размерной матрице: план и факт по этажам и размерам.
 * Учёт только по размерам, общее количество не хранится отдельно.
 * sewing_total = SUM(fact_qty).
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();

/** GET /api/sewing-plans/order/:orderId/size-matrix — размерная матрица заказа */
router.get('/order/:orderId/size-matrix', async (req, res, next) => {
  try {
    const order = await db.Order.findByPk(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const rows = await db.OrderSizeMatrix.findAll({
      where: { order_id: order.id },
      include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }],
      order: [['model_size_id']],
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sewing-plans/order/:orderId/size-matrix — сохранить размерную матрицу заказа.
 * body: { items: [{ model_size_id, planned_qty }] }
 * Сохраняет только по размерам, не общее количество.
 */
router.put('/order/:orderId/size-matrix', async (req, res, next) => {
  try {
    const order = await db.Order.findByPk(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Укажите items: массив { model_size_id, planned_qty }' });
    }
    const orderId = order.id;
    for (const it of items) {
      const model_size_id = it.model_size_id;
      const planned_qty = Math.max(0, parseInt(it.planned_qty, 10) || 0);
      if (!model_size_id) continue;
      const [row] = await db.OrderSizeMatrix.findOrCreate({
        where: { order_id: orderId, model_size_id: Number(model_size_id) },
        defaults: { order_id: orderId, model_size_id: Number(model_size_id), planned_qty: 0 },
      });
      await row.update({ planned_qty });
    }
    const rows = await db.OrderSizeMatrix.findAll({
      where: { order_id: orderId },
      include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }],
      order: [['model_size_id']],
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** GET /api/sewing-plans/plans?order_id=&floor_id=&date=&from=&to= — план/факт по этажам и размерам */
router.get('/plans', async (req, res, next) => {
  try {
    const { order_id, floor_id, date, from, to } = req.query;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    const where = { order_id: Number(order_id) };
    if (floor_id) where.floor_id = Number(floor_id);
    if (date) where.date = date;
    if (from && to) where.date = { [Op.between]: [from, to] };
    const list = await db.SewingPlan.findAll({
      where,
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] },
        { model: db.BuildingFloor, as: 'BuildingFloor' },
      ],
      order: [['date'], ['floor_id'], ['model_size_id']],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sewing-plans/plans — создать или обновить запись плана пошива.
 * body: { order_id, floor_id, model_size_id, date, planned_qty?, fact_qty? }
 */
router.post('/plans', async (req, res, next) => {
  try {
    const { order_id, floor_id, model_size_id, date, planned_qty, fact_qty } = req.body;
    if (!order_id || !floor_id || !model_size_id || !date) {
      return res.status(400).json({ error: 'Укажите order_id, floor_id, model_size_id, date' });
    }
    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const floor = await db.BuildingFloor.findByPk(floor_id);
    if (!floor) return res.status(404).json({ error: 'Этаж не найден' });
    const ms = await db.ModelSize.findByPk(model_size_id);
    if (!ms) return res.status(404).json({ error: 'Размер модели не найден' });
    const dateStr = String(date).slice(0, 10);
    const [row, created] = await db.SewingPlan.findOrCreate({
      where: {
        order_id: Number(order_id),
        floor_id: Number(floor_id),
        model_size_id: Number(model_size_id),
        date: dateStr,
      },
      defaults: {
        order_id: Number(order_id),
        floor_id: Number(floor_id),
        model_size_id: Number(model_size_id),
        date: dateStr,
        planned_qty: 0,
        fact_qty: 0,
      },
    });
    const updates = {};
    if (planned_qty !== undefined) updates.planned_qty = Math.max(0, parseInt(planned_qty, 10) || 0);
    if (fact_qty !== undefined) updates.fact_qty = Math.max(0, parseInt(fact_qty, 10) || 0);
    if (Object.keys(updates).length) await row.update(updates);
    const out = await db.SewingPlan.findByPk(row.id, {
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] },
        { model: db.BuildingFloor, as: 'BuildingFloor' },
      ],
    });
    res.status(created ? 201 : 200).json(out);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sewing-plans/plans/assign-floor — этаж получает всю модель.
 * Создаёт записи для каждого размера из размерной матрицы заказа с planned_qty из матрицы.
 * body: { order_id, floor_id, date }
 * Пример: floor_id=2, в матрице 42→250, 44→250, 46→250, 48→250 — создаются 4 записи sewing_plans.
 */
router.post('/plans/assign-floor', async (req, res, next) => {
  try {
    const { order_id, floor_id, date } = req.body;
    if (!order_id || !floor_id || !date) {
      return res.status(400).json({ error: 'Укажите order_id, floor_id, date' });
    }
    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const floor = await db.BuildingFloor.findByPk(floor_id);
    if (!floor) return res.status(404).json({ error: 'Этаж не найден' });
    const dateStr = String(date).slice(0, 10);
    const matrixRows = await db.OrderSizeMatrix.findAll({
      where: { order_id: Number(order_id) },
      include: [{ model: db.ModelSize, as: 'ModelSize' }],
    });
    if (matrixRows.length === 0) {
      return res.status(400).json({ error: 'Сначала заполните размерную матрицу заказа' });
    }
    const created = [];
    for (const m of matrixRows) {
      const planned_qty = Math.max(0, parseInt(m.planned_qty, 10) || 0);
      const [row, wasCreated] = await db.SewingPlan.findOrCreate({
        where: {
          order_id: Number(order_id),
          floor_id: Number(floor_id),
          model_size_id: m.model_size_id,
          date: dateStr,
        },
        defaults: {
          order_id: Number(order_id),
          floor_id: Number(floor_id),
          model_size_id: m.model_size_id,
          date: dateStr,
          planned_qty,
          fact_qty: 0,
        },
      });
      if (!wasCreated) await row.update({ planned_qty });
      created.push(row);
    }
    const list = await db.SewingPlan.findAll({
      where: {
        order_id: Number(order_id),
        floor_id: Number(floor_id),
        date: dateStr,
      },
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] },
        { model: db.BuildingFloor, as: 'BuildingFloor' },
      ],
      order: [['model_size_id']],
    });
    res.status(201).json(list);
  } catch (err) {
    next(err);
  }
});

/** PUT /api/sewing-plans/plans/:id/fact — ввод факта по размеру. body: { fact_qty } */
router.put('/plans/:id/fact', async (req, res, next) => {
  try {
    const row = await db.SewingPlan.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Запись плана не найдена' });
    const fact_qty = Math.max(0, parseInt(req.body.fact_qty, 10) || 0);
    await row.update({ fact_qty });
    const out = await db.SewingPlan.findByPk(row.id, {
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] },
        { model: db.BuildingFloor, as: 'BuildingFloor' },
      ],
    });
    res.json(out);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sewing-plans/batches/finish — внутренний/резервный endpoint: создать партию DONE из факта пошива.
 * В UI партия создаётся только при «Завершить пошив → ОТК» на странице Пошив (POST /api/sewing/complete).
 * body: { order_id, floor_id, date_from?, date_to? }
 * Факт хранится по дням в sewing_plans. Агрегируем SUM(fact_qty); при сумме > 0 создаём партию и sewing_batch_items.
 */
router.post('/batches/finish', async (req, res, next) => {
  try {
    const { order_id, floor_id, date_from, date_to } = req.body;
    if (!order_id || !floor_id) {
      return res.status(400).json({ error: 'Укажите order_id и floor_id' });
    }
    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const floor = await db.BuildingFloor.findByPk(floor_id);
    if (!floor) return res.status(404).json({ error: 'Этаж не найден' });

    const replacements = {
      order_id: Number(order_id),
      floor_id: Number(floor_id),
      ...(date_from && date_to ? { date_from: String(date_from).slice(0, 10), date_to: String(date_to).slice(0, 10) } : {}),
    };
    const dateClause = date_from && date_to ? 'AND date BETWEEN :date_from AND :date_to' : '';

    // Проверка: есть ли факт хотя бы по одной записи (агрегат по всем датам)
    const [[totalRow]] = await db.sequelize.query(
      `SELECT COALESCE(SUM(fact_qty), 0)::numeric AS total
       FROM sewing_plans
       WHERE order_id = :order_id AND floor_id = :floor_id ${dateClause}`,
      { replacements }
    );
    const totalFact = Number(totalRow?.total ?? 0) || 0;
    if (totalFact <= 0) {
      return res.status(400).json({ error: 'Нет факта пошива по этому заказу и этажу (или по указанным датам)' });
    }

    // Агрегат по размерам (по дням уже учтено в SUM)
    const [rows] = await db.sequelize.query(
      `SELECT model_size_id, SUM(planned_qty)::numeric AS planned_qty, SUM(fact_qty)::numeric AS fact_qty
       FROM sewing_plans
       WHERE order_id = :order_id AND floor_id = :floor_id ${dateClause}
       GROUP BY model_size_id
       HAVING SUM(fact_qty) > 0`,
      { replacements }
    );

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const batchCode = `AUTO-${order_id}-${floor_id}-${dateStr}`;
    const batch = await db.SewingBatch.create({
      order_id: Number(order_id),
      model_id: order.model_id || null,
      floor_id: Number(floor_id),
      batch_code: batchCode,
      started_at: null,
      finished_at: new Date(),
      status: 'DONE',
    });

    const sizeRows = Array.isArray(rows) ? rows : [];
    if (sizeRows.length > 0) {
      const modelSizeIds = [...new Set(sizeRows.map((r) => r.model_size_id))];
      const modelSizes = await db.ModelSize.findAll({
        where: { id: modelSizeIds },
        attributes: ['id', 'size_id'],
      });
      const modelSizeToSize = {};
      modelSizes.forEach((ms) => { modelSizeToSize[ms.id] = ms.size_id; });
      for (const r of sizeRows) {
        await db.SewingBatchItem.create({
          batch_id: batch.id,
          model_size_id: r.model_size_id,
          size_id: modelSizeToSize[r.model_size_id] || null,
          planned_qty: r.planned_qty || 0,
          fact_qty: r.fact_qty || 0,
        });
      }
    } else {
      // Факт есть (totalFact > 0), но по размерам записей нет — одна позиция с суммарным фактом
      let model_size_id = null;
      if (order.model_id) {
        const first = await db.ModelSize.findOne({
          where: { model_id: order.model_id },
          attributes: ['id'],
        });
        if (first) model_size_id = first.id;
      }
      if (model_size_id == null) {
        const any = await db.ModelSize.findOne({ attributes: ['id'], order: [['id']] });
        if (any) model_size_id = any.id;
      }
      await db.SewingBatchItem.create({
        batch_id: batch.id,
        model_size_id,
        size_id: null,
        planned_qty: 0,
        fact_qty: totalFact,
      });
    }
    const withAssoc = await db.SewingBatch.findByPk(batch.id, {
      include: [
        { model: db.Order, as: 'Order', attributes: ['id', 'title', 'model_name'] },
        { model: db.BuildingFloor, as: 'BuildingFloor', attributes: ['id', 'name'] },
        { model: db.SewingBatchItem, as: 'SewingBatchItems', include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }] },
      ],
    });
    res.status(201).json(withAssoc);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sewing-plans/plans/totals?order_id= — итоги по заказу.
 * sewing_total = SUM(fact_qty). Также по размерам: по каждому model_size сумма fact_qty.
 */
router.get('/plans/totals', async (req, res, next) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    const rows = await db.SewingPlan.findAll({
      where: { order_id: Number(order_id) },
      attributes: ['model_size_id', [db.sequelize.fn('SUM', db.sequelize.col('fact_qty')), 'fact_total']],
      group: ['model_size_id'],
      raw: true,
    });
    const total = rows.reduce((s, r) => s + (parseInt(r.fact_total, 10) || 0), 0);
    const sizeIds = rows.map((r) => r.model_size_id);
    const modelSizes = await db.ModelSize.findAll({
      where: { id: sizeIds },
      include: [{ model: db.Size, as: 'Size' }],
    });
    const byId = {};
    modelSizes.forEach((ms) => { byId[ms.id] = ms; });
    const by_size = rows.map((r) => ({
      model_size_id: r.model_size_id,
      fact_total: parseInt(r.fact_total, 10) || 0,
      model_size: byId[r.model_size_id],
    }));
    res.json({ sewing_total: total, by_size });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
