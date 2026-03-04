'use strict';

/**
 * Система периодов планирования по месяцам.
 * planning_periods: месяц как отдельный период (ACTIVE/CLOSED).
 * Все записи планирования привязываются к period_id.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Таблица периодов планирования
    await queryInterface.createTable('planning_periods', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      month: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Месяц 1–12',
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Год',
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Первый день периода (обычно 1-е число месяца)',
      },
      end_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Последний день периода (последний день месяца)',
      },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'CLOSED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
        comment: 'ACTIVE — можно редактировать, CLOSED — только просмотр',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('planning_periods', ['year', 'month'], {
      unique: true,
      name: 'planning_periods_year_month_unique',
    });

    // Добавляем period_id в production_plan_day (пока nullable)
    await queryInterface.addColumn('production_plan_day', 'period_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'planning_periods', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    // Добавляем period_id в weekly_plans
    await queryInterface.addColumn('weekly_plans', 'period_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'planning_periods', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    // Добавляем period_id в weekly_carry
    await queryInterface.addColumn('weekly_carry', 'period_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'planning_periods', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    // Создаём один период по умолчанию для существующих данных (март 2026)
    const [rows] = await queryInterface.sequelize.query(`
      INSERT INTO planning_periods (month, year, start_date, end_date, status, created_at)
      VALUES (3, 2026, '2026-03-01', '2026-03-31', 'ACTIVE', CURRENT_TIMESTAMP)
      RETURNING id
    `);
    const defaultPeriodId = rows && rows[0] ? rows[0].id : null;

    if (defaultPeriodId) {
      // Привязываем все существующие записи к этому периоду
      await queryInterface.sequelize.query(`
        UPDATE production_plan_day SET period_id = :pid WHERE period_id IS NULL
      `, { replacements: { pid: defaultPeriodId } });
      await queryInterface.sequelize.query(`
        UPDATE weekly_plans SET period_id = :pid WHERE period_id IS NULL
      `, { replacements: { pid: defaultPeriodId } });
      await queryInterface.sequelize.query(`
        UPDATE weekly_carry SET period_id = :pid WHERE period_id IS NULL
      `, { replacements: { pid: defaultPeriodId } });
    }

    // Делаем period_id обязательным
    await queryInterface.changeColumn('production_plan_day', 'period_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'planning_periods', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.changeColumn('weekly_plans', 'period_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'planning_periods', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.changeColumn('weekly_carry', 'period_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'planning_periods', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    // Уникальные индексы с period_id (старые удаляем, новые создаём)
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS production_plan_day_order_date_workshop_floor_unique
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX production_plan_day_period_order_date_workshop_floor_unique
      ON production_plan_day (period_id, order_id, date, workshop_id, COALESCE(floor_id, 0))
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS weekly_plans_workshop_floor_week_row_unique
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX weekly_plans_period_workshop_floor_week_row_unique
      ON weekly_plans (period_id, workshop_id, COALESCE(building_floor_id, 0), week_start, row_key)
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS weekly_carry_workshop_floor_week_row_unique
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX weekly_carry_period_workshop_floor_week_row_unique
      ON weekly_carry (period_id, workshop_id, COALESCE(building_floor_id, 0), week_start, row_key)
    `);
  },

  async down(queryInterface) {
    // Восстанавливаем старые уникальные индексы (без period_id)
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS production_plan_day_period_order_date_workshop_floor_unique
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX production_plan_day_order_date_workshop_floor_unique
      ON production_plan_day (order_id, date, workshop_id, COALESCE(floor_id, 0))
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS weekly_plans_period_workshop_floor_week_row_unique
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX weekly_plans_workshop_floor_week_row_unique
      ON weekly_plans (workshop_id, COALESCE(building_floor_id, 0), week_start, row_key)
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS weekly_carry_period_workshop_floor_week_row_unique
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX weekly_carry_workshop_floor_week_row_unique
      ON weekly_carry (workshop_id, COALESCE(building_floor_id, 0), week_start, row_key)
    `);

    await queryInterface.removeColumn('production_plan_day', 'period_id');
    await queryInterface.removeColumn('weekly_plans', 'period_id');
    await queryInterface.removeColumn('weekly_carry', 'period_id');

    await queryInterface.dropTable('planning_periods');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_planning_periods_status"');
  },
};
