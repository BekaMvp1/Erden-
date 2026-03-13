/**
 * Константы этапов панели заказов.
 * Порядок: Закуп → Планирование → Раскрой → Пошив → ОТК → Склад → Отгрузка
 */

const STAGES = [
  { key: 'procurement', title_ru: 'Закуп', order: 1 },
  { key: 'planning', title_ru: 'Планирование', order: 2 },
  { key: 'cutting', title_ru: 'Раскрой', order: 3 },
  { key: 'sewing', title_ru: 'Пошив', order: 4 },
  { key: 'qc', title_ru: 'ОТК', order: 5 },
  { key: 'warehouse', title_ru: 'Склад', order: 6 },
  { key: 'shipping', title_ru: 'Отгрузка', order: 7 },
  { key: 'packing', title_ru: 'Упаковка', order: 8 },
  { key: 'fg_warehouse', title_ru: 'Склад ГП', order: 9 },
];

const DEFAULT_STAGE_DAYS = {
  procurement: 3,
  planning: 1,
  cutting: 1,
  sewing: 1,
  qc: 1,
  warehouse: 1,
  shipping: 1,
  packing: 1,
  fg_warehouse: 1,
};

module.exports = {
  STAGES,
  DEFAULT_STAGE_DAYS,
};
