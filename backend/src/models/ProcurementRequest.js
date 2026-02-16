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
  }, {
    tableName: 'procurement_requests',
    timestamps: true,
    underscored: true,
  });
  return ProcurementRequest;
};
