/**
 * Express приложение
 */

const express = require("express");
const cors = require("cors");
const {
  authenticate,
  requireRole,
  technologistFloorOnly,
  operatorRestricted,
} = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const ordersRoutes = require("./routes/orders");
const procurementRoutes = require("./routes/procurement");
const cuttingRoutes = require("./routes/cutting");
const warehouseRoutes = require("./routes/warehouse");
const planningRoutes = require("./routes/planning");
const orderOperationsRoutes = require("./routes/orderOperations");
const reportsRoutes = require("./routes/reports");
const referencesRoutes = require("./routes/references");
const workshopsRoutes = require("./routes/workshops");
const financeRoutes = require("./routes/finance");
const aiRoutes = require("./routes/ai");
const settingsRoutes = require("./routes/settings");
const sizesRoutes = require("./routes/sizes");
const executiveRoutes = require("./routes/executive");

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

// Публичные роуты
app.use("/api/auth", authRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Справочник размеров (для матрицы цвет×размер)
app.use(
  "/api/sizes",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  sizesRoutes,
);

// Защищённые роуты
app.use(
  "/api/dashboard",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  dashboardRoutes,
);
app.use(
  "/api/orders",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  ordersRoutes,
);
app.use(
  "/api/procurement",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  operatorRestricted,
  procurementRoutes,
);
app.use(
  "/api/cutting",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  operatorRestricted,
  cuttingRoutes,
);
app.use(
  "/api/warehouse",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  operatorRestricted,
  warehouseRoutes,
);
app.use(
  "/api/planning",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  planningRoutes,
);
app.use(
  "/api/order-operations",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  orderOperationsRoutes,
);
app.use(
  "/api/reports",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  operatorRestricted,
  reportsRoutes,
);
app.use(
  "/api/references",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  referencesRoutes,
);
app.use(
  "/api/workshops",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  workshopsRoutes,
);
app.use(
  "/api/finance",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  financeRoutes,
);
app.use(
  "/api/ai",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  aiRoutes,
);
app.use(
  "/api/settings",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  settingsRoutes,
);
app.use(
  "/api/executive",
  authenticate,
  requireRole("admin", "manager"),
  executiveRoutes,
);

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не найден" });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error("Ошибка:", err);
  const status = err.status || 500;
  const response = {
    error: err.message || "Внутренняя ошибка сервера",
  };
  // В режиме разработки — полная информация об ошибке
  if (process.env.NODE_ENV !== "production") {
    response.stack = err.stack;
    response.name = err.name;
  }
  res.status(status).json(response);
});

module.exports = app;
