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
import PlanningAssign from "./pages/PlanningAssign";
import Planning from "./pages/Planning";
import Procurement from "./pages/Procurement";
import Cutting from "./pages/Cutting";
import FloorTasks from "./pages/FloorTasks";
import Warehouse from "./pages/Warehouse";
import Reports from "./pages/Reports";
import References from "./pages/References";
import Finance2026 from "./pages/Finance2026";
import Settings from "./pages/Settings";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";

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
                <Route index element={<Dashboard />} />
                <Route path="orders/create" element={<CreateOrder />} />
                <Route path="orders/:id" element={<OrderDetails />} />
                <Route path="planning/assign" element={<PlanningAssign />} />
                <Route path="planning" element={<Planning />} />
                <Route path="procurement" element={<Procurement />} />
                <Route path="cutting" element={<Cutting />} />
                <Route path="cutting/:type" element={<Cutting />} />
                <Route path="floor-tasks" element={<FloorTasks />} />
                <Route path="warehouse" element={<Warehouse />} />
                <Route path="reports" element={<Reports />} />
                <Route path="finance" element={<Finance2026 />} />
                <Route path="references" element={<References />} />
                <Route path="settings" element={<Settings />} />
                <Route path="executive" element={<ExecutiveDashboard />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </FontProvider>
    </ThemeProvider>
  );
}
