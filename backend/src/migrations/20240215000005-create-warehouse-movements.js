'use strict';

/**
 * Миграция: движения по складу (приход/расход)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('warehouse_movements', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'warehouse_items',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      type: {
        type: Sequelize.ENUM('ПРИХОД', 'РАСХОД'),
        allowNull: false,
      },
      quantity: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'orders',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      comment: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('warehouse_movements', ['item_id']);
    await queryInterface.addIndex('warehouse_movements', ['order_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('warehouse_movements');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_warehouse_movements_type";');
  },
};
