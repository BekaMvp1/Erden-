/**
 * Модель: Вариант заказа (цвет + размер + количество)
 */

module.exports = (sequelize, DataTypes) => {
  const OrderVariant = sequelize.define('OrderVariant', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    size_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  }, {
    tableName: 'order_variants',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
  });
  return OrderVariant;
};
