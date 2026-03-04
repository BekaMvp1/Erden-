/**
 * Ростовка заказа: плановое количество по каждому размеру (size_id).
 * SUM(planned_qty) должна равняться orders.quantity.
 */

module.exports = (sequelize, DataTypes) => {
  const OrderRostovka = sequelize.define(
    'OrderRostovka',
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
      size_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      planned_qty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'order_rostovka',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['order_id', 'size_id'] }],
    }
  );
  return OrderRostovka;
};
