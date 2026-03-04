/**
 * Отгрузка: списание со склада по размерам и партии.
 * shipment_qty не может превышать warehouse_qty.
 */

module.exports = (sequelize, DataTypes) => {
  const Shipment = sequelize.define(
    'Shipment',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Легаси: при batch_id = null',
      },
      batch_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Партия (новая схема: отгрузка по партии, позиции в ShipmentItem)',
      },
      model_size_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Легаси: при batch_id = null',
      },
      batch: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'Легаси',
      },
      qty: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: 'Легаси: при batch_id = null',
      },
      shipped_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'shipped',
      },
    },
    {
      tableName: 'shipments',
      timestamps: true,
      underscored: true,
    }
  );
  return Shipment;
};
