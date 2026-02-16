/**
 * Отчёты
 */

import { useState, useEffect } from 'react';
import { api } from '../api';
import PrintButton from '../components/PrintButton';

export default function Reports() {
  const [mode, setMode] = useState('daily');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (mode === 'daily') {
        const res = await api.reports.daily(date);
        setData(res);
      } else if (mode === 'weekly') {
        const res = await api.reports.weekly(from, to);
        setData(res);
      } else if (mode === 'monthly') {
        const res = await api.reports.monthly(month);
        setData(res);
      } else {
        const res = await api.reports.planFact(from, to);
        setData(res);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [mode, date, from, to, month]);

  const getReportPeriod = () => {
    if (mode === 'daily') return `За ${date}`;
    if (mode === 'weekly' || mode === 'plan-fact') return `с ${from} по ${to}`;
    if (mode === 'monthly') return `за ${month}`;
    return '';
  };

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Отчёты</h1>
        {data && <PrintButton />}
      </div>

      <div className="no-print flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setMode('daily')}
          className={`px-4 py-2 rounded-lg ${
            mode === 'daily' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'
          }`}
        >
          День
        </button>
        <button
          onClick={() => setMode('weekly')}
          className={`px-4 py-2 rounded-lg ${
            mode === 'weekly' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'
          }`}
        >
          Неделя
        </button>
        <button
          onClick={() => setMode('monthly')}
          className={`px-4 py-2 rounded-lg ${
            mode === 'monthly' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'
          }`}
        >
          Месяц
        </button>
        <button
          onClick={() => setMode('plan-fact')}
          className={`px-4 py-2 rounded-lg ${
            mode === 'plan-fact' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'
          }`}
        >
          План vs Факт
        </button>
        {mode === 'daily' && (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
          />
        )}
        {(mode === 'weekly' || mode === 'plan-fact') && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
            />
          </>
        )}
        {mode === 'monthly' && (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
          />
        )}
      </div>

      <div className="print-area bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 p-6">
        <h1 className="print-title print-only">Отчёт за период {getReportPeriod()}</h1>
        {loading ? (
          <div className="text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
        ) : data ? (
          <div className="space-y-4">
            {(mode === 'weekly' || mode === 'monthly') && (
              <div className="flex gap-6">
                <div>
                  <span className="text-[#ECECEC]/80 dark:text-dark-text/80">План: </span>
                  <span className="text-primary-500 font-medium">{data.plan} мин</span>
                </div>
                <div>
                  <span className="text-[#ECECEC]/80 dark:text-dark-text/80">Факт: </span>
                  <span className="text-[#ECECEC] dark:text-dark-text font-medium">{data.fact} мин</span>
                </div>
              </div>
            )}
            {mode === 'plan-fact' && data.by_floor && (
              <div className="space-y-2">
                {Object.entries(data.by_floor).map(([floor, dt]) => (
                  <div key={floor} className="flex gap-4 py-2 border-b border-white/20 dark:border-white/20">
                    <span className="font-medium text-[#ECECEC] dark:text-dark-text w-32">{floor}</span>
                    <span className="text-primary-500">План: {dt.plan}</span>
                    <span className="text-[#ECECEC]/90 dark:text-dark-text/80">Факт: {dt.fact}</span>
                  </div>
                ))}
              </div>
            )}
            {mode === 'daily' && data.operations && (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20 dark:border-white/20">
                    <th className="text-left py-2 text-sm text-[#ECECEC] dark:text-dark-text/90">Заказ</th>
                    <th className="text-left py-2 text-sm text-[#ECECEC] dark:text-dark-text/90">Операция</th>
                    <th className="text-left py-2 text-sm text-[#ECECEC] dark:text-dark-text/90">Швея</th>
                    <th className="text-left py-2 text-sm text-[#ECECEC] dark:text-dark-text/90">План</th>
                  </tr>
                </thead>
                <tbody>
                  {data.operations.map((op) => (
                    <tr key={op.id} className="border-b border-white/15 dark:border-white/15">
                      <td className="py-2 text-[#ECECEC] dark:text-dark-text">{op.Order?.title}</td>
                      <td className="py-2 text-[#ECECEC]/90 dark:text-dark-text/80">{op.Operation?.name}</td>
                      <td className="py-2 text-[#ECECEC]/90 dark:text-dark-text/80">{op.Sewer?.User?.name}</td>
                      <td className="py-2 text-[#ECECEC]/90 dark:text-dark-text/80">{op.planned_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="text-[#ECECEC]/80 dark:text-dark-text/80">Нет данных</div>
        )}
      </div>
    </div>
  );
}
