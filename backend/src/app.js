/**
 * Express приложение
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
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
const reportsV2Routes = require("./routes/reportsV2Routes");
const referencesRoutes = require("./routes/references");
const workshopsRoutes = require("./routes/workshops");
const financeRoutes = require("./routes/finance");
const aiRoutes = require("./routes/ai");
const settingsRoutes = require("./routes/settings");
const sizesRoutes = require("./routes/sizes");
const analyticsRoutes = require("./modules/analytics/analytics.routes");
const assistantRoutes = require("./modules/assistant/assistant.routes");
const plannerRoutes = require("./modules/planner/planner.routes");

const app = express();

// Render: proxy HTTPS (x-forwarded-proto)
app.set("trust proxy", 1);

// CORS — первым, до helmet и роутов
const allowedOrigins = [
  "https://erdenbrand1.netlify.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

// Разрешить все Netlify-деплои (*.netlify.app)
const isNetlify = (origin) => {
  if (!origin || typeof origin !== "string") return false;
  try {
    return new URL(origin).hostname.endsWith(".netlify.app");
  } catch {
    return false;
  }
};

// Разрешить локальную сеть (телефон/планшет с того же Wi‑Fi)
const isLocalNetwork = (origin) => {
  if (!origin || typeof origin !== "string") return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    return host === "localhost" || host === "127.0.0.1" ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  } catch {
    return false;
  }
};

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (isNetlify(origin)) return cb(null, true);
    if (isLocalNetwork(origin)) return cb(null, true);
    cb(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  optionsSuccessStatus: 204,
};

// Preflight для всех путей (в т.ч. /api/auth/login)
app.options("*", cors(corsOptions));
app.options("/*", cors(corsOptions));
app.use(cors(corsOptions));

// Health check — первым, до всех роутов
app.get("/", (req, res) => res.json({ ok: true }));
app.get("/health", (req, res) => res.json({ ok: true }));

// Отключить кэш для API — чтобы заказы всегда подгружались свежие
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  next();
});

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: "10mb" }));

// Rate limit на auth: 20 запросов за 5 минут с IP
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { error: "Слишком много попыток входа. Попробуйте через 5 минут." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth", authLimiter, authRoutes);

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
  "/api/reports/v2",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  reportsV2Routes,
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
  "/api/analytics",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  analyticsRoutes,
);
app.use(
  "/api/assistant",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  assistantRoutes,
);
app.use(
  "/api/planner",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  plannerRoutes,
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
