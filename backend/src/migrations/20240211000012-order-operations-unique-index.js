'use strict';

/**
 * Миграция: уникальный индекс для защиты от дублей
 * (order_id, operation_id, planned_date) — одна операция на заказ на дату
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex(
      'order_operations',
      ['order_id', 'operation_id', 'planned_date'],
      {
        unique: true,
        name: 'order_operations_order_operation_date_unique',
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'order_operations',
      'order_operations_order_operation_date_unique'
    );
  },
};
