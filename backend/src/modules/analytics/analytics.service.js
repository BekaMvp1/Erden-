/**
 * Сервис аналитики — read-only запросы с фильтрами
 * Использует: Order, OrderOperation, Operation, Sewer, User, Client
 * Маппинг operation.category -> step_code: CUTTING->cut, SEWING->sew, FINISH->qc
 */

const { Op } = require('sequelize');
const db = require('../../models');

const DEFAULT_LIMIT = 100;

/** Маппинг category операции в step_code */
const CATEGORY_TO_STEP = {
  CUTTING: 'cut',
  SEWING: 'sew',
  FINISH: 'qc',
};

/** Маппинг имени операции в step_code (частичное совпадение) */
const NAME_TO_STEP = {
  раскрой: 'cut',
  крой: 'cut',
  стачивание: 'sew',
  швейка: 'sew',
  петля: 'buttonhole',
  пуговица: 'button',
  метка: 'label',
  отк: 'qc',
  упаковка: 'pack',
};

function getStepCode(op) {
  if (!op) return 'unknown';
  const name = (op.name || '').toLowerCase();
  for (const [key, code] of Object.entries(NAME_TO_STEP)) {
    if (name.includes(key)) return code;
  }
  return CATEGORY_TO_STEP[op.category] || 'sew';
}

/**
 * Просроченные заказы с фильтрами
 * @param {Object} filters - { client, days, status }
 */
async function getOverdue(filters = {}) {
  const { client, days = 0, status } = filters;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let deadlineEnd = today;
  if (days > 0) {
    deadlineEnd = new Date(today);
    deadlineEnd.setDate(deadlineEnd.getDate() + Number(days));
  }
  const deadlineStr = deadlineEnd.toISOString().split('T')[0];

  const where = {
    deadline: { [Op.lte]: deadlineStr },
  };

  const include = [
    { model: db.OrderStatus, as: 'OrderStatus', attributes: ['id', 'name'] },
    {
      model: db.Client,
      as: 'Client',
      attributes: ['id', 'name'],
      ...(client && isNaN(Number(client))
        ? { where: { name: { [Op.iLike]: `%${String(client)}%` } }, required: true }
        : {}),
    },
  ];

  if (client && !isNaN(Number(client))) {
    where.client_id = Number(client);
  }

  const orders = await db.Order.findAll({
    where,
    include,
    attributes: ['id', 'title', 'deadline', 'status_id', 'total_quantity', 'client_id'],
    limit: DEFAULT_LIMIT,
  });

  const statusReady = await db.OrderStatus.findOne({
    where: { name: 'Готов' },
    attributes: ['id'],
  });
  const readyId = statusReady?.id;

  let filtered = orders;
  if (readyId && status !== 'all') {
    filtered = orders.filter((o) => o.status_id !== readyId);
  }
  if (status) {
    const statusObj = await db.OrderStatus.findOne({
      where: { name: { [Op.iLike]: `%${status}%` } },
      attributes: ['id'],
    });
    if (statusObj) {
      filtered = filtered.filter((o) => o.status_id === statusObj.id);
    }
  }

  if (client && !isNaN(Number(client))) {
    filtered = filtered.filter((o) => o.client_id === Number(client));
  } else if (client) {
    filtered = filtered.filter(
      (o) => o.Client?.name && o.Client.name.toLowerCase().includes(String(client).toLowerCase())
    );
  }

  return filtered.map((o) => ({
    id: o.id,
    title: o.title,
    deadline: o.deadline,
    status: o.OrderStatus?.name,
    client: o.Client?.name,
    total_quantity: o.total_quantity,
  }));
}

/**
 * Узкие места с фильтрами
 * @param {Object} filters - { days, step }
 * Формат: [{ step_code, step_name, pending, in_progress, blocked }]
 */
