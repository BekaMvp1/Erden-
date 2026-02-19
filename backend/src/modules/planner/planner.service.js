/**
 * Planner service — приоритеты, узкие места, рекомендации
 * Использует: Order, OrderOperation, Operation, Client, OrderStatus
 */

const { Op } = require('sequelize');
const db = require('../../models');
const { getStepCode, mapStatus, daysUntilDue } = require('./planner.helper');

const DEFAULT_LIMIT = 100;
const DEFAULT_DAYS = 7;

/**
 * GET /api/planner/priority
 */
async function getPriority(params = {}) {
  const { days = DEFAULT_DAYS, limit = DEFAULT_LIMIT } = params;
  const statusReady = await db.OrderStatus.findOne({ where: { name: 'Готов' }, attributes: ['id'] });
  const readyId = statusReady?.id;

  const orders = await db.Order.findAll({
    where: readyId ? { status_id: { [Op.ne]: readyId } } : {},
    include: [
      { model: db.Client, as: 'Client', attributes: ['id', 'name'] },
      { model: db.OrderStatus, as: 'OrderStatus', attributes: ['id', 'name'] },
      {
        model: db.OrderOperation,
        as: 'OrderOperations',
        include: [{ model: db.Operation, as: 'Operation', attributes: ['id', 'name', 'category'] }],
        order: [['id', 'ASC']],
      },
    ],
    attributes: ['id', 'title', 'deadline', 'total_quantity'],
    limit: Math.min(limit, 200),
  });

  const from = new Date();
  from.setDate(from.getDate() - Number(days));
  const queueByStep = await getQueueByStep(from);

  const result = [];
  for (const order of orders) {
    const ops = order.OrderOperations || [];
    const currentOp = ops.find((o) => o.status !== 'Готово') || ops[ops.length - 1];
    const stepCode = currentOp ? getStepCode(currentOp.Operation) : 'unknown';
    const stepName = currentOp?.Operation?.name || stepCode;
    const planned = currentOp?.planned_quantity ?? order.total_quantity ?? 0;
    const actual = currentOp?.actual_quantity ?? 0;
    const remaining = Math.max(0, planned - actual);
    const statusMapped = mapStatus(currentOp?.status);

    const dueDate = order.deadline;
    const daysDue = daysUntilDue(dueDate);

    let score = 0;
    const reasons = [];

    if (daysDue !== null) {
      if (daysDue < 0) {
        score += 100;
        reasons.push('Просрочен');
      } else if (daysDue <= 1) {
        score += 50;
        reasons.push('Срок завтра или сегодня');
      } else if (daysDue <= 3) {
        score += 30;
        reasons.push('До срока ≤ 3 дня');
      } else if (daysDue <= 7) {
        score += 15;
        reasons.push('До срока ≤ 7 дней');
      }
    }

    if (['qc', 'pack'].includes(stepCode) && remaining > 0) {
      score += 20;
      reasons.push('Финальные этапы, осталось');
    }
    if (statusMapped === 'blocked') {
      score += 25;
      reasons.push('Этап заблокирован');
    }
    if (statusMapped === 'in_progress') {
      score += 10;
      reasons.push('В работе');
    }

    const qtyTotal = order.total_quantity || 1;
    const remainNorm = Math.min(20, (remaining / qtyTotal) * 20);
    score += remainNorm;

    const queue = queueByStep[stepCode] || { total: 0 };
    const maxQueue = Math.max(...Object.values(queueByStep).map((q) => q.total), 1);
    const bottleneckFactor = Math.min(30, (queue.total / maxQueue) * 30);
    score += bottleneckFactor;
    if (queue.total > 5) reasons.push(`Очередь на этапе ${stepName}: ${queue.total}`);

    let riskLevel = 'UNKNOWN';
    if (daysDue !== null) {
      if (daysDue < 0 || score >= 120) riskLevel = 'HIGH';
      else if (score >= 70) riskLevel = 'MEDIUM';
      else riskLevel = 'LOW';
    }

    result.push({
      order_id: order.id,
      order_name: order.title,
      client_name: order.Client?.name,
      due_date: dueDate,
      quantity_total: order.total_quantity,
      current_step: {
        step_code: stepCode,
        step_name: stepName,
        status: statusMapped,
        remaining_qty: remaining,
      },
      priority_score: Math.round(score),
      risk_level: riskLevel,
      reasons,
    });
  }

  result.sort((a, b) => b.priority_score - a.priority_score);
  return result.slice(0, limit);
}

/** Очередь по этапам (текущее состояние) */
async function getQueueByStep(from) {
  const where = { status: { [Op.in]: ['Ожидает', 'В работе'] } };
  if (from) {
    where.updated_at = { [Op.gte]: from };
  }
  const ops = await db.OrderOperation.findAll({
    where,
    include: [{ model: db.Operation, as: 'Operation', attributes: ['id', 'name', 'category'] }],
    attributes: ['operation_id', 'status'],
  });

  const byStep = {};
  for (const r of ops) {
    const code = getStepCode(r.Operation);
    if (!byStep[code]) byStep[code] = { pending: 0, in_progress: 0, blocked: 0, total: 0 };
    if (r.status === 'Ожидает') byStep[code].pending += 1;
    else if (r.status === 'В работе') byStep[code].in_progress += 1;
    else byStep[code].blocked += 1;
    byStep[code].total =
      byStep[code].pending + byStep[code].in_progress + byStep[code].blocked;
  }
  return byStep;
}

/**
 * GET /api/planner/bottleneck-map
 */
