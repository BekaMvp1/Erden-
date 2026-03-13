/**
 * Контроллер панели заказов (оперативная доска)
 */

const { Op } = require('sequelize');
const db = require('../models');
const { STAGES } = require('../constants/boardStages');
const { PIPELINE_DISPLAY } = require('../constants/pipelineStages');

const STAGE_KEY_SET = new Set([...STAGES.map((s) => s.key), 'planning']);

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function stageStatus(plannedQty, actualQty, isOverdue) {
  if (plannedQty > 0 && actualQty >= plannedQty) return 'DONE';
  if (plannedQty > 0 && actualQty === 0) return isOverdue ? 'OVERDUE' : 'NOT_STARTED';
  if (plannedQty > 0 && actualQty > 0 && actualQty < plannedQty) return isOverdue ? 'OVERDUE' : 'IN_PROGRESS';
  return isOverdue ? 'OVERDUE' : 'NOT_STARTED';
}

function getPriorityFromDeadline(deadline, todayIso) {
  if (!deadline) return 'normal';
  const days = Math.floor((new Date(deadline) - new Date(todayIso)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'high';
  if (days <= 3) return 'medium';
  return 'low';
}

function inferStageKey(operationRow) {
  if (!operationRow) return null;
  if (operationRow.stage_key && STAGE_KEY_SET.has(operationRow.stage_key)) {
    return operationRow.stage_key;
  }

  const opName = String(operationRow.Operation?.name || '').toLowerCase();
  const category = String(operationRow.Operation?.category || '').toUpperCase();

  if (opName.includes('закуп')) return 'procurement';
  if (opName.includes('склад гп') || opName.includes('гп')) return 'fg_warehouse';
  if (opName.includes('склад')) return 'warehouse';
  if (opName.includes('раскрой') || opName.includes('крой')) return 'cutting';
  if (opName.includes('пошив') || opName.includes('стач') || opName.includes('шв')) return 'sewing';
  if (opName.includes('отк') || opName.includes('контрол')) return 'qc';
  if (opName.includes('упаков')) return 'packing';
  if (opName.includes('отгруз')) return 'shipping';

  if (category === 'CUTTING') return 'cutting';
  if (category === 'SEWING') return 'sewing';
  if (category === 'FINISH') return 'qc';

  return null;
}

function calcPercent(actualQty, plannedQty) {
  if (!plannedQty || plannedQty <= 0) return 0;
  return Math.round((actualQty / plannedQty) * 100);
}

function parseBool(value, fallback) {
  if (value == null) return fallback;
  return String(value).toLowerCase() === 'true';
}

/** Длительность в днях между двумя датами (для отображения «заняло N дней») */
function daysBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(String(startDate).slice(0, 10));
  const end = new Date(String(endDate).slice(0, 10));
  const diff = Math.round((end - start) / (24 * 60 * 60 * 1000));
  return diff >= 0 ? diff : null;
}

function mapStageOutput(stage, isOverdue) {
  const percent = calcPercent(stage.actual_qty, stage.planned_qty);
  return {
    stage_key: stage.stage_key,
    title_ru: stage.title_ru,
    planned_qty: stage.planned_qty,
    actual_qty: stage.actual_qty,
    percent,
    status: stageStatus(stage.planned_qty, stage.actual_qty, isOverdue),
    planned_days: stage.planned_days || 0,
    planned_start_date: toDateOnly(stage.planned_start_date),
    planned_end_date: toDateOnly(stage.planned_end_date),
    actual_start_date: toDateOnly(stage.actual_start_date),
    actual_end_date: toDateOnly(stage.actual_end_date),
    actual_days: stage.actual_days != null ? stage.actual_days : null,
  };
}

function isShippingDone(stagesOut) {
  const shipping = stagesOut.find((s) => s.stage_key === 'shipping');
  return shipping?.status === 'DONE';
}

function normalizeSort(sort) {
  const allowed = new Set(['priority', 'deadline', 'forecast']);
  return allowed.has(sort) ? sort : 'deadline';
}

function normalizeOrder(direction) {
  return String(direction || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
}

async function getBoardOrders(req, res, next) {
  try {
    const {
      q,
      filter = 'all',
      priority,
      showCompleted,
      sort = 'deadline',
      order = 'asc',
      limit = 20,
      page = 1,
    } = req.query;

    const todayIso = getTodayIso();
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const showCompletedBool = parseBool(showCompleted, false);
    const sortKey = normalizeSort(sort);
    const sortOrder = normalizeOrder(order);

    const andWhere = [];

    if (q && String(q).trim()) {
      const term = String(q).trim();
      const ilike = `%${term}%`;
      const numericId = Number(term);
      const qOr = [
        { title: { [Op.iLike]: ilike } },
        { color: { [Op.iLike]: ilike } },
        { '$Client.name$': { [Op.iLike]: ilike } },
      ];
      if (Number.isFinite(numericId)) qOr.push({ id: numericId });
      andWhere.push({ [Op.or]: qOr });
    }

    // Ограничение технолога по этажу/цеху (как в существующих маршрутах)
    if (req.user.role === 'technologist' && req.allowedFloorId) {
      andWhere.push({
        [Op.or]: [{ floor_id: null }, { floor_id: req.allowedFloorId }],
      });
    }

    const where = andWhere.length > 0 ? { [Op.and]: andWhere } : {};

    const orders = await db.Order.findAll({
      where,
      include: [
        { model: db.Client, as: 'Client', required: !!q },
        { model: db.OrderStatus, as: 'OrderStatus' },
        { model: db.ProcurementRequest, as: 'ProcurementRequest', required: false },
        {
          model: db.OrderOperation,
          as: 'OrderOperations',
          required: false,
          include: [{ model: db.Operation, as: 'Operation', required: false }],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    const orderIds = orders.map((o) => o.id);
    // Источник истины по этапам — order_stages (статус и даты для отображения длительности)
    const orderStagesRows = orderIds.length > 0
      ? await db.OrderStage.findAll({
          where: { order_id: orderIds },
          attributes: ['order_id', 'stage_key', 'status', 'started_at', 'completed_at'],
          raw: true,
        })
      : [];
    const stagesByOrderId = {};
    orderStagesRows.forEach((r) => {
      if (!stagesByOrderId[r.order_id]) stagesByOrderId[r.order_id] = [];
      stagesByOrderId[r.order_id].push({
        stage_key: r.stage_key,
        status: r.status,
        started_at: r.started_at,
        completed_at: r.completed_at,
      });
    });

    // Количество записей плана по заказам (для fallback статуса «Планирование»)
    let planCountByOrderId = {};
    if (orderIds.length > 0) {
      const planCounts = await db.ProductionPlanDay.findAll({
        where: { order_id: orderIds },
        attributes: ['order_id'],
        raw: true,
      });
      planCounts.forEach((r) => {
        planCountByOrderId[r.order_id] = (planCountByOrderId[r.order_id] || 0) + 1;
      });
    }

    // Индикаторы этапов производства для панели (резерв для старых данных, если order_stages пуст)
    const cuttingByOrder = {};
    const sewingByOrder = {};
    const qcByOrder = {};
    const warehouseByOrder = {};
    const shippingByOrder = {};
    if (orderIds.length > 0) {
      const cuttingTasks = await db.CuttingTask.findAll({
        where: { order_id: orderIds },
        attributes: ['order_id', 'status'],
        raw: true,
      });
      cuttingTasks.forEach((t) => {
        if (!cuttingByOrder[t.order_id]) cuttingByOrder[t.order_id] = { hasAny: false, allDone: true };
        cuttingByOrder[t.order_id].hasAny = true;
        if (String(t.status || '') !== 'Готово') cuttingByOrder[t.order_id].allDone = false;
      });
      const sewingFloors = await db.SewingOrderFloor.findAll({
        where: { order_id: orderIds },
        attributes: ['order_id', 'status'],
        raw: true,
      });
      sewingFloors.forEach((r) => {
        if (!sewingByOrder[r.order_id]) sewingByOrder[r.order_id] = 'NOT_STARTED';
        if (r.status === 'DONE') sewingByOrder[r.order_id] = 'DONE';
        else if (r.status === 'IN_PROGRESS' && sewingByOrder[r.order_id] !== 'DONE') sewingByOrder[r.order_id] = 'IN_PROGRESS';
      });
      const doneBatches = await db.SewingBatch.findAll({
        where: { order_id: orderIds, status: 'DONE' },
        attributes: ['id', 'order_id'],
        raw: true,
      });
      const batchIds = doneBatches.map((b) => b.id);
      const orderHasDoneBatch = new Set(doneBatches.map((b) => b.order_id));
      if (batchIds.length > 0) {
        const qcBatches = await db.QcBatch.findAll({
          where: { batch_id: batchIds },
          attributes: ['batch_id'],
          raw: true,
        });
        const batchHasQc = new Set(qcBatches.map((q) => q.batch_id));
        doneBatches.forEach((b) => {
          if (!qcByOrder[b.order_id]) qcByOrder[b.order_id] = { hasQc: false, hasDoneBatch: false };
          qcByOrder[b.order_id].hasDoneBatch = true;
          if (batchHasQc.has(b.id)) qcByOrder[b.order_id].hasQc = true;
        });
      }
      const whRows = await db.WarehouseStock.findAll({
        where: { order_id: orderIds },
        attributes: ['order_id'],
        raw: true,
      });
      whRows.forEach((r) => { warehouseByOrder[r.order_id] = true; });
      const shipments = await db.Shipment.findAll({
        where: { order_id: orderIds },
        attributes: ['order_id', 'status'],
        raw: true,
      });
      shipments.forEach((s) => {
        if (!shippingByOrder[s.order_id]) shippingByOrder[s.order_id] = false;
        const st = String(s.status || '').toLowerCase();
        if (st === 'done' || st === 'shipped' || st === 'completed') shippingByOrder[s.order_id] = true;
      });
    }

    const prepared = [];
    for (const orderRow of orders) {
      const plain = orderRow.get ? orderRow.get({ plain: true }) : orderRow;
      // Семь этапов цепочки: Закуп → Планирование → Раскрой → Пошив → ОТК → Склад → Отгрузка
      const baseStages = PIPELINE_DISPLAY.map((p) => ({
        stage_key: p.key,
        title_ru: p.title_ru,
        planned_qty: 0,
        actual_qty: 0,
        planned_days: 0,
        planned_start_date: null,
        planned_end_date: null,
        actual_start_date: null,
        actual_end_date: null,
      }));
      const stageMap = new Map(baseStages.map((s) => [s.stage_key, s]));
      const ops = plain.OrderOperations || [];
      const explicitOps = ops.filter((op) => op.stage_key && STAGE_KEY_SET.has(op.stage_key));
      const fallbackOps = ops.filter((op) => !(op.stage_key && STAGE_KEY_SET.has(op.stage_key)));
      const hasExplicitStage = new Set(explicitOps.map((op) => op.stage_key));

      // Явные stage_key приоритетнее, чтобы не было дублей с производственными операциями
      for (const op of explicitOps) {
        const stageKey = inferStageKey(op);
        if (!stageKey || !stageMap.has(stageKey)) continue;

        const planned = Number(op.planned_qty ?? op.planned_quantity ?? 0) || 0;
        const actual = Number(op.actual_qty ?? op.actual_quantity ?? 0) || 0;

        const current = stageMap.get(stageKey);
        current.planned_qty += Math.max(0, planned);
        current.actual_qty += Math.max(0, actual);
        current.planned_days = Number(op.planned_days) || current.planned_days || 0;
        current.planned_start_date = op.planned_start_date || current.planned_start_date;
        current.planned_end_date = op.planned_end_date || current.planned_end_date;
        current.actual_start_date = op.actual_start_date || current.actual_start_date;
        current.actual_end_date = op.actual_end_date || current.actual_end_date;
      }

      // Фолбэк для старых данных без stage_key
      for (const op of fallbackOps) {
        const stageKey = inferStageKey(op);
        if (!stageKey || !stageMap.has(stageKey) || hasExplicitStage.has(stageKey)) continue;

        const planned = Number(op.planned_qty ?? op.planned_quantity ?? 0) || 0;
        const actual = Number(op.actual_qty ?? op.actual_quantity ?? 0) || 0;

        const current = stageMap.get(stageKey);
        current.planned_qty += Math.max(0, planned);
        current.actual_qty += Math.max(0, actual);
      }

      const deadline = toDateOnly(plain.deadline);
      const computedPriority = getPriorityFromDeadline(deadline, todayIso);
      const preStages = PIPELINE_DISPLAY.map((p) => stageMap.get(p.key));
      const doneByStatus = String(plain.OrderStatus?.name || '').toLowerCase().includes('готов');
      const isOverdue = !!(deadline && deadline < todayIso);
      const stagesOut = preStages.map((stage) => mapStageOutput(stage, isOverdue));

      // Источник истины по этапам — order_stages: статус, даты, длительность в днях
      const osStages = stagesByOrderId[plain.id] || [];
      const getOsStage = (stageKey) => osStages.find((s) => s.stage_key === stageKey);
      stagesOut.forEach((s) => {
        const os = getOsStage(s.stage_key);
        if (os) {
          s.status = os.status;
          if (os.started_at) s.actual_start_date = toDateOnly(os.started_at);
          if (os.completed_at) s.actual_end_date = toDateOnly(os.completed_at);
          if (os.started_at && os.completed_at) {
            const days = daysBetween(os.started_at, os.completed_at);
            if (days != null) s.actual_days = days;
          }
        }
      });

      // Fallback: если в order_stages нет записи (старые заказы), определяем статус по фактическим данным
      const procStageOut = stagesOut.find((s) => s.stage_key === 'procurement');
      const planStageOut = stagesOut.find((s) => s.stage_key === 'planning');
      const cutStageOut = stagesOut.find((s) => s.stage_key === 'cutting');
      const sewStageOut = stagesOut.find((s) => s.stage_key === 'sewing');
      if (procStageOut && !getOsStage('procurement')) {
        const pr = plain.ProcurementRequest;
        if (pr && String(pr.status || '').toLowerCase() === 'received') procStageOut.status = 'DONE';
      }
      if (planStageOut && !getOsStage('planning')) {
        const planCount = planCountByOrderId[plain.id] || 0;
        if (planCount > 0) planStageOut.status = 'DONE';
      }
      if (cutStageOut && !getOsStage('cutting')) {
        const cut = cuttingByOrder[plain.id];
        if (cut && cut.hasAny && cut.allDone) cutStageOut.status = 'DONE';
      }
      if (sewStageOut && !getOsStage('sewing')) {
        const sew = sewingByOrder[plain.id];
        if (sew === 'DONE') sewStageOut.status = 'DONE';
        else if (sew === 'IN_PROGRESS') sewStageOut.status = 'IN_PROGRESS';
      }

      // Дополнительно: закуп — actual_qty из заказа при DONE
      const pr = plain.ProcurementRequest;
      const procStage = stagesOut.find((s) => s.stage_key === 'procurement');
      if (procStage && pr && procStage.status === 'DONE') {
        procStage.actual_qty = Number(plain.total_quantity ?? plain.quantity ?? 0) || procStage.actual_qty;
        procStage.percent = 100;
      }

      const done = doneByStatus || isShippingDone(stagesOut);

      const progressedStages = stagesOut.filter((s) => s.planned_qty > 0);
      const donePercentTotal =
        progressedStages.length > 0
          ? Math.round(progressedStages.reduce((acc, s) => acc + s.percent, 0) / progressedStages.length)
          : 0;

      const shippingStage = preStages.find((s) => s.stage_key === 'shipping');
      const forecastDate = toDateOnly(shippingStage?.planned_end_date) || null;

      // Индикаторы этапов: Закуп → Планирование → Раскрой → Пошив → ОТК → Склад → Отгрузка
      const production_stages = [
        { key: 'procurement', label: 'Закуп', status: getOsStage('procurement')?.status || 'NOT_STARTED' },
        { key: 'planning', label: 'Планирование', status: getOsStage('planning')?.status || 'NOT_STARTED' },
        { key: 'cutting', label: 'Раскрой', status: getOsStage('cutting')?.status || 'NOT_STARTED' },
        { key: 'sewing', label: 'Пошив', status: getOsStage('sewing')?.status || 'NOT_STARTED' },
        { key: 'qc', label: 'ОТК', status: getOsStage('qc')?.status || 'NOT_STARTED' },
        { key: 'warehouse', label: 'Склад', status: getOsStage('warehouse')?.status || 'NOT_STARTED' },
        { key: 'shipping', label: 'Отгрузка', status: getOsStage('shipping')?.status || 'NOT_STARTED' },
      ];

      prepared.push({
        id: plain.id,
        order_number: String(plain.id),
        client_name: plain.Client?.name || '—',
        model_name: plain.title || '—',
        article: plain.color || null,
        priority: computedPriority,
        created_at: toDateOnly(plain.created_at),
        deadline,
        forecast_date: forecastDate,
        is_overdue: isOverdue,
        stages: stagesOut,
        done_percent_total: donePercentTotal,
        production_stages,
        _done: done,
      });
    }

    // Фильтрация состояния после расчётов
    const forceIncludeDone = String(filter || 'all') === 'done';
    let filtered = prepared.filter((o) => (showCompletedBool || forceIncludeDone ? true : !o._done));

    if (priority) {
      filtered = filtered.filter((o) => o.priority === String(priority));
    }

    const filterKey = String(filter || 'all');
    if (filterKey === 'done') filtered = filtered.filter((o) => o._done);
    if (filterKey === 'not_done') filtered = filtered.filter((o) => !o._done);
    if (filterKey === 'overdue') filtered = filtered.filter((o) => o.is_overdue);
    if (filterKey === 'today') filtered = filtered.filter((o) => o.deadline === todayIso);
    if (filterKey === 'future') filtered = filtered.filter((o) => o.deadline && o.deadline > todayIso);

    const sorted = [...filtered].sort((a, b) => {
      let av;
      let bv;
      if (sortKey === 'priority') {
        const rank = { high: 3, medium: 2, normal: 1, low: 0 };
        av = rank[a.priority] ?? 1;
        bv = rank[b.priority] ?? 1;
      } else if (sortKey === 'forecast') {
        av = a.forecast_date || '9999-12-31';
        bv = b.forecast_date || '9999-12-31';
      } else {
        av = a.deadline || '9999-12-31';
        bv = b.deadline || '9999-12-31';
      }
      if (av < bv) return sortOrder === 'asc' ? -1 : 1;
      if (av > bv) return sortOrder === 'asc' ? 1 : -1;
      return b.id - a.id;
    });

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const safePage = Math.min(pageNum, totalPages);
    const offset = (safePage - 1) * limitNum;
    const paged = sorted.slice(offset, offset + limitNum).map(({ _done, ...row }) => row);

    return res.json({
      pagination: {
        page: safePage,
        limit: limitNum,
        total,
        totalPages,
      },
      orders: paged,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  STAGES,
  getBoardOrders,
};
