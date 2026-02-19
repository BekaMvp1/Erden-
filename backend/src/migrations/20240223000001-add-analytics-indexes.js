'use strict';

/**
 * Миграция: индексы для аналитики
 * orders, order_operations — для ускорения запросов overdue, bottlenecks, workers, timeline
 */

module.exports = {
  async up(queryInterface) {
    const indexes = [
      ['orders', 'idx_orders_deadline', 'deadline'],
      ['orders', 'idx_orders_client_id', 'client_id'],
      ['order_operations', 'idx_order_operations_updated_at', 'updated_at'],
      ['order_operations', 'idx_order_operations_order_created', 'order_id, created_at'],
      ['order_operations', 'idx_order_operations_sewer_updated', 'sewer_id, updated_at'],
      ['order_operations', 'idx_order_operations_op_status', 'operation_id, status'],
    ];
    for (const [table, name, cols] of indexes) {
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${cols})`
      );
    }
  },

  async down(queryInterface) {
    const names = [
      'idx_orders_deadline',
      'idx_orders_client_id',
      'idx_order_operations_updated_at',
      'idx_order_operations_order_created',
      'idx_order_operations_sewer_updated',
      'idx_order_operations_op_status',
    ];
    for (const name of names) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${name}`);
    }
  },
};
