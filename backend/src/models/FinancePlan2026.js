/**
 * Модель: плановые показатели БДР/БДДС по месяцам 2026
 */

module.exports = (sequelize, DataTypes) => {
  const FinancePlan2026 = sequelize.define('FinancePlan2026', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    month: {
      type: DataTypes.STRING(7),
      allowNull: false,
    },
    planned_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'finance_plan_2026',
    timestamps: true,
    underscored: true,
  });
  return FinancePlan2026;
};
