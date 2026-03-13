/**
 * Модель: Заявка на закуп (один заказ = один запрос)
 * status: draft | sent | received
 */
module.exports = (sequelize, DataTypes) => {
  const ProcurementRequest = sequelize.define('ProcurementRequest', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    total_sum: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'procurement_requests',
    timestamps: true,
    underscored: true,
  });
  return ProcurementRequest;
};
