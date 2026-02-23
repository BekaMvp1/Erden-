/**
 * Модель: очередь синхронизации в облако
 */

module.exports = (sequelize, DataTypes) => {
  const SyncQueue = sequelize.define(
    'SyncQueue',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      entity_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      entity_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_error: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'sync_queue',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );
  return SyncQueue;
};
