'use strict';

/**
 * Сидер: буквенные размеры S–5XL, цифровые 38,40,42,44,46,48,50,52,54,56
 */
const LETTER_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
const NUMERIC_SIZES = ['38', '40', '42', '44', '46', '48', '50', '52', '54', '56'];
const ALL_SIZES = [...LETTER_SIZES, ...NUMERIC_SIZES];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = ALL_SIZES.map((name) => ({
      name,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert('sizes', rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('sizes', null, {});
  },
};
