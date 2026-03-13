/**
 * Модель: Статус заказа
 */

module.exports = (sequelize, DataTypes) => {
  const OrderStatus = sequelize.define('OrderStatus', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
  }, {
    tableName: 'order_status',
    timestamps: true,
    underscored: true,
  });
  return OrderStatus;
};
