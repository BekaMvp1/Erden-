/**
 * План и факт пошива по партии и размеру. batch_total_fact = SUM(fact_qty) по batch_id.
 */

module.exports = (sequelize, DataTypes) => {
  const SewingBatchItem = sequelize.define(
    'SewingBatchItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      batch_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      model_size_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Легаси: при учёте по model_size',
      },
      size_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Учёт по справочнику размеров (ростовка)',
      },
      planned_qty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      fact_qty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'sewing_batch_items',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['batch_id', 'model_size_id'] }],
    }
  );
  return SewingBatchItem;
};
