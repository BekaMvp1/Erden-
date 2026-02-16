/**
 * Модель: Операция (НОПА)
 * category: CUTTING|SEWING|FINISH
 * default_floor_id: этаж по умолчанию (building_floors)
 * locked_to_floor: если true — этаж менять нельзя (финишные операции)
 */

module.exports = (sequelize, DataTypes) => {
  const Operation = sequelize.define('Operation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    norm_minutes: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    default_floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'SEWING',
    },
    locked_to_floor: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    tableName: 'operations',
    timestamps: true,
    underscored: true,
  });
  return Operation;
};
