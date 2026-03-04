/**
 * Единый статус пошива по заказу+этаж (2/3/4).
 * Один источник правды для «В работе» / «Завершено».
 */

module.exports = (sequelize, DataTypes) => {
  const SewingOrderFloor = sequelize.define(
    'SewingOrderFloor',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: { type: DataTypes.INTEGER, allowNull: false },
      floor_id: { type: DataTypes.INTEGER, allowNull: false },
      status: {
        type: DataTypes.ENUM('IN_PROGRESS', 'DONE'),
        allowNull: false,
        defaultValue: 'IN_PROGRESS',
      },
      done_at: { type: DataTypes.DATE, allowNull: true },
      done_batch_id: { type: DataTypes.INTEGER, allowNull: true },
    },
    { tableName: 'sewing_order_floors', timestamps: true, underscored: true }
  );
  return SewingOrderFloor;
};
