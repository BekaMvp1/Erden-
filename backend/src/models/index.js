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
db.Order.hasOne(db.ProcurementRequest, { foreignKey: 'order_id' });
db.ProcurementRequest.belongsTo(db.Order, { foreignKey: 'order_id' });
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

module.exports = db;
