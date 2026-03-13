'use strict';

/**
 * Миграция: швеи (привязаны к технологам)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sewers', {
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
      technologist_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'technologists',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      capacity_per_day: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 480,
        comment: 'Мощность в минутах в день',
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

    await queryInterface.addIndex('sewers', ['user_id']);
    await queryInterface.addIndex('sewers', ['technologist_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sewers');
  },
};
