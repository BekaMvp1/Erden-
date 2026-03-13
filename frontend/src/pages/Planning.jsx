/**
 * Планирование — производственная матрица месяца.
 * Месяц, цех, этаж, поиск | Таблица: Артикул, Наименование, Заказчик, Итого, Остаток | Недели (План | Факт) | Сводка мощности.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { NeonCard } from '../components/ui';

const PLANNING_MONTH = 'planning_month';
const PLANNING_WORKSHOP = 'planning_workshop';
const PLANNING_FLOOR = 'planning_floor';
const PLANNING_SEARCH = 'planning_search';

function getStored(key, fallback) {
  try {
    const v = sessionStorage.getItem(key);
    return v !== null && v !== '' ? v : fallback;
  } catch {
    return fallback;
  }
}

function formatMonth(val) {
  if (!val || val.length < 7) return '';
  const [y, m] = val.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
}

export default function Planning() {
  const [workshops, setWorkshops] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [floors, setFloors] = useState([]);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return getStored(PLANNING_MONTH, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  });
  const [workshopId, setWorkshopId] = useState(() => getStored(PLANNING_WORKSHOP, ''));
  const [floorId, setFloorId] = useState(() => getStored(PLANNING_FLOOR, ''));
  const [searchQ, setSearchQ] = useState(() => getStored(PLANNING_SEARCH, ''));

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editCell, setEditCell] = useState(null);
  const [saving, setSaving] = useState(false);

  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const canEdit = ['admin', 'manager', 'technologist'].includes(user.role);

  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  useEffect(() => {
    api.planning.periods().then(setPeriods).catch(() => setPeriods([]));
    if (workshopId) {
      api.planning.floors(workshopId).then(setFloors).catch(() => setFloors([]));
    } else {
      setFloors([]);
    }
  }, [workshopId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(PLANNING_MONTH, month || '');
      sessionStorage.setItem(PLANNING_WORKSHOP, workshopId || '');
      sessionStorage.setItem(PLANNING_FLOOR, floorId || '');
      sessionStorage.setItem(PLANNING_SEARCH, searchQ || '');
    } catch (_) {}
  }, [month, workshopId, floorId, searchQ]);

  const loadData = useCallback(() => {
    if (!workshopId || !month) return;
    const w = workshops.find((x) => String(x.id) === String(workshopId));
    if (!w) return;
    const needFloor = w.floors_count === 4;
    if (needFloor && !floorId) return;

    setLoading(true);
    setError('');
    const params = { month, workshop_id: workshopId };
    if (needFloor && floorId) params.floor_id = floorId;
    if (searchQ.trim()) params.q = searchQ.trim();
    api.planning
      .weekly(params)
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(err.message || 'Ошибка загрузки');
      })
      .finally(() => setLoading(false));
  }, [workshopId, floorId, month, searchQ, workshops]);

  useEffect(() => loadData(), [loadData]);

  const handleSavePlan = async (orderId, weekStart, value) => {
    if (!workshopId || !canEdit || saving) return;
    setSaving(true);
    setError('');
    try {
      const w = workshops.find((x) => String(x.id) === String(workshopId));
      await api.planning.weeklyManual({
        workshop_id: Number(workshopId),
        building_floor_id: w?.floors_count === 4 && floorId ? Number(floorId) : null,
        week_start: weekStart,
        row_key: orderId,
        planned_manual: Math.max(0, parseInt(value, 10) || 0),
      });
      setEditCell(null);
      loadData();
    } catch (err) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const w = workshops.find((x) => String(x.id) === String(workshopId));
  const showFloor = w?.floors_count === 4;

  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <h1 className="text-xl font-semibold text-[#ECECEC] dark:text-dark-text mb-4">Планирование</h1>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-sm text-[#ECECEC]/80">Месяц</label>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[140px]"
        >
          {periods.map((p) => {
            const val = `${p.year}-${String(p.month).padStart(2, '0')}`;
            const label = new Date(p.year, p.month - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
            return (
              <option key={p.id} value={val}>
                {label} {p.status === 'CLOSED' ? '(закрыт)' : ''}
              </option>
            );
          })}
          {(!periods.length || !periods.some((p) => `${p.year}-${String(p.month).padStart(2, '0')}` === month)) && month && (
            <option value={month}>{formatMonth(month)}</option>
          )}
        </select>

        <label className="text-sm text-[#ECECEC]/80 ml-2">Цех</label>
        <select
          value={workshopId}
          onChange={(e) => setWorkshopId(e.target.value)}
          className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[140px]"
        >
          <option value="">Выберите цех</option>
          {workshops.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>

        {showFloor && (
          <>
            <label className="text-sm text-[#ECECEC]/80 ml-2">Этаж</label>
            <select
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[120px]"
            >
              <option value="">Этаж</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>{f.id === 1 ? '1 (Финиш)' : f.name}</option>
              ))}
            </select>
          </>
        )}

        <input
          type="text"
          placeholder="Поиск: заказчик, артикул, модель"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          className="ml-4 px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[200px]"
        />

        <Link
          to="/cutting"
          className="ml-auto text-sm px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text border border-white/20 hover:bg-accent-2"
        >
          Раскрой
        </Link>
      </div>

      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-[#ECECEC]/70">Загрузка...</div>
      ) : !data ? (
        <p className="text-[#ECECEC]/60">Выберите цех и месяц</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/15">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-accent-3 dark:bg-dark-900 border-b border-white/20">
              <tr>
                <th className="sticky left-0 z-20 bg-accent-3 dark:bg-dark-900 px-3 py-2 text-left font-medium text-[#ECECEC]/80 min-w-[80px] border-r border-white/15">
                  Артикул
                </th>
                <th className="px-3 py-2 text-left font-medium text-[#ECECEC]/80 min-w-[180px] border-r border-white/15">
                  Наименование
                </th>
                <th className="px-3 py-2 text-left font-medium text-[#ECECEC]/80 min-w-[120px] border-r border-white/15">
                  Заказчик
                </th>
                <th className="px-3 py-2 text-right font-medium text-[#ECECEC]/80 min-w-[60px] border-r border-white/15">
                  Итого
                </th>
                <th className="px-3 py-2 text-right font-medium text-[#ECECEC]/80 min-w-[70px] border-r border-white/15">
                  Остаток
                </th>
                {data.weeks?.map((w) => (
                  <th key={w.week_start} colSpan={2} className="px-2 py-2 text-center font-medium text-[#ECECEC]/80 border-r border-white/15 whitespace-nowrap">
                    {w.week_start}
                  </th>
                ))}
              </tr>
              <tr>
                <th colSpan={5} className="bg-transparent border-r border-white/15" />
                {data.weeks?.map((w) => (
                  <th key={w.week_start} className="px-1 py-1 text-center text-xs font-normal text-[#ECECEC]/60 border-r border-white/15">
                    План | Факт
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows?.map((row) => (
                <React.Fragment key={row.customer_name}>
                  {row.orders?.map((ord) => (
                    <tr key={ord.order_id} className="border-b border-white/10 hover:bg-white/5">
                      <td className="sticky left-0 bg-inherit px-3 py-2 text-[#ECECEC]/90 border-r border-white/10">
                        {ord.article || ord.tz_code || '—'}
                      </td>
                      <td className="px-3 py-2 text-[#ECECEC]/90 border-r border-white/10">
                        <Link to={`/orders/${ord.order_id}`} className="hover:text-primary-400 hover:underline">
                          {ord.order_title || ord.model_name || '—'}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-[#ECECEC]/80 border-r border-white/10">{row.customer_name}</td>
                      <td className="px-3 py-2 text-right font-medium border-r border-white/10">{ord.total_quantity ?? 0}</td>
                      <td className="px-3 py-2 text-right text-[#ECECEC]/80 border-r border-white/10">{ord.remainder ?? 0}</td>
                      {data.weeks?.map((week) => {
                        const item = ord.items?.find((i) => i.week_start === week.week_start);
                        const isEditing = editCell?.orderId === ord.order_id && editCell?.weekStart === week.week_start;
                        const planVal = item?.planned_total ?? 0;
                        const factVal = item?.fact_qty ?? 0;
                        return (
                          <React.Fragment key={week.week_start}>
                            <td className="px-1 py-1 text-right border-r border-white/10 align-top">
                              {canEdit && data.period?.status !== 'CLOSED' ? (
                                isEditing ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const input = e.target.querySelector('input');
                                      if (input) handleSavePlan(ord.order_id, week.week_start, input.value);
                                    }}
                                    className="flex gap-1"
                                  >
                                    <input
                                      type="number"
                                      min={0}
                                      defaultValue={planVal}
                                      autoFocus
                                      className="w-14 px-1 py-0.5 text-right rounded bg-accent-2/90 border border-white/30 text-[#ECECEC] text-xs"
                                      onBlur={(e) => {
                                        const v = e.target.value;
                                        if (v !== String(planVal)) handleSavePlan(ord.order_id, week.week_start, v);
                                        setEditCell(null);
                                      }}
                                    />
                                  </form>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setEditCell({ orderId: ord.order_id, weekStart: week.week_start })}
                                    className="w-full text-right hover:bg-white/10 rounded px-1 py-0.5 min-w-[2rem]"
                                  >
                                    {planVal || '—'}
                                  </button>
                                )
                              ) : (
                                <span>{planVal || '—'}</span>
                              )}
                            </td>
                            <td className="px-1 py-1 text-right text-[#ECECEC]/70 border-r border-white/10">
                              {factVal || '—'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {data.week_totals && data.week_totals.length > 0 && (
                <>
                  <tr className="border-t-2 border-white/20 bg-accent-2/40 font-medium">
                    <td colSpan={3} className="px-3 py-2 border-r border-white/15">
                      Мощность / Загрузка план / Загрузка факт
                    </td>
                    <td className="px-3 py-2 border-r border-white/15" />
                    <td className="px-3 py-2 border-r border-white/15" />
                    {data.week_totals.map((wt) => (
                      <td colSpan={2} key={wt.week_start} className="px-2 py-2 text-center border-r border-white/15">
                        <span className={wt.overload > 0 ? 'text-red-400 font-semibold' : 'text-[#ECECEC]'}>
                          {wt.capacity_week || '—'} / {wt.load_week} / {wt.load_fact ?? 0}
                        </span>
                        {wt.overload > 0 && <span className="block text-xs text-red-400">Перегруз +{wt.overload}</span>}
                        {wt.capacity_week > 0 && wt.overload === 0 && (
                          <span className="block text-xs text-[#ECECEC]/60">Свободно: {wt.free_capacity ?? 0}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-white/15 bg-accent-2/20">
                    <td colSpan={5} className="px-3 py-2 border-r border-white/15">
                      Итого план / факт по месяцу
                    </td>
                    <td colSpan={(data.weeks?.length || 0) * 2} className="px-3 py-2 text-right font-medium">
                      {data.totals?.month_plan ?? 0} / {data.totals?.month_fact ?? 0}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
