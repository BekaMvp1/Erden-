'use strict';

/**
 * Миграция: completed_at для заказов, составной индекс
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'completed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex('orders', ['status_id', 'deadline'], {
      name: 'orders_status_deadline_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('orders', 'orders_status_deadline_idx');
    await queryInterface.removeColumn('orders', 'completed_at');
  },
};
