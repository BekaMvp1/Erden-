/**
 * Производственная цепочка заказа (единый путь, без альтернатив).
 * Каждый этап открывается только после завершения предыдущего.
 */

const PIPELINE_STAGES = [
  'procurement',  // Закуп
  'planning',     // Планирование
  'cutting',      // Раскрой
  'sewing',       // Пошив
  'qc',           // ОТК
  'warehouse',    // Склад
  'shipping',     // Отгрузка
];

/** Порядок отображения на панели заказов */
const PIPELINE_DISPLAY = [
  { key: 'procurement', title_ru: 'Закуп' },
  { key: 'planning', title_ru: 'Планирование' },
  { key: 'cutting', title_ru: 'Раскрой' },
  { key: 'sewing', title_ru: 'Пошив' },
  { key: 'qc', title_ru: 'ОТК' },
  { key: 'warehouse', title_ru: 'Склад' },
  { key: 'shipping', title_ru: 'Отгрузка' },
];

module.exports = {
  PIPELINE_STAGES,
  PIPELINE_DISPLAY,
};
