/**
 * ОТК по партии и размеру. defect_qty = checked_qty - passed_qty, passed_qty <= checked_qty.
 */

module.exports = (sequelize, DataTypes) => {
  const QcBatchItem = sequelize.define(
    'QcBatchItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      qc_batch_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      model_size_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      checked_qty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      passed_qty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      defect_qty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'qc_batch_items',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['qc_batch_id', 'model_size_id'] }],
    }
  );
  return QcBatchItem;
};
