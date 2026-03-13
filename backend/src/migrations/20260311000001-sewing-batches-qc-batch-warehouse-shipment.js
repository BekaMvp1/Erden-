'use strict';

/**
 * ОТК по партиям: партии пошива → ОТК по партии → склад по партии → отгрузка по партии.
 * - sewing_batches: партия пошива (batch_code, status DONE/IN_PROGRESS)
 * - sewing_batch_items: план/факт по партии и размерам
 * - qc_batches + qc_batch_items: ОТК по партии и размерам
 * - warehouse_stock: добавлен batch_id (остатки по партии)
 * - shipments: добавлен batch_id; shipment_items — позиции отгрузки по размерам
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Партии пошива
    await queryInterface.createTable('sewing_batches', {
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
      model_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'models', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Модель изделия (денормализация)',
      },
      floor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      batch_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('IN_PROGRESS', 'DONE'),
        allowNull: false,
        defaultValue: 'IN_PROGRESS',
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
    await queryInterface.addIndex('sewing_batches', ['order_id']);
    await queryInterface.addIndex('sewing_batches', ['status']);

    // Факт пошива по партии и размерам
    await queryInterface.createTable('sewing_batch_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      batch_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sewing_batches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      model_size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'model_sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      planned_qty: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      fact_qty: {
        type: Sequelize.DECIMAL(12, 3),
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
    await queryInterface.addIndex('sewing_batch_items', ['batch_id', 'model_size_id'], {
      unique: true,
      name: 'sewing_batch_items_batch_model_size_unique',
    });

    // Связь плана пошива с партией (опционально)
    await queryInterface.addColumn('sewing_plans', 'batch_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'sewing_batches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('sewing_plans', ['batch_id']);

    // ОТК по партии (одна запись на партию)
    await queryInterface.createTable('qc_batches', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      batch_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'sewing_batches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      checked_total: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      passed_total: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      defect_total: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // ОТК по партии и размерам
    await queryInterface.createTable('qc_batch_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      qc_batch_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'qc_batches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      model_size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'model_sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      checked_qty: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      passed_qty: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      defect_qty: {
        type: Sequelize.DECIMAL(12, 3),
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
    await queryInterface.addIndex('qc_batch_items', ['qc_batch_id', 'model_size_id'], {
      unique: true,
      name: 'qc_batch_items_qc_batch_model_size_unique',
    });

    // Склад: добавлен batch_id (остатки по партии после ОТК)
    await queryInterface.addColumn('warehouse_stock', 'batch_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'sewing_batches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('warehouse_stock', ['batch_id']);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX warehouse_stock_batch_model_size_unique
      ON warehouse_stock (batch_id, model_size_id)
      WHERE batch_id IS NOT NULL
    `);

    // Позиции отгрузки (по размерам)
    await queryInterface.createTable('shipment_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      shipment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'shipments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      model_size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'model_sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      qty: {
        type: Sequelize.DECIMAL(12, 3),
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
    await queryInterface.addIndex('shipment_items', ['shipment_id']);

    // Отгрузка: добавлен batch_id (новая схема — одна отгрузка на партию с позициями в shipment_items)
    await queryInterface.addColumn('shipments', 'batch_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'sewing_batches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('shipments', ['batch_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('shipments', 'batch_id');
    await queryInterface.dropTable('shipment_items');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS warehouse_stock_batch_model_size_unique');
    await queryInterface.removeColumn('warehouse_stock', 'batch_id');
    await queryInterface.dropTable('qc_batch_items');
    await queryInterface.dropTable('qc_batches');
    await queryInterface.removeColumn('sewing_plans', 'batch_id');
    await queryInterface.dropTable('sewing_batch_items');
    await queryInterface.dropTable('sewing_batches');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_sewing_batches_status";');
  },
};
