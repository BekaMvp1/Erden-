'use strict';

/**
 * Миграция: добавление total_quantity в orders
 * total_quantity — общее количество заказа (сумма матрицы цвет×размер)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'total_quantity', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    // Заполняем из quantity для существующих заказов
    await queryInterface.sequelize.query(`
      UPDATE orders SET total_quantity = quantity WHERE total_quantity IS NULL
    `);
    await queryInterface.changeColumn('orders', 'total_quantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'total_quantity');
  },
};
