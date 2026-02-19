/**
 * Отчёты v2 — период + разрез + KPI + таблица + экспорт
 * Источник: production_plan_day (planned_qty, actual_qty)
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';

/** Ссылка на Планирование с фильтрами (источник плана/факта) */
function planningLink(workshopId, from, to, floorId, orderId) {
  const params = new URLSearchParams();
  if (workshopId) params.set('workshop_id', workshopId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (floorId) params.set('floor_id', floorId);
  if (orderId) params.set('order_id', orderId);
  const q = params.toString();
  return `/planning${q ? `?${q}` : ''}`;
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getToday() {
  return formatDate(new Date());
}

function getWeekRange() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: formatDate(mon), to: formatDate(sun) };
}

function getMonthRange() {
  const d = new Date();
  const from = formatDate(new Date(d.getFullYear(), d.getMonth(), 1));
  const to = formatDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  return { from, to };
}

const REPORT_TYPES = [
  { value: 'floors', label: 'По этажам' },
  { value: 'technologists', label: 'По технологам' },
  { value: 'sewers', label: 'По швеям' },
  { value: 'orders-late', label: 'Проблемные заказы' },
  { value: 'plan-fact', label: 'План/Факт (сводный)' },
];

export default function Reports() {
  const navigate = useNavigate();
  const [workshops, setWorkshops] = useState([]);
  const [workshopId, setWorkshopId] = useState('');
  const [from, setFrom] = useState(getWeekRange().from);
  const [to, setTo] = useState(getWeekRange().to);
  const [reportType, setReportType] = useState('floors');

  const [kpi, setKpi] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [planFactData, setPlanFactData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canLoad = workshopId && from && to;

  const loadData = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    try {
      const params = { workshop_id: workshopId, from, to };
      const [kpiRes, planFactRes] = await Promise.all([
        api.reports.v2.kpi(params),
        api.reports.v2.planFact(params),
      ]);
      setKpi(kpiRes);
      setPlanFactData(planFactRes);

      if (reportType === 'floors') {
        const data = await api.reports.v2.floors(params);
        setTableData(data);
      } else if (reportType === 'technologists') {
        const data = await api.reports.v2.technologists(params);
        setTableData(data);
      } else if (reportType === 'sewers') {
        const data = await api.reports.v2.sewers(params);
        setTableData(data);
      } else if (reportType === 'orders-late') {
        const data = await api.reports.v2.ordersLate(params);
        setTableData(data);
      } else {
        setTableData(planFactRes);
      }
    } catch (err) {
      setError(err.message || 'Ошибка загрузки данных');
      setKpi(null);
      setTableData(null);
      setPlanFactData(null);
    } finally {
      setLoading(false);
    }
  }, [canLoad, workshopId, from, to, reportType]);

  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleQuickPeriod = (type) => {
    if (type === 'today') {
      const t = getToday();
      setFrom(t);
      setTo(t);
    } else if (type === 'week') {
      const { from: f, to: t } = getWeekRange();
      setFrom(f);
      setTo(t);
    } else if (type === 'month') {
      const { from: f, to: t } = getMonthRange();
      setFrom(f);
      setTo(t);
    }
  };

  const handleExportCsv = async () => {
    if (!canLoad) return;
    const type = reportType;
    try {
      const blob = await api.reports.v2.exportCsv({
        type,
        workshop_id: workshopId,
        from,
        to,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${type}-${from}-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Ошибка экспорта');
    }
  };

  const inputClass =
    'px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text';
  const selectClass =
    'px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text';

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text">
          Отчёты
        </h1>
        {canLoad && <PrintButton />}
      </div>

      {/* Фильтры */}
      <div className="no-print mb-6 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm text-[#ECECEC]/80 mb-1">Цех</label>
            <select
              value={workshopId}
              onChange={(e) => setWorkshopId(e.target.value)}
              className={`${selectClass} min-w-[180px]`}
            >
              <option value="">Выберите цех</option>
              {workshops.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-[#ECECEC]/80 mb-1">Период</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleQuickPeriod('today')}
                className="px-3 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text text-sm hover:bg-accent-1/40"
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => handleQuickPeriod('week')}
                className="px-3 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text text-sm hover:bg-accent-1/40"
              >
                Неделя
              </button>
              <button
                type="button"
                onClick={() => handleQuickPeriod('month')}
                className="px-3 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text text-sm hover:bg-accent-1/40"
              >
                Месяц
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-[#ECECEC]/80 mb-1">Дата от</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC]/80 mb-1">Дата до</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm text-[#ECECEC]/80 mb-1">Разрез отчёта</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className={`${selectClass} min-w-[200px]`}
            >
              {REPORT_TYPES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!canLoad && (
        <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-12 text-center text-[#ECECEC]/70">
          Выберите цех и период для отображения отчёта
        </div>
      )}

      {canLoad && (
        <>
          {loading ? (
            <div className="py-12 text-center text-[#ECECEC]/80">Загрузка...</div>
          ) : (
            <div className="space-y-6">
              {/* KPI карточки */}
              {kpi && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
                    <div className="text-sm text-[#ECECEC]/60">План</div>
                    <div className="text-xl font-bold text-[#ECECEC]">{kpi.planned_sum}</div>
                  </div>
                  <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
                    <div className="text-sm text-[#ECECEC]/60">Факт</div>
                    <div className="text-xl font-bold text-[#ECECEC]">{kpi.actual_sum}</div>
                  </div>
                  <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
                    <div className="text-sm text-[#ECECEC]/60">Выполнение %</div>
                    <div
                      className={`text-xl font-bold ${
                        kpi.completion_percent >= 100
                          ? 'text-green-400'
                          : kpi.completion_percent < 80
                            ? 'text-red-400'
                            : 'text-amber-400'
                      }`}
                    >
                      {kpi.completion_percent}%
                    </div>
                  </div>
                  <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
                    <div className="text-sm text-[#ECECEC]/60">Просроченные</div>
                    <div className="text-xl font-bold text-[#ECECEC]">{kpi.overdue_orders}</div>
                  </div>
                  <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
                    <div className="text-sm text-[#ECECEC]/60">Активные</div>
                    <div className="text-xl font-bold text-[#ECECEC]">{kpi.active_orders}</div>
                  </div>
                  <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
                    <div className="text-sm text-[#ECECEC]/60">Отставание по финишу</div>
                    <div
                      className={`text-xl font-bold ${
                        kpi.finish_delay > 0 ? 'text-red-400' : 'text-[#ECECEC]'
                      }`}
                    >
                      {kpi.finish_delay}
                    </div>
                  </div>
                </div>
              )}

              {/* Таблица по разрезу */}
              {tableData && tableData.length > 0 && (
                <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[400px]">
                      <thead>
                        <tr className="border-b border-white/20 bg-accent-2/80 dark:bg-dark-800">
                          {(reportType === 'plan-fact' && (
                            <>
                              <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                Дата
                              </th>
                              <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                План
                              </th>
                              <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                Факт
                              </th>
                            </>
                          )) ||
                            (reportType === 'floors' && (
                            <>
                              <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                Этаж
                              </th>
                              <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                План
                              </th>
                              <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                Факт
                              </th>
                              <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                %
                              </th>
                            </>
                          )) ||
                            (reportType === 'technologists' && (
                              <>
                                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  Технолог
                                </th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  План
                                </th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  Факт
                                </th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  %
                                </th>
                              </>
                            )) ||
                            (reportType === 'sewers' && (
                              <>
                                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  Швея
                                </th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  План
                                </th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  Факт
                                </th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  %
                                </th>
                              </>
                            )) ||
                            (reportType === 'orders-late' && (
                              <>
                                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  Заказ
                                </th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  Клиент
                                </th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC]/90 whitespace-nowrap">
                                  Дедлайн
                                </th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  План
                                </th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  Факт
                                </th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC]/90">
                                  Отставание
                                </th>
                              </>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.map((row, i) => {
                          const isRowClickable =
                            reportType === 'plan-fact' ||
                            reportType === 'floors' ||
                            reportType === 'orders-late';
                          const rowHref =
                            reportType === 'plan-fact'
                              ? planningLink(workshopId, row.date, row.date, '', '')
                              : reportType === 'floors'
                                ? planningLink(workshopId, from, to, row.floor_id ?? '', '')
                                : reportType === 'orders-late'
                                  ? planningLink(workshopId, from, to, '', row.order_id ?? '')
                                  : '';
                          return (
                          <tr
                            key={row.date || row.floor_id || row.technologist_id || row.order_id || i}
                            className={`border-b border-white/10 hover:bg-accent-1/10 ${isRowClickable ? 'cursor-pointer hover:bg-primary-500/20' : ''}`}
                            onClick={isRowClickable ? () => navigate(rowHref) : undefined}
                            role={isRowClickable ? 'button' : undefined}
                          >
                            {reportType === 'plan-fact' && (
                              <>
                                <td className="px-4 py-2 text-[#ECECEC]/90 whitespace-nowrap">
                                  {row.date}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.planned_sum}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.actual_sum}
                                </td>
                              </>
                            )}
                            {reportType === 'floors' && (
                              <>
                                <td className="px-4 py-2 text-[#ECECEC]/90">
                                  {row.floor_name ?? row.floor_id ?? '—'}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.planned_sum}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.actual_sum}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.completion_percent}%
                                </td>
                              </>
                            )}
                            {reportType === 'technologists' && (
                              <>
                                <td className="px-4 py-2 text-[#ECECEC]/90">
                                  {row.name}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.planned_sum}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.actual_sum}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.completion_percent}%
                                </td>
                              </>
                            )}
                            {reportType === 'sewers' && (
                              <>
                                <td className="px-4 py-2 text-[#ECECEC]/90">
                                  {row.name}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.planned_sum}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.actual_sum}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.completion_percent}%
                                </td>
                              </>
                            )}
                            {reportType === 'orders-late' && (
                              <>
                                <td className="px-4 py-2 text-[#ECECEC]/90">
                                  #{row.order_id} {row.order_title}
                                </td>
                                <td className="px-4 py-2 text-[#ECECEC]/90">
                                  {row.client_name}
                                </td>
                                <td className="px-4 py-2 text-[#ECECEC]/90 whitespace-nowrap">
                                  {row.deadline}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.planned_sum}
                                </td>
                                <td className="px-4 py-2 text-right text-[#ECECEC]/90">
                                  {row.actual_sum}
                                </td>
                                <td className="px-4 py-2 text-right text-red-400">
                                  {row.delay_qty}
                                </td>
                              </>
                            )}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tableData && tableData.length === 0 && (
                <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-8 text-center text-[#ECECEC]/70">
                  Нет данных за выбранный период
                </div>
              )}

              {/* График план/факт */}
              {planFactData && planFactData.length > 0 && (
                <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
                  <h3 className="text-sm font-semibold text-[#ECECEC] mb-4">
                    План / Факт по дням
                  </h3>
                  <div className="overflow-x-auto">
                    <div className="flex gap-2 min-w-max pb-2">
                      {planFactData.map((d) => {
                        const max = Math.max(
                          ...planFactData.map((x) => Math.max(x.planned_sum, x.actual_sum)),
                          1
                        );
                        const plannedH = (d.planned_sum / max) * 80;
                        const actualH = (d.actual_sum / max) * 80;
                        return (
                          <div
                            key={d.date}
                            className="flex flex-col items-center gap-1"
                            style={{ minWidth: 36 }}
                          >
                            <div className="flex gap-0.5 items-end h-24">
                              <div
                                className="w-3 bg-primary-500/80 rounded-t"
                                style={{ height: `${plannedH}px` }}
                                title={`План: ${d.planned_sum}`}
                              />
                              <div
                                className="w-3 bg-green-500/80 rounded-t"
                                style={{ height: `${actualH}px` }}
                                title={`Факт: ${d.actual_sum}`}
                              />
                            </div>
                            <span className="text-xs text-[#ECECEC]/70 whitespace-nowrap">
                              {d.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-[#ECECEC]/70">
                      <span>
                        <span className="inline-block w-3 h-3 rounded bg-primary-500/80 mr-1" />
                        План
                      </span>
                      <span>
                        <span className="inline-block w-3 h-3 rounded bg-green-500/80 mr-1" />
                        Факт
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Экспорт CSV */}
              <div className="no-print">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                >
                  Экспорт CSV
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
