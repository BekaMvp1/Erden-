/**
 * Модель: Размер (справочник)
 */

module.exports = (sequelize, DataTypes) => {
  const Size = sequelize.define('Size', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  }, {
    tableName: 'sizes',
    timestamps: true,
    underscored: true,
  });
  return Size;
};
