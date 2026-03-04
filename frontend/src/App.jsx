/**
 * Корневой компонент приложения
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { FontProvider } from "./context/FontContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CreateOrder from "./pages/CreateOrder";
import OrderDetails from "./pages/OrderDetails";
import Planning from "./pages/Planning";
import Sewing from "./pages/Sewing";
import Procurement from "./pages/Procurement";
import Cutting from "./pages/Cutting";
import Warehouse from "./pages/Warehouse";
import Qc from "./pages/Qc";
import Shipments from "./pages/Shipments";
import Reports from "./pages/Reports";
import References from "./pages/References";
import Finance2026 from "./pages/Finance2026";
import Settings from "./pages/Settings";
import Dispatcher from "./pages/Dispatcher";
import Assistant from "./pages/Assistant";
import OrdersBoard from "./pages/OrdersBoard";
import ProductionDashboard from "./pages/ProductionDashboard";

export default function App() {
  return (
    <ThemeProvider>
      <FontProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                {/* Главная после логина — Панель заказов */}
                <Route index element={<Navigate to="/board" replace />} />
                <Route path="board" element={<OrdersBoard />} />
                <Route path="orders" element={<Dashboard />} />
                <Route path="production-dashboard" element={<ProductionDashboard />} />
                <Route path="orders/create" element={<CreateOrder />} />
                <Route path="orders/:id" element={<OrderDetails />} />
                {/* Планирование убрано из меню; роут оставлен для глубоких ссылок из отчётов/карточки заказа */}
                <Route path="planning" element={<Planning />} />
                <Route path="sewing" element={<Sewing />} />
                <Route path="floor-tasks" element={<Navigate to="/sewing" replace />} />
                <Route path="procurement" element={<Procurement />} />
                <Route path="cutting" element={<Cutting />} />
                <Route path="cutting/:type" element={<Cutting />} />
                <Route path="warehouse" element={<Warehouse />} />
                <Route path="qc" element={<Qc />} />
                <Route path="shipments" element={<Shipments />} />
                <Route path="reports" element={<Reports />} />
                <Route path="finance" element={<Finance2026 />} />
                <Route path="references" element={<References />} />
                <Route path="settings" element={<Settings />} />
                <Route path="dispatcher" element={<Dispatcher />} />
                <Route path="assistant" element={<Assistant />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </FontProvider>
    </ThemeProvider>
  );
}
