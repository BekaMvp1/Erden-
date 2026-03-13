'use strict';

/**
 * Миграция: производственный календарь (мощность и загрузка по дням)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('production_calendar', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      sewer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'sewers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      capacity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 480,
        comment: 'Мощность в минутах',
      },
      load: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Загрузка в минутах',
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

    await queryInterface.addIndex('production_calendar', ['date']);
    await queryInterface.addIndex('production_calendar', ['sewer_id']);
    await queryInterface.addIndex('production_calendar', ['date', 'sewer_id'], {
      unique: true,
      name: 'production_calendar_date_sewer_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('production_calendar');
  },
};
