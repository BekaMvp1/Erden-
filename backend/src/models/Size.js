/**
 * Модель: Размер (справочник). Ростовка: code (40–56, S–5XL), type NUMERIC/ALPHA, sort_order.
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
    code: {
      type: DataTypes.STRING(10),
      allowNull: true,
      unique: true,
      comment: 'Нормализованный код: 40–56, S, M, L, XL, 2XL–5XL',
    },
    type: {
      type: DataTypes.ENUM('NUMERIC', 'ALPHA'),
      allowNull: true,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
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
