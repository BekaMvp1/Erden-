/**
 * Модель: Детализация операции заказа по цвету и размеру
 * planned_qty / actual_qty для раскроя и финиша
 */

module.exports = (sequelize, DataTypes) => {
  const OrderOperationVariant = sequelize.define('OrderOperationVariant', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_operation_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    size: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    planned_qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    actual_qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'order_operation_variants',
    timestamps: true,
    underscored: true,
  });
  return OrderOperationVariant;
};
