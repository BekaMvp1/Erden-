'use strict';

/**
 * Складской учёт по размерам, моделям и партиям (ОТК → склад → отгрузка).
 * - models + model_sizes: размерная сетка модели
 * - sewing_records: пошив по размерам
 * - qc_records: ОТК по размерам
 * - warehouse_stock: остатки по заказу, размеру, партии
 * - shipments: отгрузки со списанием со склада
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Справочник моделей (наименование изделия)
    await queryInterface.createTable('models', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(160),
        allowNull: false,
        comment: 'Название модели',
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

    // Размерная сетка модели (какие размеры есть у модели)
    await queryInterface.createTable('model_sizes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      model_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'models', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
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
    await queryInterface.addIndex('model_sizes', ['model_id', 'size_id'], {
      unique: true,
      name: 'model_sizes_model_size_unique',
    });

    // Ссылка заказа на модель (опционально)
    await queryInterface.addColumn('orders', 'model_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'models', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Пошив по размерам (этаж, размер модели, количество, дата)
    await queryInterface.createTable('sewing_records', {
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
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Этаж пошива',
      },
      model_size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'model_sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
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
    await queryInterface.addIndex('sewing_records', ['order_id', 'date']);
    await queryInterface.addIndex('sewing_records', ['model_size_id']);

    // ОТК: проверка по размерам (проверено / принято / брак)
    await queryInterface.createTable('qc_records', {
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
      model_size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'model_sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      checked_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Проверено',
      },
      passed_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Принято ОТК',
      },
      defect_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Брак',
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
    await queryInterface.addIndex('qc_records', ['order_id']);
    await queryInterface.addIndex('qc_records', ['model_size_id']);

    // Склад: остатки по заказу, размеру, партии (после ОТК: приход = passed_qty)
    await queryInterface.createTable('warehouse_stock', {
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
      model_size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'model_sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      batch: {
        type: Sequelize.STRING(80),
        allowNull: false,
        comment: 'Партия (идентификатор)',
      },
      qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Остаток на складе',
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
    await queryInterface.addIndex('warehouse_stock', ['order_id', 'model_size_id', 'batch'], {
      unique: true,
      name: 'warehouse_stock_order_model_size_batch_unique',
    });
    await queryInterface.addIndex('warehouse_stock', ['order_id']);

    // Отгрузки: списание со склада (shipment_qty ≤ warehouse_qty)
    await queryInterface.createTable('shipments', {
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
      model_size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'model_sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      batch: {
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      shipped_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      status: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: 'shipped',
        comment: 'shipped, cancelled',
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
    await queryInterface.addIndex('shipments', ['order_id']);
    await queryInterface.addIndex('shipments', ['shipped_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('shipments');
    await queryInterface.dropTable('warehouse_stock');
    await queryInterface.dropTable('qc_records');
    await queryInterface.dropTable('sewing_records');
    await queryInterface.removeColumn('orders', 'model_id');
    await queryInterface.dropTable('model_sizes');
    await queryInterface.dropTable('models');
  },
};
