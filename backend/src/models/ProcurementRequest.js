/**
 * Модель: Заявка на закуп (один заказ = один запрос)
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
      type: DataTypes.ENUM('Ожидает закуп', 'Закуплено', 'Частично', 'Отменено'),
      allowNull: false,
      defaultValue: 'Ожидает закуп',
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
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    tableName: 'procurement_requests',
    timestamps: true,
    underscored: true,
  });
  return ProcurementRequest;
};
