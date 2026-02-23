'use strict';

/**
 * Миграция: таблица очереди синхронизации в облако
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sync_queue', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      entity_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      entity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_error: {
        type: Sequelize.TEXT,
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
    await queryInterface.addIndex('sync_queue', ['status']);
    await queryInterface.addIndex('sync_queue', ['entity_type', 'entity_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sync_queue');
  },
};
