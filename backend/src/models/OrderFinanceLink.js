/**
 * Модель: связь заказа с плановыми финансовыми показателями
 */

module.exports = (sequelize, DataTypes) => {
  const OrderFinanceLink = sequelize.define('OrderFinanceLink', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    planned_revenue: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
    },
    planned_cost: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
    },
  }, {
    tableName: 'order_finance_link',
    timestamps: true,
    underscored: true,
  });
  return OrderFinanceLink;
};
