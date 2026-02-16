/**
 * Модель: Операция заказа (распределение по швеям/этажам)
 * floor_id: фактический этаж (building_floors)
 * status: Ожидает|В работе|Готово
 * planned_total/actual_total: итого по операции
 */

module.exports = (sequelize, DataTypes) => {
  const OrderOperation = sequelize.define('OrderOperation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    operation_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sewer_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    responsible_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'Ожидает',
    },
    planned_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    actual_quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    planned_total: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    actual_total: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    planned_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  }, {
    tableName: 'order_operations',
    timestamps: true,
    underscored: true,
  });
  return OrderOperation;
};
