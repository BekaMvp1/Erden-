'use strict';

/**
 * Миграция: заявки на закуп (один заказ = один запрос)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('procurement_requests', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'orders',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('Ожидает закуп', 'Закуплено', 'Частично', 'Отменено'),
        allowNull: false,
        defaultValue: 'Ожидает закуп',
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

    await queryInterface.addIndex('procurement_requests', ['order_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('procurement_requests');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_procurement_requests_status";');
  },
};
