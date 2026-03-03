/**
 * Страница: Панель заказов (оперативная доска)
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Chip, NeonButton, NeonCard, NeonInput, NeonSelect } from '../components/ui';

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'overdue', label: 'Просроченные' },
  { key: 'today', label: 'Сегодня' },
  { key: 'done', label: 'Готово' },
  { key: 'not_done', label: 'Не готово' },
  { key: 'future', label: 'Будущие' },
];

const PRIORITIES = [
  { key: '', label: 'Все приоритеты' },
  { key: 'high', label: 'Высокий' },
  { key: 'medium', label: 'Средний' },
  { key: 'normal', label: 'Обычный' },
  { key: 'low', label: 'Низкий' },
];

const SORTS = [
  { key: 'priority', label: 'Приоритет' },
  { key: 'deadline', label: 'Дедлайн' },
  { key: 'forecast', label: 'Прогноз' },
];

const VIEW_MODES = [
  { key: 'schedule', label: 'Сроки' },
  { key: 'fact_plan', label: 'Факт/план' },
];

const STATUS_STYLE = {
  DONE: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  IN_PROGRESS: 'bg-lime-500/20 text-lime-300 border-lime-400/40',
  NOT_STARTED: 'bg-slate-500/20 text-slate-200 border-slate-300/30',
  OVERDUE: 'bg-red-500/25 text-red-300 border-red-400/50',
};

const STAGE_COLUMNS = [
  { key: 'procurement', title: 'ЗАКУП' },
  { key: 'warehouse', title: 'СКЛАД' },
  { key: 'cutting', title: 'ЗАКРОЙ' },
  { key: 'sewing', title: 'ПОШИВ' },
  { key: 'qc', title: 'ОТК' },
  { key: 'packing', title: 'УПАКОВКА' },
  { key: 'fg_warehouse', title: 'СКЛАД ГП' },
  { key: 'shipping', title: 'ОТГРУЗКА' },
];

const COL_WIDTHS = {
  client: 280,
  priority: 72,
  created: 132,
  stage: 146,
  forecast: 140,
  deadline: 140,
};

const GRID_TEMPLATE = `${COL_WIDTHS.client}px ${COL_WIDTHS.priority}px ${COL_WIDTHS.created}px repeat(8, ${COL_WIDTHS.stage}px) ${COL_WIDTHS.forecast}px ${COL_WIDTHS.deadline}px`;
const GRID_MIN_WIDTH = COL_WIDTHS.client + COL_WIDTHS.priority + COL_WIDTHS.created + STAGE_COLUMNS.length * COL_WIDTHS.stage + COL_WIDTHS.forecast + COL_WIDTHS.deadline;
const UNIFIED_BOX_CLASS = 'm-1 h-[96px] rounded-lg border border-white/15 bg-slate-900/45 p-2';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU');
  } catch {
    return value;
  }
}

function priorityBadge(priority) {
  if (priority === 'high') return 'bg-red-500/25 text-red-300';
  if (priority === 'medium') return 'bg-amber-500/25 text-amber-300';
  if (priority === 'low') return 'bg-green-500/25 text-green-300';
  return 'bg-slate-500/25 text-slate-200';
}

function priorityNum(priority) {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function formatDaysLabel(days) {
  const val = Number(days) || 0;
  if (val <= 0) return '-';
  const mod10 = val % 10;
  const mod100 = val % 100;
  if (mod10 === 1 && mod100 !== 11) return `${val} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${val} дня`;
  return `${val} дней`;
}

function calcFilterCounters(orders) {
  const today = new Date().toISOString().slice(0, 10);
  const doneCheck = (o) => (o.stages || []).every((s) => s.status === 'DONE');
  return orders.reduce(
    (acc, row) => {
      const isDone = doneCheck(row);
      acc.all += 1;
      if (row.is_overdue) acc.overdue += 1;
      if (row.deadline === today) acc.today += 1;
      if (isDone) acc.done += 1;
      if (!isDone) acc.not_done += 1;
      if (row.deadline && row.deadline > today) acc.future += 1;
      return acc;
    },
    { all: 0, overdue: 0, today: 0, done: 0, not_done: 0, future: 0 }
  );
}

function StageCell({ stage, viewMode, orderId, onOpenStage }) {
  const hasSchedule = (stage.planned_days || 0) > 0 && stage.planned_start_date;
  const statusClass = STATUS_STYLE[stage.status] || STATUS_STYLE.NOT_STARTED;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenStage(orderId, stage.stage_key);
      }}
      className={`m-1 h-[96px] rounded-lg border p-2 text-left transition hover:brightness-110 ${statusClass}`}
      title={stage.title_ru}
    >
      <div className="text-[10px] font-semibold tracking-wide opacity-90">{stage.title_ru}</div>
      {viewMode === 'schedule' ? (
        <div className="mt-1 space-y-1">
          <div className="text-xs font-semibold leading-none">{hasSchedule ? formatDaysLabel(stage.planned_days) : '-'}</div>
          <div className="text-[11px] leading-none opacity-90">{hasSchedule ? formatDate(stage.planned_start_date) : '-'}</div>
          <div className="text-[11px] leading-none opacity-90">{hasSchedule ? formatDate(stage.planned_end_date) : '-'}</div>
        </div>
      ) : (
        <div className="mt-2">
          <div className="text-lg font-bold leading-none">
            {stage.actual_qty}/{stage.planned_qty}
          </div>
          <div className="mt-1 text-xs opacity-90">{stage.percent}%</div>
        </div>
      )}
    </button>
  );
}

function UnifiedCellBox({ className = '', children }) {
  return <div className={`${UNIFIED_BOX_CLASS} ${className}`}>{children}</div>;
}

function BoardHeader({
  q,
  setQ,
  managerSearch,
  setManagerSearch,
  priority,
  setPriority,
  showCompleted,
  setShowCompleted,
  filter,
  setFilter,
  filterCounters,
  sort,
  setSort,
  order,
  setOrder,
  viewMode,
  setViewMode,
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur px-4 py-4 md:px-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-xl font-bold tracking-wide text-neon-text">ЗАКАЗЫ</h1>

          <div className="min-w-[260px] flex-1">
            <NeonInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по номеру, модели, артикулу, клиенту"
              className="h-[42px] py-2"
            />
          </div>

          <div className="min-w-[220px] flex-1">
            <NeonInput
              value={managerSearch}
              onChange={(e) => setManagerSearch(e.target.value)}
              placeholder="Поиск по бригадиру/технологу"
              className="h-[42px] py-2 opacity-70"
            />
          </div>

          <NeonSelect value={priority} onChange={(e) => setPriority(e.target.value)} className="h-[42px] w-[160px] shrink-0 py-2">
            {PRIORITIES.map((item) => (
              <option key={item.key || 'all'} value={item.key}>
                {item.label}
              </option>
            ))}
          </NeonSelect>

          <NeonButton
            variant={sort === 'forecast' ? 'primary' : 'secondary'}
            onClick={() => setSort('forecast')}
            className="h-[42px] w-[120px] shrink-0 px-3 py-2 text-xs"
          >
            Прогноз
          </NeonButton>

          <div className="flex h-[42px] w-[190px] shrink-0 items-center justify-center gap-2 rounded-lg border border-white/15 bg-slate-900/80 px-3 py-2 whitespace-nowrap">
            <input
              id="showCompleted"
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="h-4 w-4 accent-lime-500"
            />
            <label htmlFor="showCompleted" className="text-sm text-slate-200">
              Завершенные
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((item) => (
            <Chip key={item.key} onClick={() => setFilter(item.key)} active={filter === item.key}>
              <span className="inline-flex items-center gap-1">
                <span>{item.label}</span>
                {(filterCounters[item.key] || 0) > 0 && (
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] leading-none">
                    {filterCounters[item.key]}
                  </span>
                )}
              </span>
            </Chip>
          ))}

          <div className="flex min-w-0 w-full flex-wrap items-center gap-3 sm:ml-auto sm:w-auto lg:flex-nowrap">
            {/* Переключатель вида: две отдельные кнопки с читаемым интервалом */}
            <div className="flex h-[44px] min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode.key}
                  onClick={() => setViewMode(mode.key)}
                  type="button"
                  className={`h-[34px] min-w-[92px] rounded-lg px-3 text-sm whitespace-nowrap transition ${
                    viewMode === mode.key
                      ? 'bg-white/10 text-neon-text'
                      : 'bg-transparent text-neon-muted hover:bg-white/5 hover:text-neon-text'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <NeonSelect
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-[44px] w-[140px] min-w-0 px-3 py-2 sm:w-[150px]"
            >
              {SORTS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </NeonSelect>
            <NeonButton
              onClick={() => setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              variant="secondary"
              className="h-[44px] px-3 py-2 text-sm whitespace-nowrap"
            >
              {order === 'asc' ? '↑ ASC' : '↓ DESC'}
            </NeonButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardRow({ orderRow, viewMode, onOpenOrder, onOpenStage }) {
  const rowBase = 'border-b border-white/10';
  const stickyLeft = 'sticky z-10 bg-slate-950/95';
  const stickyRight = 'sticky z-10 bg-slate-950/95';

  return (
    <div
      className={`${rowBase} grid min-h-[104px] cursor-pointer`}
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
      onClick={() => onOpenOrder(orderRow.id)}
    >
      <div className={`${stickyLeft} left-0 border-r border-white/10 px-0`}>
        <UnifiedCellBox className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-100">
            {(orderRow.client_name || '?').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{orderRow.client_name || '—'}</div>
            <div className="truncate text-xs text-slate-400">{orderRow.model_name || '—'} • #{orderRow.order_number || orderRow.id}</div>
          </div>
        </UnifiedCellBox>
      </div>

      <div className={`${stickyLeft} border-r border-white/10 px-0`} style={{ left: `${COL_WIDTHS.client}px` }}>
        <UnifiedCellBox className="flex items-center justify-center">
          <div className={`inline-flex min-w-[30px] items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold ${priorityBadge(orderRow.priority)}`}>
            {priorityNum(orderRow.priority)}
          </div>
        </UnifiedCellBox>
      </div>

      <div className={`${stickyLeft} border-r border-white/10 px-0`} style={{ left: `${COL_WIDTHS.client + COL_WIDTHS.priority}px` }}>
        <UnifiedCellBox className="flex items-center justify-center text-center text-xs text-slate-300">
          {formatDate(orderRow.created_at)}
        </UnifiedCellBox>
      </div>

      {STAGE_COLUMNS.map((stageCol) => {
        const stage = (orderRow.stages || []).find((s) => s.stage_key === stageCol.key);
        return (
          <div key={`${orderRow.id}-${stageCol.key}`} className="border-r border-white/10 px-0 py-0">
            {stage ? (
              <StageCell
                stage={stage}
                viewMode={viewMode}
                orderId={orderRow.id}
                onOpenStage={onOpenStage}
              />
            ) : (
              <UnifiedCellBox className="flex items-center justify-center text-sm text-slate-400">
                -
              </UnifiedCellBox>
            )}
          </div>
        );
      })}

      <div className={`${stickyRight} border-l border-white/10 px-0`} style={{ right: `${COL_WIDTHS.deadline}px` }}>
        <UnifiedCellBox className="text-center">
          <div className="text-[10px] text-slate-400">Прогноз</div>
          <div
            className={`mt-1 text-xs font-semibold ${
              orderRow.forecast_date && orderRow.deadline && orderRow.forecast_date > orderRow.deadline ? 'text-amber-300' : 'text-slate-100'
            }`}
          >
            {formatDate(orderRow.forecast_date)}
          </div>
        </UnifiedCellBox>
      </div>

      <div className={`${stickyRight} right-0 border-l border-white/10 px-0`}>
        <UnifiedCellBox className="text-center">
          <div className="text-[10px] text-slate-400">Сдача</div>
          <div className={`mt-1 text-xs font-semibold ${orderRow.is_overdue ? 'text-red-300' : 'text-slate-100'}`}>
            {formatDate(orderRow.deadline)}
          </div>
        </UnifiedCellBox>
      </div>
    </div>
  );
}

export default function OrdersBoard() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [managerSearch, setManagerSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [priority, setPriority] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [sort, setSort] = useState('deadline');
  const [order, setOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('schedule');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({ pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, orders: [] });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, filter, priority, showCompleted, sort, order]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.board.getOrders({
          q: debouncedQ || undefined,
          filter,
          priority: priority || undefined,
          showCompleted: String(showCompleted),
          sort,
          order,
          page,
          limit,
        });
        if (!cancelled) setData(response);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Ошибка загрузки панели заказов');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, filter, priority, showCompleted, sort, order, page, limit]);

  const hasOrders = data.orders && data.orders.length > 0;
  const pagination = data.pagination || { page: 1, totalPages: 1, total: 0 };
  const filterCounters = useMemo(() => calcFilterCounters(data.orders || []), [data.orders]);

  const onOpenOrder = (id) => navigate(`/orders/${id}`);
  const onOpenStage = (id, stageKey) => navigate(`/orders/${id}?stage=${stageKey}`);

  return (
    <section className="min-h-full overflow-x-hidden text-neon-text">
      <BoardHeader
        q={q}
        setQ={setQ}
        managerSearch={managerSearch}
        setManagerSearch={setManagerSearch}
        priority={priority}
        setPriority={setPriority}
        showCompleted={showCompleted}
        setShowCompleted={setShowCompleted}
        filter={filter}
        setFilter={setFilter}
        filterCounters={filterCounters}
        sort={sort}
        setSort={setSort}
        order={order}
        setOrder={setOrder}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <div className="p-3 md:p-4">
        {loading && <NeonCard className="p-4 text-sm text-neon-muted">Загрузка...</NeonCard>}
        {!loading && error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

        {!loading && !error && !hasOrders && (
          <NeonCard className="p-8 text-center text-neon-muted">
            Заказы не найдены по текущим фильтрам
          </NeonCard>
        )}

        {!loading && !error && hasOrders && (
          <div className="rounded-card border border-white/10 bg-slate-950/35">
            <div className="max-h-[calc(100vh-320px)] overflow-auto">
              <div style={{ minWidth: `${GRID_MIN_WIDTH}px` }}>
                {/* Шапка таблицы со sticky-позиционированием */}
                <div className="sticky top-0 z-20 grid border-b border-white/15 bg-slate-950/95 text-[11px] font-semibold tracking-wide text-slate-300" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                  <div className="sticky left-0 z-30 border-r border-white/15 px-3 py-3">КЛИЕНТ</div>
                  <div className="sticky z-30 border-r border-white/15 px-2 py-3 text-center" style={{ left: `${COL_WIDTHS.client}px` }}>ПР</div>
                  <div className="sticky z-30 border-r border-white/15 px-2 py-3 text-center" style={{ left: `${COL_WIDTHS.client + COL_WIDTHS.priority}px` }}>ДАТА ОФОРМ.</div>
                  {STAGE_COLUMNS.map((col) => (
                    <div key={col.key} className="border-r border-white/10 px-2 py-3 text-center">
                      {col.title}
                    </div>
                  ))}
                  <div className="sticky z-30 border-l border-white/15 px-2 py-3 text-center" style={{ right: `${COL_WIDTHS.deadline}px` }}>
                    ПРОГНОЗ ДАТА
                  </div>
                  <div className="sticky right-0 z-30 border-l border-white/15 px-2 py-3 text-center">
                    ДАТА СДАЧИ
                  </div>
                </div>

                {data.orders.map((orderRow) => (
                  <BoardRow
                    key={orderRow.id}
                    orderRow={orderRow}
                    viewMode={viewMode}
                    onOpenOrder={onOpenOrder}
                    onOpenStage={onOpenStage}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-sm">
            <div className="text-slate-400">
              Страница {pagination.page} из {pagination.totalPages} • Всего: {pagination.total}
            </div>
            <div className="flex items-center gap-2">
              <NeonButton
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                variant="secondary"
                className="rounded-md px-3 py-1"
              >
                Назад
              </NeonButton>
              <NeonButton
                onClick={() => setPage((p) => Math.min(pagination.totalPages || 1, p + 1))}
                disabled={pagination.page >= (pagination.totalPages || 1)}
                variant="secondary"
                className="rounded-md px-3 py-1"
              >
                Вперёд
              </NeonButton>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
