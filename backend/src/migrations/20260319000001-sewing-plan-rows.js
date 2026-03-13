'use strict';

/**
 * План пошива по (order_id, floor_id, work_date) — единый источник плана для доски пошива.
 * Связка только по order_id + floor_id.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sewing_plan_rows', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      floor_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      work_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      plan_qty: {
        type: Sequelize.INTEGER,
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
    await queryInterface.addIndex('sewing_plan_rows', ['order_id', 'floor_id', 'work_date'], {
      unique: true,
      name: 'sewing_plan_rows_order_floor_date_unique',
    });
    await queryInterface.addIndex('sewing_plan_rows', ['order_id']);
    await queryInterface.addIndex('sewing_plan_rows', ['floor_id']);
    await queryInterface.addIndex('sewing_plan_rows', ['work_date']);

    // Обратное заполнение из sewing_plans (агрегат по order_id, floor_id, date)
    const [rows] = await queryInterface.sequelize.query(`
      SELECT order_id, floor_id, date AS work_date, SUM(planned_qty)::int AS plan_qty
      FROM sewing_plans
      WHERE floor_id IN (2, 3, 4) AND date IS NOT NULL
      GROUP BY order_id, floor_id, date
      HAVING SUM(planned_qty) > 0
    `);
    if (rows && rows.length > 0) {
      for (const r of rows) {
        await queryInterface.sequelize.query(
          `INSERT INTO sewing_plan_rows (order_id, floor_id, work_date, plan_qty, created_at, updated_at)
           VALUES (:order_id, :floor_id, :work_date, :plan_qty, NOW(), NOW())
           ON CONFLICT (order_id, floor_id, work_date) DO NOTHING`,
          {
            replacements: {
              order_id: r.order_id,
              floor_id: r.floor_id,
              work_date: r.work_date,
              plan_qty: Number(r.plan_qty) || 0,
            },
          }
        );
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sewing_plan_rows');
  },
};
