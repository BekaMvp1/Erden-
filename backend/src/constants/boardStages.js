/**
 * Константы этапов панели заказов
 */

const STAGES = [
  { key: 'procurement', title_ru: 'Закуп', order: 1 },
  { key: 'warehouse', title_ru: 'Склад', order: 2 },
  { key: 'cutting', title_ru: 'Раскрой', order: 3 },
  { key: 'sewing', title_ru: 'Пошив', order: 4 },
  { key: 'qc', title_ru: 'ОТК', order: 5 },
  { key: 'packing', title_ru: 'Упаковка', order: 6 },
  { key: 'fg_warehouse', title_ru: 'Склад ГП', order: 7 },
  { key: 'shipping', title_ru: 'Отгрузка', order: 8 },
];

const DEFAULT_STAGE_DAYS = {
  procurement: 3,
  warehouse: 1,
  cutting: 1,
  sewing: 1,
  qc: 1,
  packing: 1,
  fg_warehouse: 1,
  shipping: 1,
};

module.exports = {
  STAGES,
  DEFAULT_STAGE_DAYS,
};
