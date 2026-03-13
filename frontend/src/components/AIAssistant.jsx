/**
 * ИИ-ассистент — правая панель для аналитических запросов
 */

import { useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../api';

export default function AIAssistant({ embedded = false }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const examples = [
    'Сколько сделали сегодня?',
    'По этажам сегодня',
    'График за месяц',
    'Самая загруженная швея',
    'План и факт',
    'Просроченные заказы',
    'Общая сводка',
  ];

  const handleAsk = async (text) => {
    const q = typeof text === 'string' ? text : query.trim();
    if (!q) return;
    if (typeof text === 'string') setQuery(text);
    setLoading(true);
    setResult(null);
    try {
      const data = await api.ai.query(q);
      setResult(data);
    } catch (err) {
      setResult({ summary: `Ошибка: ${err.message}`, data: [], chart: null });
    } finally {
      setLoading(false);
    }
  };

  const chartData = result?.chart?.labels?.map((label, i) => ({
    name: label,
    value: result.chart.values[i],
    plan: result.chart.planValues?.[i],
  })) || [];

  return (
    <aside
      className={`flex flex-col bg-neon-surface ${
        embedded
          ? 'w-full h-full rounded-card border border-neon-border overflow-hidden'
          : 'w-80 flex-shrink-0 panel-right-border'
      }`}
    >
      <div className="header-top flex items-center p-4">
        <span className="text-lg font-semibold text-neon-text">ИИ Ассистент</span>
      </div>

      <div className="p-3 border-b border-white/10">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAsk())}
          placeholder="Введите вопрос или выберите пример..."
          className="input-neon w-full h-20 px-3 py-2 text-sm resize-none"
          disabled={loading}
        />
        <button
          onClick={() => handleAsk()}
          disabled={loading || !query.trim()}
          className="mt-2 w-full py-2 rounded-btn bg-neon-accent text-black text-sm font-medium hover:bg-neon-accent2 disabled:opacity-50"
        >
          {loading ? 'Загрузка...' : 'Спросить'}
        </button>
        <div className="mt-2 flex flex-wrap gap-1">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => handleAsk(ex)}
              disabled={loading}
              className="px-2 py-1 rounded-chip bg-neon-surface2 text-neon-text text-xs hover:shadow-neon disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4 bg-neon-surface min-h-0">
        {result && (
              <>
                <p className="text-sm text-neon-text">{result.summary}</p>

                {result.data?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/20 dark:border-white/20">
                          {Object.keys(result.data[0]).map((k) => (
                            <th key={k} className="text-left py-2 pr-2 text-[#ECECEC] dark:text-dark-text/90">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.data.map((row, i) => (
                          <tr key={i} className="border-b border-white/15 dark:border-white/15">
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="py-1.5 pr-2 text-[#ECECEC]/90 dark:text-dark-text/80">
                                {String(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {result.chart && chartData.length > 0 && (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      {result.chart.type === 'line' ? (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} />
                          <YAxis stroke="#9ca3af" fontSize={10} />
                          <Tooltip contentStyle={{ backgroundColor: '#1e293b' }} />
                          <Legend />
                          <Line type="monotone" dataKey="plan" stroke="#6b7280" name="План" />
                          <Line type="monotone" dataKey="value" stroke="#22c55e" name="Факт" />
                        </LineChart>
                      ) : (
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} />
                          <YAxis stroke="#9ca3af" fontSize={10} />
                          <Tooltip contentStyle={{ backgroundColor: '#1e293b' }} />
                          <Bar dataKey="value" fill="#22c55e" name="Значение" />
                          {result.chart.planValues && (
                            <Bar dataKey="plan" fill="#6b7280" name="План" />
                          )}
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}
        </>
        )}
      </div>
    </aside>
  );
}
