/**
 * Складской учёт по размерам и партиям: пошив → ОТК → склад → отгрузка.
 * Учёт по размерам модели, каждая партия хранится отдельно.
 * Нельзя отгрузить больше, чем есть на складе.
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();

// ————— Модели изделий и размерная сетка —————

/** GET /api/warehouse-stock/models — список моделей */
router.get('/models', async (req, res, next) => {
  try {
    const list = await db.ProductModel.findAll({
      order: [['name']],
      include: [{ model: db.ModelSize, as: 'ModelSizes', include: [{ model: db.Size, as: 'Size' }] }],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/** POST /api/warehouse-stock/models — создать модель. body: { name } */
router.post('/models', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Укажите название модели' });
    }
    const row = await db.ProductModel.create({ name: String(name).trim() });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

/** GET /api/warehouse-stock/models/:id/sizes — размерная сетка модели */
router.get('/models/:id/sizes', async (req, res, next) => {
  try {
    const model = await db.ProductModel.findByPk(req.params.id);
    if (!model) return res.status(404).json({ error: 'Модель не найдена' });
    const list = await db.ModelSize.findAll({
      where: { model_id: model.id },
      include: [{ model: db.Size, as: 'Size' }],
      order: [['Size', 'name']],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/** POST /api/warehouse-stock/models/:id/sizes — добавить размер в сетку. body: { size_id } */
router.post('/models/:id/sizes', async (req, res, next) => {
  try {
    const model = await db.ProductModel.findByPk(req.params.id);
    if (!model) return res.status(404).json({ error: 'Модель не найдена' });
    const { size_id } = req.body;
    if (!size_id) return res.status(400).json({ error: 'Укажите size_id' });
    const [row] = await db.ModelSize.findOrCreate({
      where: { model_id: model.id, size_id: Number(size_id) },
      defaults: { model_id: model.id, size_id: Number(size_id) },
    });
    const withSize = await db.ModelSize.findByPk(row.id, { include: [{ model: db.Size, as: 'Size' }] });
    res.status(201).json(withSize);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/warehouse-stock/models/:id/sizes/:sizeId — убрать размер из сетки */
router.delete('/models/:id/sizes/:sizeId', async (req, res, next) => {
  try {
    const deleted = await db.ModelSize.destroy({
      where: { model_id: req.params.id, size_id: req.params.sizeId },
    });
    if (!deleted) return res.status(404).json({ error: 'Запись не найдена' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ————— Пошив по размерам —————

/** GET /api/warehouse-stock/sewing?order_id= — записи пошива по заказу */
router.get('/sewing', async (req, res, next) => {
  try {
    const { order_id, from, to } = req.query;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    const where = { order_id: Number(order_id) };
    if (from && to) where.date = { [Op.between]: [from, to] };
    const list = await db.SewingRecord.findAll({
      where,
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] },
        { model: db.BuildingFloor, as: 'BuildingFloor' },
      ],
      order: [['date', 'DESC'], ['id', 'DESC']],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/** POST /api/warehouse-stock/sewing — запись пошива. body: { order_id, floor_id?, model_size_id, qty, date } */
router.post('/sewing', async (req, res, next) => {
  try {
    const { order_id, floor_id, model_size_id, qty, date } = req.body;
    if (!order_id || !model_size_id || !date) {
      return res.status(400).json({ error: 'Укажите order_id, model_size_id, date' });
    }
    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const ms = await db.ModelSize.findByPk(model_size_id);
    if (!ms) return res.status(404).json({ error: 'Размер модели не найден' });
    const q = Math.max(0, parseInt(qty, 10) || 0);
    if (q === 0) return res.status(400).json({ error: 'qty должно быть больше 0' });
    const row = await db.SewingRecord.create({
      order_id: Number(order_id),
      floor_id: floor_id ? Number(floor_id) : null,
      model_size_id: Number(model_size_id),
      qty: q,
      date: String(date).slice(0, 10),
    });
    const withAssoc = await db.SewingRecord.findByPk(row.id, {
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] },
      ],
    });
    res.status(201).json(withAssoc);
  } catch (err) {
    next(err);
  }
});

// ————— Партии пошива (для ОТК по партиям) —————

/**
 * GET /api/warehouse-stock/batches/pending-qc — партии, готовые к ОТК.
 * Условие: sewing_batches.status = 'DONE', по партии ещё нет qc_batches, есть факт (SUM fact_qty > 0).
 */
router.get('/batches/pending-qc', async (req, res, next) => {
  try {
    const [rows] = await db.sequelize.query(`
      SELECT sb.id, sb.order_id, sb.model_id, sb.floor_id, sb.batch_code, sb.finished_at,
             COALESCE(SUM(sbi.fact_qty), 0)::numeric AS total_fact
      FROM sewing_batches sb
      LEFT JOIN sewing_batch_items sbi ON sbi.batch_id = sb.id
      LEFT JOIN qc_batches qb ON qb.batch_id = sb.id
      WHERE sb.status = 'DONE' AND qb.id IS NULL
      GROUP BY sb.id
      HAVING COALESCE(SUM(sbi.fact_qty), 0) > 0
      ORDER BY sb.finished_at DESC NULLS LAST
    `);
    if (!rows || rows.length === 0) return res.json([]);
    const batchIds = rows.map((r) => r.id);
    const orders = await db.Order.findAll({
      where: { id: [...new Set(rows.map((r) => r.order_id))] },
      include: [{ model: db.Client, as: 'Client' }],
      attributes: ['id', 'title', 'model_name', 'tz_code'],
    });
    const orderMap = {};
    orders.forEach((o) => { orderMap[o.id] = o; });
    const floors = await db.BuildingFloor.findAll({
      where: { id: [...new Set(rows.map((r) => r.floor_id).filter(Boolean))] },
      attributes: ['id', 'name'],
    });
    const floorMap = {};
    floors.forEach((f) => { floorMap[f.id] = f; });
    const list = rows.map((r) => {
      const order = orderMap[r.order_id];
      const floor = r.floor_id ? floorMap[r.floor_id] : null;
      return {
        id: r.id,
        batch_code: r.batch_code,
        order_id: r.order_id,
        order_title: order?.title || `#${r.order_id}`,
        tz_code: order?.tz_code || '',
        model_name: order?.model_name || '',
        client_name: order?.Client?.name || '—',
        floor_id: r.floor_id,
        floor_name: floor?.name || '—',
        finished_at: r.finished_at,
        total_fact: Number(r.total_fact) || 0,
      };
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/warehouse-stock/batches/:id — партия с позициями по размерам (для формы ОТК).
 */
router.get('/batches/:id', async (req, res, next) => {
  try {
    const batch = await db.SewingBatch.findByPk(req.params.id, {
      include: [
        { model: db.Order, as: 'Order', attributes: ['id', 'title', 'model_name', 'tz_code'], include: [{ model: db.Client, as: 'Client', attributes: ['name'] }] },
        { model: db.BuildingFloor, as: 'BuildingFloor', attributes: ['id', 'name'] },
        {
          model: db.SewingBatchItem,
          as: 'SewingBatchItems',
          include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }],
        },
      ],
    });
    if (!batch) return res.status(404).json({ error: 'Партия не найдена' });
    res.json(batch);
  } catch (err) {
    next(err);
  }
});

// ————— ОТК —————

/**
 * GET /api/warehouse-stock/qc/pending — заказы/модели для ОТК (легаси, по заказам без партий).
 * Данные только из завершённого пошива: sewing_fact_total > 0, QC по этому размеру ещё не создан.
 */
router.get('/qc/pending', async (req, res, next) => {
  try {
    const [sewingSums] = await db.sequelize.query(`
      SELECT order_id, model_size_id, SUM(fact_qty)::int AS sewing_fact_total
      FROM sewing_plans
      GROUP BY order_id, model_size_id
      HAVING SUM(fact_qty) > 0
    `);
    if (!sewingSums || sewingSums.length === 0) {
      return res.json([]);
    }
    const withQc = await db.QcRecord.findAll({
      attributes: ['order_id', 'model_size_id'],
      raw: true,
    });
    const qcKeys = new Set(withQc.map((r) => `${r.order_id}_${r.model_size_id}`));
    const pending = sewingSums.filter((r) => !qcKeys.has(`${r.order_id}_${r.model_size_id}`));
    if (pending.length === 0) return res.json([]);

    const orderIds = [...new Set(pending.map((r) => r.order_id))];
    const sizeIds = [...new Set(pending.map((r) => r.model_size_id))];
    const orders = await db.Order.findAll({
      where: { id: orderIds },
      include: [{ model: db.Client, as: 'Client' }],
    });
    const orderMap = {};
    orders.forEach((o) => { orderMap[o.id] = o; });
    const modelSizes = await db.ModelSize.findAll({
      where: { id: sizeIds },
      include: [{ model: db.Size, as: 'Size' }],
    });
    const sizeMap = {};
    modelSizes.forEach((ms) => { sizeMap[ms.id] = ms; });

    const byOrder = {};
    for (const r of pending) {
      const o = orderMap[r.order_id];
      const ms = sizeMap[r.model_size_id];
      if (!o || !ms) continue;
      if (!byOrder[r.order_id]) {
        byOrder[r.order_id] = {
          order_id: o.id,
          order_title: o.title,
          model_name: o.model_name || '',
          client_name: o.Client?.name || '—',
          items: [],
        };
      }
      byOrder[r.order_id].items.push({
        model_size_id: r.model_size_id,
        size_name: ms.Size?.name || `#${r.model_size_id}`,
        sewing_fact_total: r.sewing_fact_total,
      });
    }
    res.json(Object.values(byOrder));
  } catch (err) {
    next(err);
  }
});

/** GET /api/warehouse-stock/qc?order_id= — записи ОТК по заказу (легаси) */
router.get('/qc', async (req, res, next) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    const list = await db.QcRecord.findAll({
      where: { order_id: Number(order_id) },
      include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }],
      order: [['created_at', 'DESC']],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/warehouse-stock/qc/batch — ОТК по партии (по размерам).
 * body: { batch_id, items: [{ model_size_id, checked_qty, passed_qty }] }
 * Правила: checked_qty по размеру = fact_qty из партии по умолчанию; passed_qty <= checked_qty; defect = checked - passed.
 * После сохранения: создаётся qc_batches + qc_batch_items, склад пополняется по passed_qty (warehouse_stock по batch_id).
 */
router.post('/qc/batch', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { batch_id, items } = req.body;
    if (!batch_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Укажите batch_id и items (массив { model_size_id, checked_qty, passed_qty })' });
    }
    const batch = await db.SewingBatch.findByPk(batch_id, {
      include: [{ model: db.SewingBatchItem, as: 'SewingBatchItems' }],
      transaction: t,
    });
    if (!batch) {
      await t.rollback();
      return res.status(404).json({ error: 'Партия не найдена' });
    }
    if (batch.status !== 'DONE') {
      await t.rollback();
      return res.status(400).json({ error: 'Партия должна быть в статусе DONE' });
    }
    const existingQc = await db.QcBatch.findOne({ where: { batch_id: Number(batch_id) }, transaction: t });
    if (existingQc) {
      await t.rollback();
      return res.status(400).json({ error: 'ОТК по этой партии уже проведён' });
    }

    const batchItemsBySize = {};
    batch.SewingBatchItems.forEach((bi) => {
      batchItemsBySize[bi.model_size_id] = { planned_qty: Number(bi.planned_qty) || 0, fact_qty: Number(bi.fact_qty) || 0 };
    });

    let checkedTotal = 0;
    let passedTotal = 0;
    let defectTotal = 0;
    const qcItems = [];

    for (const it of items) {
      const model_size_id = Number(it.model_size_id);
      const factQty = batchItemsBySize[model_size_id]?.fact_qty ?? 0;
      let checked = parseInt(it.checked_qty, 10);
      if (Number.isNaN(checked)) checked = factQty;
      checked = Math.max(0, checked);
      let passed = Math.max(0, parseInt(it.passed_qty, 10) || 0);
      if (passed > checked) passed = checked;
      const defect = Math.max(0, checked - passed);
      checkedTotal += checked;
      passedTotal += passed;
      defectTotal += defect;
      qcItems.push({ model_size_id, checked_qty: checked, passed_qty: passed, defect_qty: defect });
    }

    const qcBatch = await db.QcBatch.create(
      {
        batch_id: Number(batch_id),
        checked_total: checkedTotal,
        passed_total: passedTotal,
        defect_total: defectTotal,
      },
      { transaction: t }
    );

    for (const it of qcItems) {
      await db.QcBatchItem.create(
        {
          qc_batch_id: qcBatch.id,
          model_size_id: it.model_size_id,
          checked_qty: it.checked_qty,
          passed_qty: it.passed_qty,
          defect_qty: it.defect_qty,
        },
        { transaction: t }
      );
      if (it.passed_qty > 0) {
        const [stockRow, created] = await db.WarehouseStock.findOrCreate({
          where: {
            batch_id: Number(batch_id),
            model_size_id: it.model_size_id,
          },
          defaults: {
            order_id: batch.order_id,
            model_size_id: it.model_size_id,
            batch: batch.batch_code,
            batch_id: Number(batch_id),
            qty: it.passed_qty,
          },
          transaction: t,
        });
        if (!created) {
          await stockRow.increment('qty', { by: it.passed_qty, transaction: t });
        }
      }
    }

    await t.commit();

    const withAssoc = await db.QcBatch.findByPk(qcBatch.id, {
      include: [
        { model: db.SewingBatch, as: 'SewingBatch' },
        { model: db.QcBatchItem, as: 'QcBatchItems', include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }] },
      ],
    });
    res.status(201).json(withAssoc);
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

/**
 * POST /api/warehouse-stock/qc — запись ОТК.
 * body: { order_id, model_size_id, checked_qty, passed_qty, defect_qty, batch? }
 * После ОТК: на склад добавляется passed_qty по партии (batch). Если batch не передан — генерируется.
 */
router.post('/qc', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { order_id, model_size_id, checked_qty, passed_qty, defect_qty, batch } = req.body;
    if (!order_id || !model_size_id) {
      return res.status(400).json({ error: 'Укажите order_id, model_size_id' });
    }
    const order = await db.Order.findByPk(order_id, { transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    const ms = await db.ModelSize.findByPk(model_size_id, { transaction: t });
    if (!ms) {
      await t.rollback();
      return res.status(404).json({ error: 'Размер модели не найден' });
    }
    const checked = Math.max(0, parseInt(checked_qty, 10) || 0);
    const passed = Math.max(0, parseInt(passed_qty, 10) || 0);
    // defect_qty = checked_qty - passed_qty (вычисляем, если не передан)
    let defect = parseInt(defect_qty, 10);
    if (Number.isNaN(defect)) defect = Math.max(0, checked - passed);
    else defect = Math.max(0, defect);

    const qcRow = await db.QcRecord.create(
      {
        order_id: Number(order_id),
        model_size_id: Number(model_size_id),
        checked_qty: checked,
        passed_qty: passed,
        defect_qty: defect,
      },
      { transaction: t }
    );

    // На склад: warehouse_qty += passed_qty по партии
    const batchKey = batch && String(batch).trim() ? String(batch).trim() : `qc-${qcRow.id}`;
    const [stockRow, created] = await db.WarehouseStock.findOrCreate({
      where: {
        order_id: Number(order_id),
        model_size_id: Number(model_size_id),
        batch: batchKey,
      },
      defaults: {
        order_id: Number(order_id),
        model_size_id: Number(model_size_id),
        batch: batchKey,
        qty: passed,
      },
      transaction: t,
    });
    if (!created && passed > 0) {
      await stockRow.increment('qty', { by: passed, transaction: t });
    }
    await t.commit();

    const withAssoc = await db.QcRecord.findByPk(qcRow.id, {
      include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }],
    });
    res.status(201).json(withAssoc);
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

// ————— Склад (остатки по размерам и партиям) —————

/** GET /api/warehouse-stock/stock?order_id= — остатки на складе. По партиям: batch_code, модель, размер, остаток. */
router.get('/stock', async (req, res, next) => {
  try {
    const { order_id } = req.query;
    const where = {};
    if (order_id) where.order_id = Number(order_id);
    const list = await db.WarehouseStock.findAll({
      where,
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] },
        { model: db.Order, as: 'Order', attributes: ['id', 'title', 'model_name'], include: [{ model: db.Client, as: 'Client', attributes: ['name'] }] },
        { model: db.SewingBatch, as: 'SewingBatch', attributes: ['id', 'batch_code'], required: false },
      ],
      order: [['order_id'], ['batch_id'], ['model_size_id'], ['batch']],
    });
    const out = list.map((row) => {
      const j = row.toJSON();
      j.batch_code = row.SewingBatch?.batch_code ?? row.batch ?? `#${row.batch_id || row.id}`;
      return j;
    });
    res.json(out);
  } catch (err) {
    next(err);
  }
});

/** GET /api/warehouse-stock/stock/summary?order_id= — сводка по заказу: по каждому model_size сумма qty */
router.get('/stock/summary', async (req, res, next) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    const rows = await db.WarehouseStock.findAll({
      where: { order_id: Number(order_id) },
      attributes: ['model_size_id', [db.sequelize.fn('SUM', db.sequelize.col('qty')), 'total_qty']],
      group: ['model_size_id'],
      raw: true,
    });
    const sizeIds = rows.map((r) => r.model_size_id);
    const modelSizes = await db.ModelSize.findAll({
      where: { id: sizeIds },
      include: [{ model: db.Size, as: 'Size' }],
    });
    const byId = {};
    modelSizes.forEach((ms) => { byId[ms.id] = ms; });
    const summary = rows.map((r) => ({
      model_size_id: r.model_size_id,
      total_qty: parseInt(r.total_qty, 10) || 0,
      model_size: byId[r.model_size_id],
    }));
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// ————— Отгрузка —————

/** GET /api/warehouse-stock/shipments?order_id= — отгрузки. Новая схема: по batch_id с shipment_items. */
router.get('/shipments', async (req, res, next) => {
  try {
    const { order_id } = req.query;
    const where = {};
    if (order_id) where.order_id = Number(order_id);
    const list = await db.Shipment.findAll({
      where,
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }], required: false },
        { model: db.Order, as: 'Order', attributes: ['id', 'title', 'model_name'], include: [{ model: db.Client, as: 'Client', attributes: ['name'] }], required: false },
        { model: db.SewingBatch, as: 'SewingBatch', attributes: ['id', 'batch_code', 'order_id'], required: false },
        { model: db.ShipmentItem, as: 'ShipmentItems', include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }] },
      ],
      order: [['shipped_at', 'DESC']],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/warehouse-stock/shipments — отгрузка.
 * Новая схема: body: { batch_id, items: [{ model_size_id, qty }] }
 * Правило: qty по размеру ≤ warehouse_stock.qty по этой партии и размеру. После отгрузки склад уменьшается.
 * Легаси: body: { order_id, model_size_id, batch, qty } — одна позиция.
 */
router.post('/shipments', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { batch_id, items, order_id, model_size_id, batch, qty } = req.body;

    if (batch_id && Array.isArray(items) && items.length > 0) {
      // Новая схема: отгрузка по партии и размерам
      const sewingBatch = await db.SewingBatch.findByPk(batch_id, { transaction: t });
      if (!sewingBatch) {
        await t.rollback();
        return res.status(404).json({ error: 'Партия не найдена' });
      }
      const shipment = await db.Shipment.create(
        {
          batch_id: Number(batch_id),
          order_id: sewingBatch.order_id,
          shipped_at: new Date(),
          status: 'shipped',
        },
        { transaction: t }
      );
      for (const it of items) {
        const model_size_id_it = Number(it.model_size_id);
        const shipQty = Math.max(0, parseFloat(it.qty) || 0);
        if (shipQty <= 0) continue;
        const stockRow = await db.WarehouseStock.findOne({
          where: { batch_id: Number(batch_id), model_size_id: model_size_id_it },
          lock: t.LOCK.UPDATE,
          transaction: t,
        });
        if (!stockRow) {
          await t.rollback();
          return res.status(400).json({ error: `Нет остатка по размеру model_size_id=${model_size_id_it} для партии` });
        }
        const currentQty = parseFloat(stockRow.qty) || 0;
        if (shipQty > currentQty) {
          await t.rollback();
          return res.status(400).json({
            error: 'Нельзя отгрузить больше, чем есть на складе',
            model_size_id: model_size_id_it,
            available: currentQty,
            requested: shipQty,
          });
        }
        const newQty = currentQty - shipQty;
        if (newQty === 0) {
          await stockRow.destroy({ transaction: t });
        } else {
          await stockRow.update({ qty: newQty }, { transaction: t });
        }
        await db.ShipmentItem.create(
          { shipment_id: shipment.id, model_size_id: model_size_id_it, qty: shipQty },
          { transaction: t }
        );
      }
      await t.commit();
      const withAssoc = await db.Shipment.findByPk(shipment.id, {
        include: [
          { model: db.SewingBatch, as: 'SewingBatch' },
          { model: db.ShipmentItem, as: 'ShipmentItems', include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }] },
        ],
      });
      return res.status(201).json(withAssoc);
    }

    // Легаси: одна позиция по order_id, model_size_id, batch
    if (!order_id || !model_size_id || !batch) {
      return res.status(400).json({ error: 'Укажите batch_id и items ИЛИ order_id, model_size_id, batch, qty' });
    }
    const shipQty = Math.max(0, parseInt(qty, 10) || 0);
    if (shipQty === 0) {
      return res.status(400).json({ error: 'qty должно быть больше 0' });
    }
    const order = await db.Order.findByPk(order_id, { transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    const ms = await db.ModelSize.findByPk(model_size_id, { transaction: t });
    if (!ms) {
      await t.rollback();
      return res.status(404).json({ error: 'Размер модели не найден' });
    }
    const stockRow = await db.WarehouseStock.findOne({
      where: {
        order_id: Number(order_id),
        model_size_id: Number(model_size_id),
        batch: String(batch).trim(),
      },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!stockRow) {
      await t.rollback();
      return res.status(400).json({ error: 'Партия не найдена на складе' });
    }
    const currentQty = parseInt(stockRow.qty, 10) || 0;
    if (shipQty > currentQty) {
      await t.rollback();
      return res.status(400).json({
        error: 'Нельзя отгрузить больше, чем есть на складе',
        available: currentQty,
        requested: shipQty,
      });
    }
    const newStockQty = currentQty - shipQty;
    if (newStockQty === 0) {
      await stockRow.destroy({ transaction: t });
    } else {
      await stockRow.update({ qty: newStockQty }, { transaction: t });
    }
    const shipment = await db.Shipment.create(
      {
        order_id: Number(order_id),
        model_size_id: Number(model_size_id),
        batch: String(batch).trim(),
        qty: shipQty,
        shipped_at: new Date(),
        status: 'shipped',
      },
      { transaction: t }
    );
    await t.commit();
    const withAssoc = await db.Shipment.findByPk(shipment.id, {
      include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }],
    });
    res.status(201).json(withAssoc);
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

module.exports = router;
