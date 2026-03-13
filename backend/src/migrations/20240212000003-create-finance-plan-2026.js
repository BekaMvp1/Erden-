'use strict';

/**
 * Миграция: плановые показатели БДР/БДДС по месяцам 2026
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('finance_plan_2026', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      type: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'finance_categories',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      month: {
        type: Sequelize.STRING(7),
        allowNull: false,
      },
      planned_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.addIndex('finance_plan_2026', ['type', 'category_id', 'month'], {
      unique: true,
      name: 'finance_plan_2026_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('finance_plan_2026');
  },
};
