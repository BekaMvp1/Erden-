/**
 * Склад: остатки по заказу, размеру модели, партии.
 * Пополнение — после ОТК (passed_qty). Списание — при отгрузке.
 */

module.exports = (sequelize, DataTypes) => {
  const WarehouseStock = sequelize.define(
    'WarehouseStock',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      model_size_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      batch: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'Легаси: строковый код партии (при batch_id = null)',
      },
      batch_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Партия пошива (новая схема: склад по партиям)',
      },
      qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'warehouse_stock',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['order_id', 'model_size_id', 'batch'] }],
    }
  );
  return WarehouseStock;
};
