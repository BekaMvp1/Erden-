/**
 * Контроллер панели заказов (оперативная доска)
 */

const { Op } = require('sequelize');
const db = require('../models');
const { STAGES } = require('../constants/boardStages');

const STAGE_KEY_SET = new Set(STAGES.map((s) => s.key));

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
        {
          model: db.OrderOperation,
          as: 'OrderOperations',
          required: false,
          include: [{ model: db.Operation, as: 'Operation', required: false }],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    const prepared = [];
    for (const orderRow of orders) {
      const plain = orderRow.get ? orderRow.get({ plain: true }) : orderRow;
      const baseStages = STAGES.map((stage) => ({
        stage_key: stage.key,
        title_ru: stage.title_ru,
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
      const preStages = STAGES.map((s) => stageMap.get(s.key));
      const doneByStatus = String(plain.OrderStatus?.name || '').toLowerCase().includes('готов');
      const shippingReadyByProgress = isShippingDone(preStages.map((st) => mapStageOutput(st, false)));
      const done = doneByStatus || shippingReadyByProgress;
      const isOverdue = !!(deadline && deadline < todayIso && !done);
      const stagesOut = preStages.map((stage) => mapStageOutput(stage, isOverdue));

      const progressedStages = stagesOut.filter((s) => s.planned_qty > 0);
      const donePercentTotal =
        progressedStages.length > 0
          ? Math.round(progressedStages.reduce((acc, s) => acc + s.percent, 0) / progressedStages.length)
          : 0;

      const shippingStage = preStages.find((s) => s.stage_key === 'shipping');
      const forecastDate = toDateOnly(shippingStage?.planned_end_date) || null;

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
