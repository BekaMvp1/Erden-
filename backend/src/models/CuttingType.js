/**
 * Модель: Справочник типов раскроя (Аксы, Аутсорс + динамические)
 */

module.exports = (sequelize, DataTypes) => {
  const CuttingType = sequelize.define('CuttingType', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  }, {
    tableName: 'cutting_types',
    timestamps: true,
    underscored: true,
  });
  return CuttingType;
};
