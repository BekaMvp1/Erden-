'use strict';

/**
 * Сидер: этапы производства (steps)
 * Идемпотентный — upsert по code, повторный запуск не создаёт дубли
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const now = new Date();

    const steps = [
      { code: 'cut', name: 'Крой', order_index: 1 },
      { code: 'sew', name: 'Швейка', order_index: 2 },
      { code: 'buttonhole', name: 'Петля', order_index: 3 },
      { code: 'button', name: 'Пуговица', order_index: 4 },
      { code: 'label', name: 'Метка', order_index: 5 },
      { code: 'qc', name: 'ОТК', order_index: 6 },
      { code: 'pack', name: 'Упаковка', order_index: 7 },
    ];

    for (const s of steps) {
      await sequelize.query(
        `INSERT INTO steps (code, name, order_index, is_active, created_at, updated_at)
         VALUES (:code, :name, :order_index, true, :now, :now)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           order_index = EXCLUDED.order_index,
           is_active = EXCLUDED.is_active,
           updated_at = EXCLUDED.updated_at`,
        {
          replacements: {
            code: s.code,
            name: s.name,
            order_index: s.order_index,
            now,
          },
        }
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('steps', null, {});
  },
};
