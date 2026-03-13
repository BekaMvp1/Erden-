'use strict';

/**
 * Миграция: задачи на раскрой по заказам
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cutting_tasks', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      cutting_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Аксы, Аутсорс или название из cutting_types',
      },
      operation: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Ожидает',
      },
      responsible: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('cutting_tasks', ['order_id']);
    await queryInterface.addIndex('cutting_tasks', ['cutting_type']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cutting_tasks');
  },
};
