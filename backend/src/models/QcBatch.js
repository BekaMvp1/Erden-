/**
 * ОТК по партии (одна запись на партию). Итоги: проверено, принято, брак.
 */

module.exports = (sequelize, DataTypes) => {
  const QcBatch = sequelize.define(
    'QcBatch',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      batch_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'DONE',
      },
      checked_total: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      passed_total: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      defect_total: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'qc_batches',
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  );
  return QcBatch;
};
