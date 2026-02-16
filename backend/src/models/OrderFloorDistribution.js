/**
 * Модель: Распределение заказа по этажу (цеху пошива)
 * Журнал распределений заказов по цехам
 */

module.exports = (sequelize, DataTypes) => {
  const OrderFloorDistribution = sequelize.define('OrderFloorDistribution', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    building_floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    technologist_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    distributed_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    tableName: 'order_floor_distributions',
    timestamps: true,
    underscored: true,
  });
  return OrderFloorDistribution;
};
