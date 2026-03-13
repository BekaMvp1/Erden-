/**
 * Helper для planner: маппинг operation -> step_code, статусы
 */

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

const CATEGORY_TO_STEP = {
  CUTTING: 'cut',
  SEWING: 'sew',
  FINISH: 'qc',
};

/** operation -> step_code */
function getStepCode(op) {
  if (!op) return 'unknown';
  const name = (op.name || '').toLowerCase();
  for (const [key, code] of Object.entries(NAME_TO_STEP)) {
    if (name.includes(key)) return code;
  }
  return CATEGORY_TO_STEP[op.category] || 'sew';
}

/** order_operations.status -> planner status */
function mapStatus(status) {
  if (status === 'Ожидает') return 'pending';
  if (status === 'В работе') return 'in_progress';
  if (status === 'Готово') return 'done';
  return 'pending';
}

/** Дней до deadline (отрицательно = просрочен) */
function daysUntilDue(deadline) {
  if (!deadline) return null;
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d - today) / (24 * 60 * 60 * 1000));
}

module.exports = { getStepCode, mapStatus, daysUntilDue };
