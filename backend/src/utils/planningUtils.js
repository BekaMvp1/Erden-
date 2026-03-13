/**
 * Утилиты планирования: мощность, загрузка, рабочие дни
 * Стандарт: 6 рабочих дней в неделю (ВС — выходной)
 */

/** Рабочих дней в неделю (Пн–Сб) */
const WORKING_DAYS_PER_WEEK = 6;

/**
 * Является ли дата рабочим днём (ВС = выходной)
 * @param {string} dateStr YYYY-MM-DD
 * @returns {boolean}
 */
function isWorkingDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0 = ВС, 6 = СБ
  return day !== 0;
}

/**
 * Возвращает рабочие дни в диапазоне [from, to]
 * @param {string} from YYYY-MM-DD
 * @param {string} to YYYY-MM-DD
 * @returns {string[]}
 */
function getWorkingDaysInRange(from, to) {
  const dates = [];
  const d = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (d <= end) {
    const str = d.toISOString().slice(0, 10);
    if (isWorkingDay(str)) dates.push(str);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/**
 * Понедельник недели для даты
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string} YYYY-MM-DD
 */
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

module.exports = {
  WORKING_DAYS_PER_WEEK,
  isWorkingDay,
  getWorkingDaysInRange,
  getWeekStart,
};
