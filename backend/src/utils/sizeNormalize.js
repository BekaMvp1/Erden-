/**
 * Нормализация кода размера для ростовки.
 * XXL => 2XL, XXXL => 3XL, XXXXL => 4XL, XXXXXL => 5XL.
 * Приведение к uppercase. Только значения из справочника sizes (по code).
 */

const CODE_ALIASES = {
  XXL: '2XL',
  XXXL: '3XL',
  XXXXL: '4XL',
  XXXXXL: '5XL',
};

/**
 * Нормализовать введённый код размера (uppercase, алиасы).
 * @param {string} input
 * @returns {string}
 */
function normalizeSizeCode(input) {
  if (input == null || typeof input !== 'string') return '';
  const s = input.trim().toUpperCase();
  return CODE_ALIASES[s] || s;
}

/**
 * Проверить, что нормализованный код есть в списке размеров (по полю code).
 * @param {string} code — уже нормализованный
 * @param {Array<{ code: string }>} sizesList
 * @returns {boolean}
 */
function isValidCode(code, sizesList) {
  if (!code || !Array.isArray(sizesList)) return false;
  return sizesList.some((s) => (s.code || s.name || '').toString().trim().toUpperCase() === code);
}

/**
 * Найти size_id по коду в списке размеров.
 * @param {string} code — нормализованный
 * @param {Array<{ id: number, code?: string, name?: string }>} sizesList
 * @returns {number|null}
 */
function findSizeIdByCode(code, sizesList) {
  if (!code || !Array.isArray(sizesList)) return null;
  const upper = code.toString().trim().toUpperCase();
  const row = sizesList.find((s) => (s.code || s.name || '').toString().trim().toUpperCase() === upper);
  return row ? row.id : null;
}

module.exports = {
  normalizeSizeCode,
  isValidCode,
  findSizeIdByCode,
  CODE_ALIASES,
};
