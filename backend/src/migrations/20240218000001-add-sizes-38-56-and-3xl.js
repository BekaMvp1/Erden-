'use strict';

/**
 * Миграция: добавить размеры 3XL–5XL и 38,40,42,44,46,48,50,52,54,56 для существующих БД
 * (seed уже обновлён для новых установок)
 */

const NUMERIC_SIZES = ['38', '40', '42', '44', '46', '48', '50', '52', '54', '56'];
const NEW_SIZES = ['3XL', '4XL', '5XL', ...NUMERIC_SIZES];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [existing] = await queryInterface.sequelize.query(
      `SELECT name FROM sizes`
    );
    const existingNames = new Set((existing || []).map((r) => r.name));
    const toInsert = NEW_SIZES.filter((n) => !existingNames.has(n));
    if (toInsert.length === 0) return;

    const rows = toInsert.map((name) => ({
      name,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert('sizes', rows);
  },

  async down() {
    // Не удаляем — могут быть заказы с этими размерами
  },
};