async function getBottleneckMap(params = {}) {
  const { days = DEFAULT_DAYS } = params;
  const from = new Date();
  from.setDate(from.getDate() - Number(days));

  const queueByStep = await getQueueByStep(null);

  const opsWithQty = await db.sequelize.query(
    `SELECT oo.operation_id, op.name, op.category,
            SUM(oo.actual_quantity) as total_qty,
            COUNT(*) as cnt
     FROM order_operations oo
     JOIN operations op ON op.id = oo.operation_id
     WHERE oo.updated_at >= :from AND oo.actual_quantity > 0
     GROUP BY oo.operation_id, op.name, op.category`,
    { replacements: { from }, type: db.sequelize.QueryTypes.SELECT }
  );

  const stepNames = {
    cut: 'Крой',
    sew: 'Швейка',
    buttonhole: 'Петля',
    button: 'Пуговица',
    label: 'Метка',
    qc: 'ОТК',
    pack: 'Упаковка',
  };

  const byStep = {};
  for (const r of opsWithQty || []) {
    const code = getStepCode(r);
    if (!byStep[code]) byStep[code] = { total_qty: 0, cnt: 0 };
    byStep[code].total_qty += parseInt(r.total_qty || 0, 10);
    byStep[code].cnt += parseInt(r.cnt || 0, 10);
  }

  const hoursInPeriod = days * 24;
  const result = [];
  const allSteps = new Set([...Object.keys(queueByStep), ...Object.keys(byStep)]);
  for (const code of allSteps) {
    const q = queueByStep[code] || { pending: 0, in_progress: 0, blocked: 0 };
    const rate = byStep[code];
    const avgRatePerHour =
      rate && hoursInPeriod > 0 ? (rate.total_qty / hoursInPeriod).toFixed(2) : null;
    const total = q.pending + q.in_progress + q.blocked;
    let note = 'данных мало';
    if (total > 10) note = 'очередь высокая';
    else if (total > 0) note = 'нормально';
    result.push({
      step_code: code,
      step_name: stepNames[code] || code,
      pending: q.pending,
      in_progress: q.in_progress,
      blocked: q.blocked,
      avg_rate_per_hour: avgRatePerHour ? parseFloat(avgRatePerHour) : null,
      note,
    });
  }
  result.sort((a, b) => b.pending + b.in_progress - (a.pending + a.in_progress));
  return result;
}

/**
 * GET /api/planner/recommendations
 */
async function getRecommendations(params = {}) {
  const { days = DEFAULT_DAYS } = params;
  const priorityList = await getPriority({ days, limit: 50 });
  const bottleneckMap = await getBottleneckMap({ days });

  const topRisks = priorityList
    .filter((p) => p.risk_level === 'HIGH' || p.risk_level === 'MEDIUM')
    .slice(0, 10)
    .map((p) => ({
      order_id: p.order_id,
      order_name: p.order_name,
      risk_level: p.risk_level,
      reasons: p.reasons,
      suggested_action: p.risk_level === 'HIGH'
        ? 'Срочно проверить статус и перераспределить'
        : 'Контролировать выполнение',
    }));

  const moveSuggestions = [];
  const highQueueSteps = ['sew', 'qc', 'pack'];
  for (const step of bottleneckMap) {
    const total = step.pending + step.in_progress + step.blocked;
    if (step.blocked > 2) {
      moveSuggestions.push({
        step_code: step.step_code,
        step_name: step.step_name,
        suggestion: `Проверь причины блокировок на этапе ${step.step_name}`,
        rationale: `Заблокировано: ${step.blocked}`,
      });
    }
    if (total > 8 && highQueueSteps.includes(step.step_code)) {
      moveSuggestions.push({
        step_code: step.step_code,
        step_name: step.step_name,
        suggestion: `Временно усилить этап ${step.step_name}`,
        rationale: `Очередь: ${total}`,
      });
    }
  }

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const workers = await db.sequelize.query(
    `SELECT u.id, u.name, COALESCE(SUM(oo.actual_quantity), 0)::int as total_qty
     FROM users u
     LEFT JOIN order_operations oo ON oo.responsible_user_id = u.id AND oo.updated_at >= :from
     WHERE u.role = 'operator'
     GROUP BY u.id, u.name`,
    {
      replacements: { from: fromDate },
      type: db.sequelize.QueryTypes.SELECT,
    }
  );

  const avgQty = workers.length
    ? workers.reduce((s, w) => s + parseInt(w.total_qty || 0, 10), 0) / workers.length
    : 0;
  for (const w of workers || []) {
    const qty = parseInt(w.total_qty || 0, 10);
    if (avgQty > 0 && qty < avgQty * 0.3) {
      moveSuggestions.push({
        step_code: null,
        step_name: null,
        suggestion: 'Проверь простои',
        rationale: `Низкая активность: ${w.name}`,
      });
      break;
    }
  }

  const maxQueueStep = bottleneckMap[0];
  if (maxQueueStep && (maxQueueStep.pending + maxQueueStep.in_progress) > 5) {
    moveSuggestions.push({
      step_code: maxQueueStep.step_code,
      step_name: maxQueueStep.step_name,
      suggestion: `Назначить 1-2 доп. операторов на ${maxQueueStep.step_name}`,
      rationale: 'Этап перегружен',
    });
  }

  return {
    top_risks: topRisks,
    move_suggestions: moveSuggestions,
  };
}

module.exports = {
  getPriority,
  getBottleneckMap,
  getRecommendations,
};
