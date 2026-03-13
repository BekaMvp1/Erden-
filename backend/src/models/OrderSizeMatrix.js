/**
 * Размерная матрица заказа: плановое количество по каждому размеру модели.
 * Хранит только по размерам, не общее количество.
 */

module.exports = (sequelize, DataTypes) => {
  const OrderSizeMatrix = sequelize.define(
    'OrderSizeMatrix',
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
      planned_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'order_size_matrix',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['order_id', 'model_size_id'] }],
    }
  );
  return OrderSizeMatrix;
};
