'use strict';

/**
 * Миграция: технологи (привязаны к цехам пошива)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('technologists', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      floor_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'floors',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
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

    await queryInterface.addIndex('technologists', ['user_id']);
    await queryInterface.addIndex('technologists', ['floor_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('technologists');
  },
};
