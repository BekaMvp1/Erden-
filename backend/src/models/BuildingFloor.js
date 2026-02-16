/**
 * Модель: Этаж здания (для распределения заказов)
 * Отдельно от цехов пошива
 */

module.exports = (sequelize, DataTypes) => {
  const BuildingFloor = sequelize.define('BuildingFloor', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  }, {
    tableName: 'building_floors',
    timestamps: true,
    underscored: true,
  });
  return BuildingFloor;
};
