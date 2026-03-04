'use strict';

/**
 * Рост заказа: 165 / 170 / ручной (для раскроя).
 * order_height_type: PRESET (165 или 170) или CUSTOM (120–220).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_orders_height_type AS ENUM ('PRESET', 'CUSTOM');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryInterface.addColumn('orders', 'order_height_type', {
      type: 'enum_orders_height_type',
      allowNull: true,
      defaultValue: 'PRESET',
    });
    await queryInterface.addColumn('orders', 'order_height_value', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.sequelize.query(`UPDATE orders SET order_height_type = 'PRESET', order_height_value = 170 WHERE order_height_value IS NULL`);
    await queryInterface.sequelize.query(`ALTER TABLE orders ALTER COLUMN order_height_type SET DEFAULT 'PRESET'`);
    await queryInterface.sequelize.query(`ALTER TABLE orders ALTER COLUMN order_height_value SET DEFAULT 170`);
    await queryInterface.sequelize.query(`ALTER TABLE orders ALTER COLUMN order_height_type SET NOT NULL`);
    await queryInterface.sequelize.query(`ALTER TABLE orders ALTER COLUMN order_height_value SET NOT NULL`);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'order_height_type');
    await queryInterface.removeColumn('orders', 'order_height_value');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_orders_height_type;');
  },
};
