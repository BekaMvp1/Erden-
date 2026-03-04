'use strict';

/**
 * Перенос остатка на следующую неделю: храним carry отдельно от manual
 * weekly_carry: (workshop_id, building_floor_id, week_start, row_key, carry_qty)
 * carry_qty = остаток с предыдущей недели (max(0, planned_total - fact))
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('weekly_carry', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      workshop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'workshops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      building_floor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      week_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      row_key: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'order_id — строка планирования',
      },
      carry_qty: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
        comment: 'Перенос с предыдущей недели (остаток)',
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

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX weekly_carry_workshop_floor_week_row_unique
      ON weekly_carry (workshop_id, COALESCE(building_floor_id, 0), week_start, row_key);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('weekly_carry');
  },
};
