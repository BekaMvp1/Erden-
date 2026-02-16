'use strict';

/**
 * Миграция: справочник размеров
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sizes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex('sizes', ['name'], { unique: true });
    await queryInterface.addIndex('sizes', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sizes');
  },
};
