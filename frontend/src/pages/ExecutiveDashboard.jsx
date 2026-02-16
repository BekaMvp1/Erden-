/**
 * Executive Dashboard — управленческая панель
 * Ключевые показатели и автоматический контроль производства
 * Страница /executive — полностью независимая
 */

import { useState, useEffect } from "react";
import { api } from "../api";

export default function ExecutiveDashboard() {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  // Загрузка summary и alerts параллельно
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, alertsData] = await Promise.all([
        api.executive.summary(),
        api.executive.alerts(),
      ]);
      setSummary(summaryData);
      setAlerts(alertsData);
    } catch (err) {
      console.error("Error loading executive data:", err);
      setError(err.message || "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  };

  // Цветовая логика для карточек
  const getStatusColor = (type, value) => {
    switch (type) {
      case "overdue":
      case "overloaded":
        return value > 0
          ? "bg-red-500/20 border-red-500 text-red-400"
          : "bg-gray-500/20 border-gray-500 text-gray-400";
      case "completion":
        if (value >= 100)
          return "bg-green-500/20 border-green-500 text-green-400";
        if (value < 90)
          return "bg-yellow-500/20 border-yellow-500 text-yellow-400";
        return "bg-blue-500/20 border-blue-500 text-blue-400";
      default:
        return "bg-gray-500/20 border-gray-500 text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Загрузка данных...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
          Ошибка: {error}
        </div>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Заголовок */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-100">
          Управленческая панель
        </h1>
        <p className="text-gray-400 mt-1">Ключевые показатели производства</p>
      </div>

      {/* KPI карточки */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {/* Заказов в работе */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <div className="text-sm text-gray-400 mb-1">Заказов в работе</div>
          <div className="text-3xl font-bold text-white">
            {summary?.active_orders ?? 0}
          </div>
        </div>

        {/* Просроченные */}
        <div
          className={`border rounded-lg p-5 ${getStatusColor("overdue", summary?.overdue_orders ?? 0)}`}
        >
          <div className="text-sm opacity-80 mb-1">Просроченных заказов</div>
          <div className="text-3xl font-bold">
            {summary?.overdue_orders ?? 0}
          </div>
        </div>

        {/* Перегруженные этажи */}
        <div
          className={`border rounded-lg p-5 ${getStatusColor("overloaded", summary?.overloaded_floors ?? 0)}`}
        >
          <div className="text-sm opacity-80 mb-1">Перегруженные этажи</div>
          <div className="text-3xl font-bold">
            {summary?.overloaded_floors ?? 0}
          </div>
        </div>

        {/* Выполнение недели */}
        <div
          className={`border rounded-lg p-5 ${getStatusColor("completion", summary?.week_completion_percent ?? 0)}`}
        >
          <div className="text-sm opacity-80 mb-1">Выполнение недели</div>
          <div className="text-3xl font-bold">
            {summary?.week_completion_percent ?? 0}%
          </div>
        </div>

        {/* Отставание по финишу */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <div className="text-sm text-gray-400 mb-1">Отставание по финишу</div>
          <div
            className={`text-3xl font-bold ${(summary?.finish_delay ?? 0) < 0 ? "text-red-400" : "text-white"}`}
          >
            {(summary?.finish_delay ?? 0) > 0
              ? `+${summary.finish_delay}`
              : (summary?.finish_delay ?? 0)}
          </div>
        </div>

        {/* Новых заказов сегодня */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <div className="text-sm text-gray-400 mb-1">
            Новых заказов сегодня
          </div>
          <div className="text-3xl font-bold text-white">
            {summary?.new_orders_today ?? 0}
          </div>
        </div>
      </div>

      {/* Блок автоконтроля */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-100 mb-4">
          Автоконтроль производства
        </h2>

        {!alerts?.overload_warning &&
        !alerts?.overdue_warning &&
        !alerts?.finish_risk ? (
          <div className="bg-green-500/20 border border-green-500 rounded-lg p-4 text-green-400">
            ✓ Все показатели в норме. Производство работает стабильно.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Предупреждение о перегрузе */}
            {alerts?.overload_warning && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
                <div className="font-semibold">⚠ Перегрузка этажей</div>
                <div className="text-sm mt-1">
                  Обнаружены этажи с загрузкой более 100%. Требуется
                  перераспределение заказов.
                </div>
              </div>
            )}

            {/* Предупреждение о просрочке */}
            {alerts?.overdue_warning && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
                <div className="font-semibold">⚠ Просроченные заказы</div>
                <div className="text-sm mt-1">
                  Есть заказы с истёкшим сроком выполнения. Требуется срочное
                  внимание.
                </div>
              </div>
            )}

            {/* Риск по финишу */}
            {alerts?.finish_risk && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
                <div className="font-semibold">⚠ Риск по финишу</div>
                <div className="text-sm mt-1">
                  Выполнение финишных операций менее 80% от плана. Завершение
                  заказов под угрозой.
                </div>
              </div>
            )}

            {/* Рекомендуемый этаж */}
            {alerts?.recommended_floor && (
              <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4 text-blue-400">
                <div className="font-semibold">
                  💡 Рекомендация по распределению
                </div>
                <div className="text-sm mt-1">
                  Для заказа #{alerts.recommended_floor.order_id} «
                  {alerts.recommended_floor.order_title}» рекомендуется этаж «
                  {alerts.recommended_floor.suggested_floor_name}» (текущая
                  загрузка: {alerts.recommended_floor.current_load_percent}%)
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Информация о периоде */}
      <div className="mt-6 text-sm text-gray-500">
        Данные актуальны на {new Date().toLocaleString("ru-RU")}
      </div>
    </div>
  );
}
