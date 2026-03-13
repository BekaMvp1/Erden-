/**
 * Инициализация моделей Sequelize и связей
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();
const config = require('../config/database.js');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const dbUrl = dbConfig.use_env_variable ? process.env[dbConfig.use_env_variable] : dbConfig;
if (!dbUrl) {
  throw new Error('DATABASE_URL не задан. Создайте файл backend/.env и укажите DATABASE_URL (см. .env.example)');
}

const sequelize = new Sequelize(dbUrl, {
  dialect: 'postgres',
  logging: false,
  ...(env === 'production' && dbConfig.dialectOptions && {
    dialectOptions: dbConfig.dialectOptions,
  }),
  define: {
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
});

const db = {
  sequelize,
  Sequelize,
  Floor: require('./Floor')(sequelize, Sequelize.DataTypes),
  BuildingFloor: require('./BuildingFloor')(sequelize, Sequelize.DataTypes),
  OrderStatus: require('./OrderStatus')(sequelize, Sequelize.DataTypes),
  User: require('./User')(sequelize, Sequelize.DataTypes),
  Client: require('./Client')(sequelize, Sequelize.DataTypes),
  Technologist: require('./Technologist')(sequelize, Sequelize.DataTypes),
  Sewer: require('./Sewer')(sequelize, Sequelize.DataTypes),
  Order: require('./Order')(sequelize, Sequelize.DataTypes),
  OrderStage: require('./OrderStage')(sequelize, Sequelize.DataTypes),
  Operation: require('./Operation')(sequelize, Sequelize.DataTypes),
  OrderOperation: require('./OrderOperation')(sequelize, Sequelize.DataTypes),
  OrderOperationVariant: require('./OrderOperationVariant')(sequelize, Sequelize.DataTypes),
  ProductionCalendar: require('./ProductionCalendar')(sequelize, Sequelize.DataTypes),
  AuditLog: require('./AuditLog')(sequelize, Sequelize.DataTypes),
  FinanceCategory: require('./FinanceCategory')(sequelize, Sequelize.DataTypes),
  FinancePlan2026: require('./FinancePlan2026')(sequelize, Sequelize.DataTypes),
  FinanceFact: require('./FinanceFact')(sequelize, Sequelize.DataTypes),
  OrderFinanceLink: require('./OrderFinanceLink')(sequelize, Sequelize.DataTypes),
  Color: require('./Color')(sequelize, Sequelize.DataTypes),
  OrderFloorDistribution: require('./OrderFloorDistribution')(sequelize, Sequelize.DataTypes),
  ProcurementRequest: require('./ProcurementRequest')(sequelize, Sequelize.DataTypes),
  ProcurementItem: require('./ProcurementItem')(sequelize, Sequelize.DataTypes),
  CuttingType: require('./CuttingType')(sequelize, Sequelize.DataTypes),
  CuttingTask: require('./CuttingTask')(sequelize, Sequelize.DataTypes),
  WarehouseItem: require('./WarehouseItem')(sequelize, Sequelize.DataTypes),
  WarehouseMovement: require('./WarehouseMovement')(sequelize, Sequelize.DataTypes),
  Size: require('./Size')(sequelize, Sequelize.DataTypes),
  OrderVariant: require('./OrderVariant')(sequelize, Sequelize.DataTypes),
  Workshop: require('./Workshop')(sequelize, Sequelize.DataTypes),
  ProductionPlanDay: require('./ProductionPlanDay')(sequelize, Sequelize.DataTypes),
  WeeklyPlan: require('./WeeklyPlan')(sequelize, Sequelize.DataTypes),
  WeeklyCapacity: require('./WeeklyCapacity')(sequelize, Sequelize.DataTypes),
  WeeklyCarry: require('./WeeklyCarry')(sequelize, Sequelize.DataTypes),
  PlanningPeriod: require('./PlanningPeriod')(sequelize, Sequelize.DataTypes),
  SyncQueue: require('./SyncQueue')(sequelize, Sequelize.DataTypes),
  ProductModel: require('./ProductModel')(sequelize, Sequelize.DataTypes),
  ModelSize: require('./ModelSize')(sequelize, Sequelize.DataTypes),
  SewingRecord: require('./SewingRecord')(sequelize, Sequelize.DataTypes),
  QcRecord: require('./QcRecord')(sequelize, Sequelize.DataTypes),
  WarehouseStock: require('./WarehouseStock')(sequelize, Sequelize.DataTypes),
  Shipment: require('./Shipment')(sequelize, Sequelize.DataTypes),
  OrderSizeMatrix: require('./OrderSizeMatrix')(sequelize, Sequelize.DataTypes),
  OrderRostovka: require('./OrderRostovka')(sequelize, Sequelize.DataTypes),
  SewingPlan: require('./SewingPlan')(sequelize, Sequelize.DataTypes),
  SewingPlanRow: require('./SewingPlanRow')(sequelize, Sequelize.DataTypes),
  SewingFact: require('./SewingFact')(sequelize, Sequelize.DataTypes),
  SewingBatch: require('./SewingBatch')(sequelize, Sequelize.DataTypes),
  SewingBatchItem: require('./SewingBatchItem')(sequelize, Sequelize.DataTypes),
  SewingOrderFloor: require('./SewingOrderFloor')(sequelize, Sequelize.DataTypes),
  QcBatch: require('./QcBatch')(sequelize, Sequelize.DataTypes),
  QcBatchItem: require('./QcBatchItem')(sequelize, Sequelize.DataTypes),
  ShipmentItem: require('./ShipmentItem')(sequelize, Sequelize.DataTypes),
};

// Связи
db.Floor.hasMany(db.User, { foreignKey: 'floor_id' });
db.User.belongsTo(db.Floor, { foreignKey: 'floor_id' });

db.Floor.hasMany(db.Technologist, { foreignKey: 'floor_id' });
db.Technologist.belongsTo(db.Floor, { foreignKey: 'floor_id' });
db.BuildingFloor.hasMany(db.Technologist, { foreignKey: 'building_floor_id' });
db.Technologist.belongsTo(db.BuildingFloor, { foreignKey: 'building_floor_id' });
db.User.hasOne(db.Technologist, { foreignKey: 'user_id' });
db.Technologist.belongsTo(db.User, { foreignKey: 'user_id' });

db.Technologist.hasMany(db.Sewer, { foreignKey: 'technologist_id' });
db.Sewer.belongsTo(db.Technologist, { foreignKey: 'technologist_id' });
db.User.hasOne(db.Sewer, { foreignKey: 'user_id' });
db.Sewer.belongsTo(db.User, { foreignKey: 'user_id' });

db.Client.hasMany(db.Order, { foreignKey: 'client_id' });
db.Order.belongsTo(db.Client, { foreignKey: 'client_id' });
db.Workshop.hasMany(db.Order, { foreignKey: 'workshop_id' });
db.Order.belongsTo(db.Workshop, { foreignKey: 'workshop_id' });
db.OrderStatus.hasMany(db.Order, { foreignKey: 'status_id' });
db.Order.belongsTo(db.OrderStatus, { foreignKey: 'status_id' });
db.Floor.hasMany(db.Order, { foreignKey: 'floor_id' });
db.Order.belongsTo(db.Floor, { foreignKey: 'floor_id' });
db.BuildingFloor.hasMany(db.Order, { foreignKey: 'building_floor_id' });
db.Order.belongsTo(db.BuildingFloor, { foreignKey: 'building_floor_id' });
db.Technologist.hasMany(db.Order, { foreignKey: 'technologist_id' });
db.Order.belongsTo(db.Technologist, { foreignKey: 'technologist_id' });

db.Order.hasMany(db.OrderOperation, { foreignKey: 'order_id' });
db.Order.hasMany(db.OrderStage, { foreignKey: 'order_id' });
db.OrderStage.belongsTo(db.Order, { foreignKey: 'order_id' });
db.OrderOperation.belongsTo(db.Order, { foreignKey: 'order_id' });
db.Operation.hasMany(db.OrderOperation, { foreignKey: 'operation_id' });
db.OrderOperation.belongsTo(db.Operation, { foreignKey: 'operation_id' });
db.Sewer.hasMany(db.OrderOperation, { foreignKey: 'sewer_id' });
db.OrderOperation.belongsTo(db.Sewer, { foreignKey: 'sewer_id' });
db.BuildingFloor.hasMany(db.OrderOperation, { foreignKey: 'floor_id' });
db.OrderOperation.belongsTo(db.BuildingFloor, { foreignKey: 'floor_id', as: 'Floor' });
db.User.hasMany(db.OrderOperation, { foreignKey: 'responsible_user_id' });
db.OrderOperation.belongsTo(db.User, { foreignKey: 'responsible_user_id' });
db.BuildingFloor.hasMany(db.Operation, { foreignKey: 'default_floor_id' });
db.Operation.belongsTo(db.BuildingFloor, { foreignKey: 'default_floor_id' });
db.OrderOperation.hasMany(db.OrderOperationVariant, { foreignKey: 'order_operation_id' });
db.OrderOperationVariant.belongsTo(db.OrderOperation, { foreignKey: 'order_operation_id' });

db.Sewer.hasMany(db.ProductionCalendar, { foreignKey: 'sewer_id' });
db.ProductionCalendar.belongsTo(db.Sewer, { foreignKey: 'sewer_id' });

db.User.hasMany(db.AuditLog, { foreignKey: 'user_id' });
db.AuditLog.belongsTo(db.User, { foreignKey: 'user_id' });

// Финансы
db.FinanceCategory.hasMany(db.FinancePlan2026, { foreignKey: 'category_id' });
db.FinancePlan2026.belongsTo(db.FinanceCategory, { foreignKey: 'category_id' });
db.FinanceCategory.hasMany(db.FinanceFact, { foreignKey: 'category_id' });
db.FinanceFact.belongsTo(db.FinanceCategory, { foreignKey: 'category_id' });
db.Order.hasMany(db.FinanceFact, { foreignKey: 'order_id' });
db.FinanceFact.belongsTo(db.Order, { foreignKey: 'order_id' });
db.Order.hasMany(db.OrderFinanceLink, { foreignKey: 'order_id' });
db.OrderFinanceLink.belongsTo(db.Order, { foreignKey: 'order_id' });

// Распределение по этажам (цехам пошива)
db.Order.hasMany(db.OrderFloorDistribution, { foreignKey: 'order_id' });
db.OrderFloorDistribution.belongsTo(db.Order, { foreignKey: 'order_id' });
db.Floor.hasMany(db.OrderFloorDistribution, { foreignKey: 'floor_id' });
db.OrderFloorDistribution.belongsTo(db.Floor, { foreignKey: 'floor_id' });
db.BuildingFloor.hasMany(db.OrderFloorDistribution, { foreignKey: 'building_floor_id' });
db.OrderFloorDistribution.belongsTo(db.BuildingFloor, { foreignKey: 'building_floor_id' });
db.Technologist.hasMany(db.OrderFloorDistribution, { foreignKey: 'technologist_id' });
db.OrderFloorDistribution.belongsTo(db.Technologist, { foreignKey: 'technologist_id' });
db.User.hasMany(db.OrderFloorDistribution, { foreignKey: 'distributed_by' });
db.OrderFloorDistribution.belongsTo(db.User, { foreignKey: 'distributed_by' });

// Закуп
db.Order.hasOne(db.ProcurementRequest, { foreignKey: 'order_id', as: 'ProcurementRequest' });
db.ProcurementRequest.belongsTo(db.Order, { foreignKey: 'order_id', as: 'Order' });
db.ProcurementRequest.hasMany(db.ProcurementItem, { foreignKey: 'procurement_request_id' });
db.ProcurementItem.belongsTo(db.ProcurementRequest, { foreignKey: 'procurement_request_id' });

// Раскрой
db.Order.hasMany(db.CuttingTask, { foreignKey: 'order_id' });
db.CuttingTask.belongsTo(db.Order, { foreignKey: 'order_id' });

// Варианты заказа (цвет × размер)
db.Size.hasMany(db.OrderVariant, { foreignKey: 'size_id' });
db.OrderVariant.belongsTo(db.Size, { foreignKey: 'size_id' });
db.Order.hasMany(db.OrderVariant, { foreignKey: 'order_id' });
db.OrderVariant.belongsTo(db.Order, { foreignKey: 'order_id' });

// Склад
db.WarehouseItem.hasMany(db.WarehouseMovement, { foreignKey: 'item_id' });
db.WarehouseMovement.belongsTo(db.WarehouseItem, { foreignKey: 'item_id' });
db.Order.hasMany(db.WarehouseMovement, { foreignKey: 'order_id' });
db.WarehouseMovement.belongsTo(db.Order, { foreignKey: 'order_id' });

// План производства по дням
db.Order.hasMany(db.ProductionPlanDay, { foreignKey: 'order_id' });
db.ProductionPlanDay.belongsTo(db.Order, { foreignKey: 'order_id' });
db.Workshop.hasMany(db.ProductionPlanDay, { foreignKey: 'workshop_id' });
db.ProductionPlanDay.belongsTo(db.Workshop, { foreignKey: 'workshop_id' });
db.BuildingFloor.hasMany(db.ProductionPlanDay, { foreignKey: 'floor_id' });
db.ProductionPlanDay.belongsTo(db.BuildingFloor, { foreignKey: 'floor_id' });

db.Workshop.hasMany(db.WeeklyPlan, { foreignKey: 'workshop_id' });
db.WeeklyPlan.belongsTo(db.Workshop, { foreignKey: 'workshop_id' });
db.BuildingFloor.hasMany(db.WeeklyPlan, { foreignKey: 'building_floor_id' });
db.WeeklyPlan.belongsTo(db.BuildingFloor, { foreignKey: 'building_floor_id' });

db.Workshop.hasMany(db.WeeklyCapacity, { foreignKey: 'workshop_id' });
db.WeeklyCapacity.belongsTo(db.Workshop, { foreignKey: 'workshop_id' });
db.BuildingFloor.hasMany(db.WeeklyCapacity, { foreignKey: 'building_floor_id' });
db.WeeklyCapacity.belongsTo(db.BuildingFloor, { foreignKey: 'building_floor_id' });

db.Workshop.hasMany(db.WeeklyCarry, { foreignKey: 'workshop_id' });
db.WeeklyCarry.belongsTo(db.Workshop, { foreignKey: 'workshop_id' });
db.BuildingFloor.hasMany(db.WeeklyCarry, { foreignKey: 'building_floor_id' });
db.WeeklyCarry.belongsTo(db.BuildingFloor, { foreignKey: 'building_floor_id' });

// Периоды планирования (месяцы)
db.PlanningPeriod.hasMany(db.ProductionPlanDay, { foreignKey: 'period_id' });
db.ProductionPlanDay.belongsTo(db.PlanningPeriod, { foreignKey: 'period_id' });
db.PlanningPeriod.hasMany(db.WeeklyPlan, { foreignKey: 'period_id' });
db.WeeklyPlan.belongsTo(db.PlanningPeriod, { foreignKey: 'period_id' });
db.PlanningPeriod.hasMany(db.WeeklyCarry, { foreignKey: 'period_id' });
db.WeeklyCarry.belongsTo(db.PlanningPeriod, { foreignKey: 'period_id' });

// Складской учёт по размерам и партиям (модель → пошив → ОТК → склад → отгрузка)
db.ProductModel.hasMany(db.ModelSize, { foreignKey: 'model_id' });
db.ModelSize.belongsTo(db.ProductModel, { foreignKey: 'model_id' });
db.Size.hasMany(db.ModelSize, { foreignKey: 'size_id' });
db.ModelSize.belongsTo(db.Size, { foreignKey: 'size_id' });

db.Order.belongsTo(db.ProductModel, { foreignKey: 'model_id' });
db.ProductModel.hasMany(db.Order, { foreignKey: 'model_id' });

db.Order.hasMany(db.SewingRecord, { foreignKey: 'order_id' });
db.SewingRecord.belongsTo(db.Order, { foreignKey: 'order_id' });
db.BuildingFloor.hasMany(db.SewingRecord, { foreignKey: 'floor_id' });
db.SewingRecord.belongsTo(db.BuildingFloor, { foreignKey: 'floor_id' });
db.ModelSize.hasMany(db.SewingRecord, { foreignKey: 'model_size_id' });
db.SewingRecord.belongsTo(db.ModelSize, { foreignKey: 'model_size_id' });

db.Order.hasMany(db.QcRecord, { foreignKey: 'order_id' });
db.QcRecord.belongsTo(db.Order, { foreignKey: 'order_id' });
db.ModelSize.hasMany(db.QcRecord, { foreignKey: 'model_size_id' });
db.QcRecord.belongsTo(db.ModelSize, { foreignKey: 'model_size_id' });

db.Order.hasMany(db.WarehouseStock, { foreignKey: 'order_id' });
db.WarehouseStock.belongsTo(db.Order, { foreignKey: 'order_id' });
db.ModelSize.hasMany(db.WarehouseStock, { foreignKey: 'model_size_id' });
db.WarehouseStock.belongsTo(db.ModelSize, { foreignKey: 'model_size_id' });

db.Order.hasMany(db.Shipment, { foreignKey: 'order_id' });
db.Shipment.belongsTo(db.Order, { foreignKey: 'order_id' });
db.ModelSize.hasMany(db.Shipment, { foreignKey: 'model_size_id' });
db.Shipment.belongsTo(db.ModelSize, { foreignKey: 'model_size_id' });

// План пошива по размерной матрице (план и факт по этажам и размерам)
db.Order.hasMany(db.OrderSizeMatrix, { foreignKey: 'order_id' });
db.OrderSizeMatrix.belongsTo(db.Order, { foreignKey: 'order_id' });
db.ModelSize.hasMany(db.OrderSizeMatrix, { foreignKey: 'model_size_id' });
db.OrderSizeMatrix.belongsTo(db.ModelSize, { foreignKey: 'model_size_id' });

db.Order.hasMany(db.OrderRostovka, { foreignKey: 'order_id' });
db.OrderRostovka.belongsTo(db.Order, { foreignKey: 'order_id' });
db.Size.hasMany(db.OrderRostovka, { foreignKey: 'size_id' });
db.OrderRostovka.belongsTo(db.Size, { foreignKey: 'size_id' });

db.Order.hasMany(db.SewingPlan, { foreignKey: 'order_id' });
db.SewingPlan.belongsTo(db.Order, { foreignKey: 'order_id' });
db.Order.hasMany(db.SewingFact, { foreignKey: 'order_id' });
db.SewingFact.belongsTo(db.Order, { foreignKey: 'order_id' });
db.Order.hasMany(db.SewingPlanRow, { foreignKey: 'order_id' });
db.SewingPlanRow.belongsTo(db.Order, { foreignKey: 'order_id' });
db.BuildingFloor.hasMany(db.SewingPlanRow, { foreignKey: 'floor_id' });
db.SewingPlanRow.belongsTo(db.BuildingFloor, { foreignKey: 'floor_id' });
db.BuildingFloor.hasMany(db.SewingFact, { foreignKey: 'floor_id' });
db.SewingFact.belongsTo(db.BuildingFloor, { foreignKey: 'floor_id' });
db.BuildingFloor.hasMany(db.SewingPlan, { foreignKey: 'floor_id' });
db.SewingPlan.belongsTo(db.BuildingFloor, { foreignKey: 'floor_id' });
db.ModelSize.hasMany(db.SewingPlan, { foreignKey: 'model_size_id' });
db.SewingPlan.belongsTo(db.ModelSize, { foreignKey: 'model_size_id' });

// Партии пошива и ОТК по партиям
db.Order.hasMany(db.SewingBatch, { foreignKey: 'order_id' });
db.SewingBatch.belongsTo(db.Order, { foreignKey: 'order_id' });
db.ProductModel.hasMany(db.SewingBatch, { foreignKey: 'model_id' });
db.SewingBatch.belongsTo(db.ProductModel, { foreignKey: 'model_id' });
db.BuildingFloor.hasMany(db.SewingBatch, { foreignKey: 'floor_id' });
db.SewingBatch.belongsTo(db.BuildingFloor, { foreignKey: 'floor_id' });
db.SewingBatch.hasMany(db.SewingPlan, { foreignKey: 'batch_id' });
db.SewingPlan.belongsTo(db.SewingBatch, { foreignKey: 'batch_id' });

db.SewingBatch.hasMany(db.SewingBatchItem, { foreignKey: 'batch_id' });
    db.SewingBatchItem.belongsTo(db.SewingBatch, { foreignKey: 'batch_id' });
db.Order.hasMany(db.SewingOrderFloor, { foreignKey: 'order_id' });
db.SewingOrderFloor.belongsTo(db.Order, { foreignKey: 'order_id' });
db.BuildingFloor.hasMany(db.SewingOrderFloor, { foreignKey: 'floor_id' });
db.SewingOrderFloor.belongsTo(db.BuildingFloor, { foreignKey: 'floor_id' });
db.SewingBatch.hasOne(db.SewingOrderFloor, { foreignKey: 'done_batch_id' });
db.SewingOrderFloor.belongsTo(db.SewingBatch, { foreignKey: 'done_batch_id' });
db.ModelSize.hasMany(db.SewingBatchItem, { foreignKey: 'model_size_id' });
db.SewingBatchItem.belongsTo(db.ModelSize, { foreignKey: 'model_size_id' });
db.Size.hasMany(db.SewingBatchItem, { foreignKey: 'size_id' });
db.SewingBatchItem.belongsTo(db.Size, { foreignKey: 'size_id' });

db.SewingBatch.hasOne(db.QcBatch, { foreignKey: 'batch_id' });
db.QcBatch.belongsTo(db.SewingBatch, { foreignKey: 'batch_id' });
db.QcBatch.hasMany(db.QcBatchItem, { foreignKey: 'qc_batch_id' });
db.QcBatchItem.belongsTo(db.QcBatch, { foreignKey: 'qc_batch_id' });
db.ModelSize.hasMany(db.QcBatchItem, { foreignKey: 'model_size_id' });
db.QcBatchItem.belongsTo(db.ModelSize, { foreignKey: 'model_size_id' });
db.Size.hasMany(db.QcBatchItem, { foreignKey: 'size_id' });
db.QcBatchItem.belongsTo(db.Size, { foreignKey: 'size_id' });

db.SewingBatch.hasMany(db.WarehouseStock, { foreignKey: 'batch_id' });
db.WarehouseStock.belongsTo(db.SewingBatch, { foreignKey: 'batch_id' });
db.Size.hasMany(db.WarehouseStock, { foreignKey: 'size_id' });
db.WarehouseStock.belongsTo(db.Size, { foreignKey: 'size_id' });

db.SewingBatch.hasMany(db.Shipment, { foreignKey: 'batch_id' });
db.Shipment.belongsTo(db.SewingBatch, { foreignKey: 'batch_id' });
db.Shipment.hasMany(db.ShipmentItem, { foreignKey: 'shipment_id' });
db.ShipmentItem.belongsTo(db.Shipment, { foreignKey: 'shipment_id' });
db.ModelSize.hasMany(db.ShipmentItem, { foreignKey: 'model_size_id' });
db.ShipmentItem.belongsTo(db.ModelSize, { foreignKey: 'model_size_id' });
db.Size.hasMany(db.ShipmentItem, { foreignKey: 'size_id' });
db.ShipmentItem.belongsTo(db.Size, { foreignKey: 'size_id' });

module.exports = db;
