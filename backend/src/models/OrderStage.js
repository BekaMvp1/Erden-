/**
 * Этап заказа в едином пайплайне: procurement, cutting, sewing, qc, warehouse, shipping.
 * Источник истины по статусу этапа (NOT_STARTED / IN_PROGRESS / DONE).
 */

module.exports = (sequelize, DataTypes) => {
  const OrderStage = sequelize.define(
    'OrderStage',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      stage_key: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'NOT_STARTED',
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      meta: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: 'order_stages',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['order_id', 'stage_key'] }],
    }
  );
  return OrderStage;
};
