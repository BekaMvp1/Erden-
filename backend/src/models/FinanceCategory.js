/**
 * Модель: категория финансов (БДР/БДДС)
 */

module.exports = (sequelize, DataTypes) => {
  const FinanceCategory = sequelize.define('FinanceCategory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
  }, {
    tableName: 'finance_categories',
    timestamps: true,
    underscored: true,
  });
  return FinanceCategory;
};
