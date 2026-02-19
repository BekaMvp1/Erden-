/**
 * Dispatcher — планировщик приоритетов и рекомендаций
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getPriority, getBottleneckMap, getRecommendations } from '../features/planner/api';

function getRiskColor(risk) {
  if (risk === 'HIGH') return 'text-red-400';
  if (risk === 'MEDIUM') return 'text-orange-400';
  if (risk === 'LOW') return 'text-green-400';
  return 'text-gray-400';
}

function getRiskLabel(risk) {
  if (risk === 'HIGH') return 'Высокий';
  if (risk === 'MEDIUM') return 'Средний';
  if (risk === 'LOW') return 'Низкий';
  return risk || '—';
}

export default function Dispatcher() {
  const [days, setDays] = useState(7);
  const [priority, setPriority] = useState([]);
  const [bottleneckMap, setBottleneckMap] = useState([]);
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, b, r] = await Promise.all([
        getPriority({ days, limit: 100 }),
        getBottleneckMap({ days }),
        getRecommendations({ days }),
      ]);
      setPriority(p);
      setBottleneckMap(b);
      setRecommendations(r);
    } catch (err) {
      console.error('Dispatcher load error:', err);
      setError(err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !priority.length) {
    return (
      <div className="p-6">
        <div className="text-gray-400">Загрузка...</div>
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
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text">
          Планировщик
        </h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Дней:</label>
          <input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 7)}
            className="w-20 px-3 py-2 rounded-lg bg-accent-1/20 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Обновить
          </button>
        </div>
      </div>

      {/* Блок 1 — Таблица приоритетов */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-3">
          Приоритеты заказов
        </h2>
        <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Заказ</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Клиент</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Срок</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Текущий этап</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Осталось</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Риск</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Балл</th>
                </tr>
              </thead>
              <tbody>
                {priority.map((row) => (
                  <tr
                    key={row.order_id}
                    className="border-b border-white/15 hover:bg-accent-1/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/orders/${row.order_id}`}
                        className="text-primary-400 hover:underline"
                      >
                        #{row.order_id} {row.order_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90">{row.client_name}</td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 whitespace-nowrap">{row.due_date}</td>
                    <td className="px-4 py-3 text-[#ECECEC]/90">
                      {row.current_step?.step_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90">
                      {row.current_step?.remaining_qty ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${getRiskColor(row.risk_level)}`}>
                        {getRiskLabel(row.risk_level)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90">{row.priority_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {priority.length === 0 && (
            <div className="p-6 text-center text-gray-400">Нет данных</div>
          )}
        </div>
      </div>

      {/* Блок 2 — Узкие места */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-3">
          Узкие места
        </h2>
        <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Этап</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Ожидание</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">В работе</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Заблокировано</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">Ср. скорость</th>
                </tr>
              </thead>
              <tbody>
                {bottleneckMap.map((row) => (
                  <tr
                    key={row.step_code}
                    className="border-b border-white/15 hover:bg-accent-1/20 transition-colors"
                  >
                    <td className="px-4 py-3 text-[#ECECEC]/90">{row.step_name}</td>
                    <td className="px-4 py-3 text-[#ECECEC]/90">{row.pending}</td>
                    <td className="px-4 py-3 text-[#ECECEC]/90">{row.in_progress}</td>
                    <td className="px-4 py-3 text-[#ECECEC]/90">{row.blocked}</td>
                    <td className="px-4 py-3 text-[#ECECEC]/90">
                      {row.avg_rate_per_hour != null ? row.avg_rate_per_hour : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bottleneckMap.length === 0 && (
            <div className="p-6 text-center text-gray-400">Нет данных</div>
          )}
        </div>
      </div>

      {/* Блок 3 — Рекомендации */}
      <div>
        <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-3">
          Рекомендации
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
            <h3 className="text-sm font-medium text-[#ECECEC]/90 mb-2">Топ рисков</h3>
            <ul className="space-y-2">
              {(recommendations?.top_risks || []).map((r, i) => (
                <li
                  key={i}
                  className="text-sm p-2 rounded bg-accent-1/10 border border-white/10"
                >
                  <Link to={`/orders/${r.order_id}`} className="text-primary-400 hover:underline">
                    #{r.order_id} {r.order_name}
                  </Link>
                  <span className={`ml-2 text-xs ${getRiskColor(r.risk_level)}`}>{getRiskLabel(r.risk_level)}</span>
                  <div className="text-gray-400 text-xs mt-1">{r.suggested_action}</div>
                </li>
              ))}
              {(!recommendations?.top_risks || recommendations.top_risks.length === 0) && (
                <li className="text-gray-400 text-sm">Нет рисков</li>
              )}
            </ul>
          </div>
          <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
            <h3 className="text-sm font-medium text-[#ECECEC]/90 mb-2">Рекомендации по перемещению</h3>
            <ul className="space-y-2">
              {(recommendations?.move_suggestions || []).map((s, i) => (
                <li
                  key={i}
                  className="text-sm p-2 rounded bg-accent-1/10 border border-white/10"
                >
                  <div className="text-[#ECECEC]/90">{s.suggestion}</div>
                  <div className="text-gray-400 text-xs mt-1">{s.rationale}</div>
                </li>
              ))}
              {(!recommendations?.move_suggestions || recommendations.move_suggestions.length === 0) && (
                <li className="text-gray-400 text-sm">Нет рекомендаций</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