async function getBottlenecks(filters = {}) {
  const { days, step: stepFilter } = filters;
  const where = { status: { [Op.in]: ['Ожидает', 'В работе'] } };

  if (days && days > 0) {
    const from = new Date();
    from.setDate(from.getDate() - Number(days));
    where.updated_at = { [Op.gte]: from };
  }

  const result = await db.OrderOperation.findAll({
    where,
    include: [{ model: db.Operation, as: 'Operation', attributes: ['id', 'name', 'category'] }],
    attributes: ['operation_id', 'status'],
    limit: DEFAULT_LIMIT * 5,
  });

  const byStep = {};
  for (const r of result) {
    const stepCode = getStepCode(r.Operation);
    if (stepFilter && stepCode !== stepFilter) continue;

    const stepName = r.Operation?.name || stepCode;
    if (!byStep[stepCode]) {
      byStep[stepCode] = { step_code: stepCode, step_name: stepName, pending: 0, in_progress: 0, blocked: 0 };
    }
    if (r.status === 'Ожидает') byStep[stepCode].pending += 1;
    else if (r.status === 'В работе') byStep[stepCode].in_progress += 1;
    else byStep[stepCode].blocked += 1;
  }

  return Object.values(byStep).sort(
    (a, b) => b.pending + b.in_progress - (a.pending + a.in_progress)
  );
}

/**
 * Производительность операторов с фильтрами
 * @param {Object} filters - { days, step }
 */
async function getWorkers(filters = {}) {
  const { days = 7, step: stepFilter } = filters;
  const from = new Date();
  from.setDate(from.getDate() - Number(days));

  const result = await db.OrderOperation.findAll({
    where: {
      updated_at: { [Op.gte]: from },
      actual_quantity: { [Op.gt]: 0 },
    },
    include: [
      { model: db.Sewer, as: 'Sewer', required: false, include: [{ model: db.User, as: 'User', attributes: ['id', 'name'] }] },
      { model: db.User, required: false, attributes: ['id', 'name'] },
      { model: db.Operation, as: 'Operation', attributes: ['id', 'name', 'category'] },
    ],
    attributes: ['sewer_id', 'responsible_user_id', 'actual_quantity', 'operation_id'],
    limit: DEFAULT_LIMIT * 5,
  });

  const byUser = {};
  for (const r of result) {
    const stepCode = getStepCode(r.Operation);
    if (stepFilter && stepCode !== stepFilter) continue;

    const userName = r.User?.name || r.Sewer?.User?.name || `Оператор #${r.sewer_id || r.responsible_user_id || '?'}`;
    const uid = r.responsible_user_id || r.sewer_id || 'unknown';
    const key = `${uid}_${stepCode}`;
    if (!byUser[key]) {
      byUser[key] = { user_id: uid, user_name: userName, step_code: stepCode, total_qty: 0 };
    }
    byUser[key].total_qty += r.actual_quantity || 0;
  }

  return Object.values(byUser).sort((a, b) => b.total_qty - a.total_qty);
}

/**
 * Таймлайн заказа — order_operations как события
 * Формат: [{ created_at, step_code, event_type, qty_delta, defect_qty, user }]
 */
async function getOrderTimeline(orderId) {
  const ops = await db.OrderOperation.findAll({
    where: { order_id: orderId },
    include: [
      { model: db.Operation, as: 'Operation', attributes: ['id', 'name', 'category'] },
      { model: db.User, required: false, attributes: ['id', 'name'] },
    ],
    order: [['created_at', 'ASC']],
    attributes: ['id', 'order_id', 'operation_id', 'status', 'planned_quantity', 'actual_quantity', 'created_at', 'updated_at'],
    limit: DEFAULT_LIMIT,
  });

  return ops.map((o) => {
    const stepCode = getStepCode(o.Operation);
    const qtyDelta = o.actual_quantity != null ? o.actual_quantity - (o.planned_quantity || 0) : 0;
    return {
      created_at: o.created_at,
      step_code: stepCode,
      event_type: o.status === 'Готово' ? 'complete' : o.status === 'В работе' ? 'progress' : 'pending',
      qty_delta: o.actual_quantity ?? 0,
      defect_qty: 0,
      user: o.User?.name,
    };
  });
}

module.exports = {
  getOverdue,
  getBottlenecks,
  getWorkers,
  getOrderTimeline,
};
