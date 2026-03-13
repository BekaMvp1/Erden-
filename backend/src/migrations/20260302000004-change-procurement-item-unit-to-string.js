'use strict';

/**
 * Миграция: расширить единицы измерения закупа
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE procurement_items
      ALTER COLUMN unit TYPE VARCHAR(20)
      USING unit::text;
    `);
    await queryInterface.changeColumn('procurement_items', 'unit', {
      type: Sequelize.STRING(20),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_procurement_items_unit') THEN
          CREATE TYPE enum_procurement_items_unit AS ENUM ('РУЛОН', 'КГ', 'ТОННА');
        END IF;
      END $$;
    `);
    await queryInterface.sequelize.query(`
      UPDATE procurement_items
      SET unit = CASE
        WHEN unit IN ('РУЛОН', 'КГ', 'ТОННА') THEN unit
        WHEN unit = 'МЕТР' THEN 'РУЛОН'
        WHEN unit = 'ШТ' THEN 'КГ'
        ELSE 'РУЛОН'
      END;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE procurement_items
      ALTER COLUMN unit TYPE enum_procurement_items_unit
      USING unit::enum_procurement_items_unit;
    `);
    await queryInterface.changeColumn('procurement_items', 'unit', {
      type: Sequelize.ENUM('РУЛОН', 'КГ', 'ТОННА'),
      allowNull: false,
    });
  },
};
