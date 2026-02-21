/**
 * Планирование — пошаговый фильтр
 * Порядок: Цех → Модель → Дата (начало/конец) → Этаж
 * Таблица: Дата | План | Факт | Действия
 *
 * Автоподстановка дат: после выбора модели — текущая неделя или месяц.
 * Переключатель [Неделя | Месяц], режим сохраняется в localStorage.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';

const FLOOR_1_HINT = '1 этаж — финиш: ОТК, петля, пуговица, метка, упаковка';
const FLOOR_STORAGE_KEY = 'planning_last_floor';
const DATE_MODE_STORAGE_KEY = 'planning_date_mode';
const PLANNING_WORKSHOP_KEY = 'planning_workshop_id';
const PLANNING_ORDER_KEY = 'planning_order_id';
const PLANNING_FROM_KEY = 'planning_from';
const PLANNING_TO_KEY = 'planning_to';
const PLANNING_FLOW_OPEN_KEY = 'planning_flow_open';

/** Форматирование даты в YYYY-MM-DD */
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Понедельник текущей недели для даты */
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatDate(d);
}

/** Воскресенье текущей недели для даты */
function getSundayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  d.setDate(diff);
  return formatDate(d);
}

/** Первое число текущего месяца */
function getFirstDayOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  return formatDate(d);
}

/** Последнее число текущего месяца */
function getLastDayOfMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return formatDate(d);
}

/** Диапазон дат по режиму (неделя или месяц) */
function getDateRangeForMode(mode, refDate = new Date()) {
  if (mode === 'month') {
    return {
      from: getFirstDayOfMonth(refDate),
      to: getLastDayOfMonth(refDate),
    };
  }
  return {
    from: getMondayOfWeek(refDate),
    to: getSundayOfWeek(refDate),
  };
}

export default function Planning() {
  const [searchParams] = useSearchParams();
  const urlInitDone = useRef(false);
  const skipResetFromUrl = useRef(false);

  const [workshops, setWorkshops] = useState([]);
  const [workshopId, setWorkshopId] = useState('');
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);

  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [orderId, setOrderId] = useState('');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Режим периода: неделя или месяц. Сохраняется в localStorage.
  const [dateMode, setDateMode] = useState(() => {
    try {
      const saved = localStorage.getItem(DATE_MODE_STORAGE_KEY);
      return saved === 'month' ? 'month' : 'week';
    } catch {
      return 'week';
    }
  });

  // Флаг для лёгкой fade-анимации при автоподстановке дат
  const [datesAutoFilled, setDatesAutoFilled] = useState(false);

  const [floors, setFloors] = useState([]);
  const [floorsLoading, setFloorsLoading] = useState(false);
  const [floorId, setFloorId] = useState('');

  const [data, setData] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [saving, setSaving] = useState(false);

  // Расчёт по мощности
  const [calcResult, setCalcResult] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [capacityWeek, setCapacityWeek] = useState('1000');
  const [applySuccess, setApplySuccess] = useState(false);

  // Параметры потока (калькулятор)
  const [flowOpen, setFlowOpen] = useState(() => {
    try {
      return localStorage.getItem(PLANNING_FLOW_OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [flowForm, setFlowForm] = useState({
    shift_hours: 8,
    product_type: 'dress',
    mode: 'BY_SHIFT_CAPACITY',
    Msm: '',
    Np: '',
    Kr: '',
    Su: '',
    T: '',
    M: '',
    operation_time_sec: '',
    planned_total_ui: '',
  });
  const [flowResult, setFlowResult] = useState(null);
  const [flowLoading, setFlowLoading] = useState(false);
  const [flowApplyLoading, setFlowApplyLoading] = useState(false);
  const [flowApplySuccess, setFlowApplySuccess] = useState(false);

  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const canEdit = ['admin', 'manager', 'technologist'].includes(user.role);
  const canApply = ['admin', 'manager', 'technologist'].includes(user.role);

  // Шаг 1: цехи
  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  // Инициализация из URL (переход из Отчётов) или из localStorage (после обновления страницы)
  useEffect(() => {
    if (workshops.length === 0) return;
    const wid = searchParams.get('workshop_id');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const fid = searchParams.get('floor_id') ?? '';
    const oid = searchParams.get('order_id') ?? '';
    if (wid && workshops.some((x) => String(x.id) === wid)) {
      // URL-параметры заданы — используем их
      if (!urlInitDone.current) {
        urlInitDone.current = true;
        skipResetFromUrl.current = true;
        setWorkshopId(wid);
        if (fromParam) setFrom(fromParam);
        if (toParam) setTo(toParam);
        if (fid) setFloorId(fid);
        if (oid) setOrderId(oid);
      }
    } else if (!urlInitDone.current) {
      // Нет URL-параметров — восстанавливаем из localStorage
      urlInitDone.current = true;
      try {
        const savedW = localStorage.getItem(PLANNING_WORKSHOP_KEY);
        const savedO = localStorage.getItem(PLANNING_ORDER_KEY);
        const savedFrom = localStorage.getItem(PLANNING_FROM_KEY);
        const savedTo = localStorage.getItem(PLANNING_TO_KEY);
        if (savedW && workshops.some((x) => String(x.id) === savedW)) {
          skipResetFromUrl.current = true;
          setWorkshopId(savedW);
          if (savedFrom) setFrom(savedFrom);
          if (savedTo) setTo(savedTo);
          if (savedO) setOrderId(savedO);
        }
      } catch (_) {}
    }
  }, [workshops, searchParams]);

  // Шаг 2: модели по цеху
  useEffect(() => {
    if (!workshopId) {
      setModels([]);
      setOrderId('');
      setSelectedWorkshop(null);
      return;
    }
    const w = workshops.find((x) => String(x.id) === String(workshopId));
    setSelectedWorkshop(w || null);
    setModelsLoading(true);
    api.orders
      .byWorkshop(workshopId)
      .then((modelsList) => {
        setModels(modelsList);
        setOrderId((prev) => {
          if (skipResetFromUrl.current) {
            const savedO = localStorage.getItem(PLANNING_ORDER_KEY);
            if (savedO && modelsList.some((m) => String(m.id) === savedO)) return savedO;
          }
          if (prev && !modelsList.some((m) => String(m.id) === prev)) return '';
          return prev;
        });
      })
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
    if (!skipResetFromUrl.current) {
      setOrderId('');
      setFrom('');
      setTo('');
      setFloors([]);
      setFloorId('');
    } else {
      skipResetFromUrl.current = false;
    }
    setData(null);
    setCalcResult(null);
  }, [workshopId, workshops]);

  // Автоподстановка дат после выбора модели: если даты пустые — текущая неделя/месяц
  useEffect(() => {
    if (!orderId) return;
    if (from !== '' || to !== '') return; // Даты уже выбраны вручную — не перезаписывать
    const { from: f, to: t } = getDateRangeForMode(dateMode);
    setFrom(f);
    setTo(t);
    setDatesAutoFilled(true);
  }, [orderId, dateMode]);

  // Сброс анимации автоподстановки через 500 мс
  useEffect(() => {
    if (!datesAutoFilled) return;
    const t = setTimeout(() => setDatesAutoFilled(false), 500);
    return () => clearTimeout(t);
  }, [datesAutoFilled]);

  // Сохранение режима в localStorage при смене
  useEffect(() => {
    try {
      localStorage.setItem(DATE_MODE_STORAGE_KEY, dateMode);
    } catch (_) {}
  }, [dateMode]);

  // Сохранение фильтров в localStorage (цех, модель, даты) — чтобы не сбрасывались при обновлении страницы
  useEffect(() => {
    try {
      if (workshopId) localStorage.setItem(PLANNING_WORKSHOP_KEY, workshopId);
      if (orderId) localStorage.setItem(PLANNING_ORDER_KEY, orderId);
      if (from) localStorage.setItem(PLANNING_FROM_KEY, from);
      if (to) localStorage.setItem(PLANNING_TO_KEY, to);
    } catch (_) {}
  }, [workshopId, orderId, from, to]);

  // Сохранение состояния блока «Параметры потока»
  useEffect(() => {
    try {
      localStorage.setItem(PLANNING_FLOW_OPEN_KEY, flowOpen ? 'true' : 'false');
    } catch (_) {}
  }, [flowOpen]);

  // Шаг 4: этажи по цеху (только если floors_count > 1)
  useEffect(() => {
    if (!workshopId || !selectedWorkshop || selectedWorkshop.floors_count <= 1) {
      setFloors([]);
      if (!urlInitDone.current) setFloorId('');
      return;
    }
    setFloorsLoading(true);
    api.planning
      .floors(workshopId)
      .then((f) => {
        const list = f || [];
        setFloors(list);
        const fidFromUrl = searchParams.get('floor_id');
        const keepFromUrl = urlInitDone.current && fidFromUrl && list.some((x) => String(x.id) === fidFromUrl);
        if (keepFromUrl) {
          setFloorId(String(fidFromUrl));
        } else {
          const saved = localStorage.getItem(FLOOR_STORAGE_KEY);
          const defaultId = saved && list.some((x) => String(x.id) === saved) ? saved : (list[1]?.id ?? list[0]?.id ?? '');
          setFloorId(String(defaultId));
        }
      })
      .catch(() => setFloors([]))
      .finally(() => setFloorsLoading(false));
  }, [workshopId, selectedWorkshop, searchParams]);

  const handleFloorChange = (val) => {
    setFloorId(val);
    localStorage.setItem(FLOOR_STORAGE_KEY, val);
  };

  /** Смена режима периода (неделя/месяц): пересчёт from/to и перезагрузка таблицы */
  const handleDateModeChange = useCallback((mode) => {
    setDateMode(mode);
    const { from: f, to: t } = getDateRangeForMode(mode);
    setFrom(f);
    setTo(t);
    setDatesAutoFilled(true);
  }, []);

  // Проверка: можно ли загрузить таблицу
  const canLoadTable =
    workshopId &&
    orderId &&
    from &&
    to &&
    (selectedWorkshop?.floors_count === 1 || (selectedWorkshop?.floors_count > 1 && floorId));

  // Загрузка таблицы
  useEffect(() => {
    if (!canLoadTable) {
      setData(null);
      return;
    }
    setTableLoading(true);
    setErrorMsg('');
    const params = {
      workshop_id: workshopId,
      order_id: orderId,
      from,
      to,
    };
    if (selectedWorkshop?.floors_count > 1) {
      params.floor_id = floorId;
    }
    api.planning
      .modelTable(params)
      .then(setData)
      .catch((err) => {
        setData(null);
        setErrorMsg(err.message || 'Ошибка загрузки данных');
      })
      .finally(() => setTableLoading(false));
  }, [canLoadTable, workshopId, orderId, from, to, floorId, selectedWorkshop?.floors_count]);

  // Сброс результата расчёта при смене фильтров
  useEffect(() => {
    setCalcResult(null);
  }, [orderId, from, to, floorId]);


  const handleCalcCapacity = async () => {
    if (!canLoadTable) return;
    setCalcLoading(true);
    setErrorMsg('');
    setCalcResult(null);
    try {
      const params = {
        workshop_id: Number(workshopId),
        order_id: Number(orderId),
        from,
        to,
      };
      if (selectedWorkshop?.floors_count > 1) {
        params.floor_id = Number(floorId);
      }
      const cap = parseInt(capacityWeek, 10);
      if (cap >= 1000 && cap <= 5000) {
        params.capacity_week = cap;
      }
      const result = await api.planning.calcCapacity(params);
      setCalcResult(result);
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка расчёта');
    } finally {
      setCalcLoading(false);
    }
  };

  const handleApplyCapacity = async () => {
    if (!calcResult || calcResult.overload || !canApply) return;
    setApplyLoading(true);
    setErrorMsg('');
    try {
      await api.planning.applyCapacity({
        order_id: Number(orderId),
        workshop_id: Number(workshopId),
        floor_id: selectedWorkshop?.floors_count > 1 ? Number(floorId) : null,
        days: calcResult.days,
      });
      setCalcResult(null);
      setApplySuccess(true);
      setTimeout(() => setApplySuccess(false), 3000);
      if (canLoadTable) {
        const params = { workshop_id: workshopId, order_id: orderId, from, to };
        if (selectedWorkshop?.floors_count > 1) params.floor_id = floorId;
        api.planning.modelTable(params).then(setData).catch(() => setData(null));
      }
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка применения плана');
    } finally {
      setApplyLoading(false);
    }
  };

  const handleFlowCalc = async () => {
    setFlowLoading(true);
    setFlowResult(null);
    setErrorMsg('');
    try {
      const body = {
        workshop_id: workshopId ? Number(workshopId) : undefined,
        floor_id: selectedWorkshop?.floors_count > 1 && floorId ? Number(floorId) : null,
        from,
        to,
        order_id: orderId ? Number(orderId) : undefined,
        shift_hours: flowForm.shift_hours || 8,
        product_type: flowForm.product_type || 'dress',
        mode: flowForm.mode,
        planned_total_ui: flowForm.planned_total_ui || undefined,
      };
      if (flowForm.Msm) body.Msm = parseFloat(flowForm.Msm);
      if (flowForm.Np) body.Np = parseFloat(flowForm.Np);
      if (flowForm.Kr) body.Kr = parseFloat(flowForm.Kr);
      if (flowForm.Su) body.Su = parseFloat(flowForm.Su);
      if (flowForm.T) body.T = parseFloat(flowForm.T);
      if (flowForm.M) body.M = parseFloat(flowForm.M);
      if (flowForm.operation_time_sec) body.operation_time_sec = parseFloat(flowForm.operation_time_sec);
      const result = await api.planning.flowCalc(body);
      setFlowResult(result);
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка расчёта');
    } finally {
      setFlowLoading(false);
    }
  };

  /** Распределить и применить план по мощности (flow/apply-auto) */
  const handleFlowApplyAuto = async () => {
    if (!flowResult?.capacity_ok || !canApply || !canLoadTable) return;
    const plannedTotal = flowResult.planned_total_in_period ?? 0;
    if (plannedTotal <= 0) return;
    setFlowApplyLoading(true);
    setErrorMsg('');
    setFlowApplySuccess(false);
    try {
      const body = {
        workshop_id: Number(workshopId),
        order_id: Number(orderId),
        floor_id: selectedWorkshop?.floors_count > 1 && floorId ? Number(floorId) : null,
        from,
        to,
        planned_total: plannedTotal,
        shift_hours: flowForm.shift_hours || 8,
        mode: flowForm.mode,
        product_type: flowForm.product_type || 'dress',
      };
      if (flowForm.Msm) body.Msm = parseFloat(flowForm.Msm);
      if (flowForm.Np) body.Np = parseFloat(flowForm.Np);
      if (flowForm.Kr) body.Kr = parseFloat(flowForm.Kr);
      if (flowForm.Su) body.Su = parseFloat(flowForm.Su);
      if (flowForm.T) body.T = parseFloat(flowForm.T);
      if (flowForm.M) body.M = parseFloat(flowForm.M);
      await api.planning.flowApplyAuto(body);
      setFlowApplySuccess(true);
      setTimeout(() => setFlowApplySuccess(false), 3000);
      // Обновить таблицу планирования
      const params = { workshop_id: workshopId, order_id: orderId, from, to };
      if (selectedWorkshop?.floors_count > 1) params.floor_id = floorId;
      api.planning.modelTable(params).then(setData).catch(() => setData(null));
      // Пересчитать flow для обновления % загрузки
      handleFlowCalc();
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка применения плана');
    } finally {
      setFlowApplyLoading(false);
    }
  };

  const handleSaveDay = async () => {
    if (!editModal || !workshopId) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await api.planning.updateDay({
        order_id: editModal.order_id,
        workshop_id: Number(workshopId),
        date: editModal.date,
        floor_id: selectedWorkshop?.floors_count > 1 ? Number(floorId) : null,
        planned_qty: editModal.planned_qty,
        actual_qty: editModal.actual_qty,
      });
      setEditModal(null);
      if (canLoadTable) {
        const params = { workshop_id: workshopId, order_id: orderId, from, to };
        if (selectedWorkshop?.floors_count > 1) params.floor_id = floorId;
        api.planning.modelTable(params).then(setData).catch(() => setData(null));
      }
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const showFloorStep = selectedWorkshop?.floors_count > 1;
  const floor1Selected = showFloorStep && Number(floorId) === 1;

  const selectClass = (disabled) =>
    `px-4 py-2 rounded-lg border ${
      disabled
        ? 'bg-accent-2/70 dark:bg-dark-800/80 border-white/20 cursor-not-allowed text-[#ECECEC]/80'
        : 'bg-accent-2/80 dark:bg-dark-800 border-white/25 dark:border-white/25 text-[#ECECEC]'
    } dark:text-dark-text`;

  const inputClass = (disabled) =>
    `px-3 py-2 rounded-lg border ${
      disabled
        ? 'bg-accent-2/70 dark:bg-dark-800/80 border-white/20 cursor-not-allowed'
        : 'bg-accent-2/80 dark:bg-dark-800 border-white/25 dark:border-white/25'
    } ${disabled ? 'text-[#ECECEC]/70' : 'text-[#ECECEC]'} dark:text-dark-text`;

  const fromDateRef = useRef(null);
  const toDateRef = useRef(null);
  const openDatePicker = (ref) => {
    if (!ref?.current || !orderId) return;
    ref.current.focus();
    ref.current.showPicker?.();
  };

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Планирование</h1>
        {data && <PrintButton />}
      </div>

      {/* Пошаговый фильтр — сетка для ровного расположения */}
      <div className="no-print mb-6">
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${showFloorStep ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {/* Шаг 1: Цех */}
          <div>
            <label className="block text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 mb-1">1. Цех</label>
            <select
              value={workshopId}
              onChange={(e) => setWorkshopId(e.target.value)}
              className={`${selectClass(false)} w-full`}
            >
              <option value="">Выберите цех</option>
              {workshops.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Шаг 2: Модель */}
          <div>
            <label className="block text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 mb-1">2. Модель</label>
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              disabled={!workshopId}
              className={`${selectClass(!workshopId)} w-full`}
            >
              <option value="">
                {!workshopId ? 'Сначала выберите цех' : modelsLoading ? 'Загрузка...' : 'Выберите модель'}
              </option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.client_name} — {m.title}
                </option>
              ))}
            </select>
          </div>

          {/* Шаг 3: Период и даты */}
          <div
            className={`sm:col-span-2 lg:col-span-1 lg:mr-2 transition-all duration-300 ${
              datesAutoFilled ? 'ring-2 ring-primary-500/30 rounded-lg ring-offset-2 ring-offset-transparent p-1 -m-1' : ''
            }`}
          >
            <label className="block text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 mb-1">3. Период</label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-white/25 dark:border-white/25 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleDateModeChange('week')}
                  disabled={!orderId}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    dateMode === 'week'
                      ? 'bg-primary-600 text-white'
                      : 'bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC]/80 dark:text-dark-text/80 hover:bg-accent-2 dark:hover:bg-dark-700 disabled:opacity-50'
                  }`}
                >
                  Неделя
                </button>
                <button
                  type="button"
                  onClick={() => handleDateModeChange('month')}
                  disabled={!orderId}
                  className={`px-3 py-2 text-sm font-medium transition-colors border-l border-white/25 ${
                    dateMode === 'month'
                      ? 'bg-primary-600 text-white'
                      : 'bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC]/80 dark:text-dark-text/80 hover:bg-accent-2 dark:hover:bg-dark-700 disabled:opacity-50'
                  }`}
                >
                  Месяц
                </button>
              </div>
              <div className="flex gap-2 flex-1 min-w-0">
                <input
                  ref={fromDateRef}
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  disabled={!orderId}
                  className="sr-only planning-date-input"
                  style={{ colorScheme: 'dark' }}
                  aria-label="Дата начала"
                />
                <button
                  type="button"
                  onClick={() => openDatePicker(fromDateRef)}
                  disabled={!orderId}
                  title={from ? `от ${from}` : 'Выберите дату начала'}
                  className={`p-2.5 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                    !orderId
                      ? 'bg-accent-2/70 border-white/20 cursor-not-allowed opacity-50'
                      : 'bg-accent-2/80 border-white/25 text-[#ECECEC] hover:text-white hover:bg-accent-2'
                  }`}
                  aria-label="Календарь — дата начала"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                <input
                  ref={toDateRef}
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={!orderId}
                  className="sr-only planning-date-input"
                  style={{ colorScheme: 'dark' }}
                  aria-label="Дата окончания"
                />
                <button
                  type="button"
                  onClick={() => openDatePicker(toDateRef)}
                  disabled={!orderId}
                  title={to ? `до ${to}` : 'Выберите дату окончания'}
                  className={`p-2.5 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                    !orderId
                      ? 'bg-accent-2/70 border-white/20 cursor-not-allowed opacity-50'
                      : 'bg-accent-2/80 border-white/25 text-[#ECECEC] hover:text-white hover:bg-accent-2'
                  }`}
                  aria-label="Календарь — дата окончания"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Шаг 4: Этаж (только для Наш цех) */}
          {showFloorStep && (
            <div className="max-w-[200px] lg:ml-4">
              <label className="block text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 mb-1">4. Этаж</label>
              <select
                value={floorId}
                onChange={(e) => handleFloorChange(e.target.value)}
                disabled={!from || !to}
                className={`${selectClass(!from || !to)} w-full`}
              >
                <option value="">
                  {!from || !to ? 'Сначала выберите даты' : floorsLoading ? 'Загрузка...' : 'Выберите этаж'}
                </option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id === 1 ? `1 (Финиш)` : f.name}
                </option>
              ))}
            </select>
            {(!from || !to) && (
              <p className="text-sm text-[#ECECEC]/60 dark:text-dark-text/60 mt-1">Сначала выберите даты</p>
            )}
          </div>
        )}
        </div>

        {!orderId && (
          <p className="text-sm text-[#ECECEC]/60 dark:text-dark-text/60 mt-2">Сначала выберите модель</p>
        )}

        {floor1Selected && (
          <div className="mt-4 px-4 py-2 rounded-lg bg-primary-600/20 text-primary-200 dark:text-primary-300 text-sm">
            {FLOOR_1_HINT}
          </div>
        )}

        {/* Блок «Параметры потока» — collapsible */}
        <div className="no-print mt-6">
          <button
            type="button"
            onClick={() => setFlowOpen(!flowOpen)}
            className="flex items-center gap-2 w-full text-left px-4 py-3 rounded-xl bg-accent-3/80 dark:bg-dark-900 border border-white/25 hover:bg-accent-3 dark:hover:bg-dark-800 transition-colors"
          >
            <svg className={`w-5 h-5 transition-transform ${flowOpen ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span className="font-medium text-[#ECECEC] dark:text-dark-text">Параметры потока (расчёт)</span>
          </button>
          {flowOpen && (
            <div className="mt-2 p-4 rounded-xl bg-accent-3/80 dark:bg-dark-900 border border-white/25 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-[#ECECEC]/80 mb-1">Длительность смены (ч)</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={flowForm.shift_hours}
                    onChange={(e) => setFlowForm({ ...flowForm, shift_hours: e.target.value || 8 })}
                    className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC]/80 mb-1">Тип изделия</label>
                  <select
                    value={flowForm.product_type}
                    onChange={(e) => setFlowForm({ ...flowForm, product_type: e.target.value })}
                    className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                  >
                    <option value="dress">Платье</option>
                    <option value="coat">Пальто</option>
                    <option value="suit">Костюм</option>
                    <option value="underwear">Бельё</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC]/80 mb-1">Режим расчёта</label>
                  <select
                    value={flowForm.mode}
                    onChange={(e) => setFlowForm({ ...flowForm, mode: e.target.value })}
                    className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                  >
                    <option value="BY_SHIFT_CAPACITY">По мощности смены (Mсм)</option>
                    <option value="BY_WORKERS">По числу рабочих (Np)</option>
                    <option value="BY_WORKPLACES">По рабочим местам (Kr)</option>
                    <option value="BY_AREA">По площади (Su)</option>
                    <option value="BY_T_AND_M">По T и M (трудоёмкость и выпуск)</option>
                  </select>
                </div>
              </div>
              {/* Динамические поля по режиму */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {flowForm.mode === 'BY_SHIFT_CAPACITY' && (
                  <div>
                    <label className="block text-sm text-[#ECECEC]/80 mb-1">Mсм (ед/смена)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={flowForm.Msm}
                      onChange={(e) => setFlowForm({ ...flowForm, Msm: e.target.value })}
                      placeholder="Мощность смены"
                      className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                    />
                  </div>
                )}
                {flowForm.mode === 'BY_WORKERS' && (
                  <>
                    <div>
                      <label className="block text-sm text-[#ECECEC]/80 mb-1">T — трудоёмкость (сек)</label>
                      <input
                        type="number"
                        min="0.01"
                        value={flowForm.T}
                        onChange={(e) => setFlowForm({ ...flowForm, T: e.target.value })}
                        placeholder="Трудоёмкость"
                        className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#ECECEC]/80 mb-1">Np — число рабочих</label>
                      <input
                        type="number"
                        min="1"
                        value={flowForm.Np}
                        onChange={(e) => setFlowForm({ ...flowForm, Np: e.target.value })}
                        placeholder="Количество рабочих"
                        className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                      />
                    </div>
                  </>
                )}
                {flowForm.mode === 'BY_WORKPLACES' && (
                  <div>
                    <label className="block text-sm text-[#ECECEC]/80 mb-1">Kr — рабочие места</label>
                    <input
                      type="number"
                      min="1"
                      value={flowForm.Kr}
                      onChange={(e) => setFlowForm({ ...flowForm, Kr: e.target.value })}
                      placeholder="Количество рабочих мест"
                      className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                    />
                  </div>
                )}
                {flowForm.mode === 'BY_AREA' && (
                  <div>
                    <label className="block text-sm text-[#ECECEC]/80 mb-1">Su — площадь (м²)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={flowForm.Su}
                      onChange={(e) => setFlowForm({ ...flowForm, Su: e.target.value })}
                      placeholder="Площадь"
                      className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                    />
                  </div>
                )}
                {flowForm.mode === 'BY_T_AND_M' && (
                  <>
                    <div>
                      <label className="block text-sm text-[#ECECEC]/80 mb-1">T — трудоёмкость (сек)</label>
                      <input
                        type="number"
                        min="0.01"
                        value={flowForm.T}
                        onChange={(e) => setFlowForm({ ...flowForm, T: e.target.value })}
                        placeholder="Трудоёмкость"
                        className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#ECECEC]/80 mb-1">M — сменный выпуск (ед/смена)</label>
                      <input
                        type="number"
                        min="0.01"
                        value={flowForm.M}
                        onChange={(e) => setFlowForm({ ...flowForm, M: e.target.value })}
                        placeholder="Выпуск за смену"
                        className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm text-[#ECECEC]/80 mb-1">t_op — время операции (сек) — для Нв</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={flowForm.operation_time_sec}
                    onChange={(e) => setFlowForm({ ...flowForm, operation_time_sec: e.target.value })}
                    placeholder="Опционально"
                    className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC]/80 mb-1">План на период (если не из БД)</label>
                  <input
                    type="number"
                    min="0"
                    value={flowForm.planned_total_ui}
                    onChange={(e) => setFlowForm({ ...flowForm, planned_total_ui: e.target.value })}
                    placeholder="Опционально"
                    className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-full"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleFlowCalc}
                disabled={flowLoading || !flowForm.mode}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {flowLoading ? 'Расчёт...' : 'Рассчитать'}
              </button>
              {flowResult && (
                <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
                  <h4 className="font-medium text-[#ECECEC] dark:text-dark-text">Результаты</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    {flowResult.t_sec != null && (
                      <div>
                        <span className="text-[#ECECEC]/60">Такт t</span>
                        <p className="font-medium">{flowResult.t_sec} сек</p>
                      </div>
                    )}
                    {flowResult.Np_calc != null && (
                      <div>
                        <span className="text-[#ECECEC]/60">Рабочие Np</span>
                        <p className="font-medium">{flowResult.Np_calc}</p>
                      </div>
                    )}
                    {flowResult.Kr_calc != null && (
                      <div>
                        <span className="text-[#ECECEC]/60">Рабочие места Kr</span>
                        <p className="font-medium">{flowResult.Kr_calc}</p>
                      </div>
                    )}
                    {flowResult.Nv_per_shift != null && (
                      <div>
                        <span className="text-[#ECECEC]/60">Норма выработки Нв</span>
                        <p className="font-medium">{flowResult.Nv_per_shift} ед/смена</p>
                      </div>
                    )}
                  </div>
                  {flowResult.period_days != null && flowResult.period_days > 0 && (
                    <div className="mt-3 space-y-3">
                      <div className={`p-3 rounded-lg ${flowResult.capacity_ok ? 'bg-accent-2/50 dark:bg-dark-800/50' : 'bg-red-500/20 border border-red-500/50'}`}>
                        <h5 className="text-sm font-medium text-[#ECECEC] mb-2">Проверка мощности на период</h5>
                        <p className="text-sm"><span className="text-[#ECECEC]/70">План на период:</span> {flowResult.planned_total_in_period}</p>
                        <p className="text-sm"><span className="text-[#ECECEC]/70">Мощность на период:</span> {flowResult.capacity_total_in_period}</p>
                        <p className="text-sm"><span className="text-[#ECECEC]/70">Загрузка:</span> {flowResult.capacity_percent}%</p>
                        <p className={`text-sm font-medium mt-1 ${flowResult.capacity_ok ? 'text-green-400' : 'text-red-400'}`}>
                          {flowResult.capacity_ok ? 'Хватает' : 'Не хватает'}
                        </p>
                        {!flowResult.capacity_ok && (
                          <p className="text-sm text-red-400 mt-2">
                            Перегруз: план ({flowResult.planned_total_in_period}) превышает мощность периода ({flowResult.capacity_total_in_period}). Увеличьте период или уменьшите объём.
                          </p>
                        )}
                      </div>
                      {flowResult.capacity_ok && canApply && (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleFlowApplyAuto}
                            disabled={flowApplyLoading}
                            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            {flowApplyLoading ? 'Применение...' : 'Распределить и применить по мощности'}
                          </button>
                          {flowApplySuccess && (
                            <span className="text-sm text-green-400">План успешно применён</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {flowResult.notes?.length > 0 && (
                    <ul className="text-sm text-[#ECECEC]/80 space-y-1">
                      {flowResult.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Расчёт по мощности */}
        {canLoadTable && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm text-[#ECECEC]/80 mb-1">Мощность в неделю (1000–5000 ед)</label>
              <input
                type="number"
                min="1000"
                max="5000"
                value={capacityWeek}
                onChange={(e) => setCapacityWeek(e.target.value)}
                placeholder="1000–5000"
                className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-48"
              />
            </div>
            <button
              type="button"
              onClick={handleCalcCapacity}
              disabled={calcLoading}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {calcLoading ? 'Расчёт...' : 'Рассчитать автоматически'}
            </button>
            {canApply && applySuccess && orderId && (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-green-400">План применён</span>
                <Link
                  to={`/orders/${orderId}`}
                  className="text-primary-400 hover:text-primary-300 underline"
                >
                  Перейти к заказу
                </Link>
              </span>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Информационный блок после расчёта */}
      {calcResult && (
        <div className="no-print mb-6 space-y-4">
          <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
            <h3 className="text-sm font-semibold text-[#ECECEC] dark:text-dark-text mb-3">Расчёт по мощности</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-[#ECECEC]/60">Общее количество заказа</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.total_quantity} ед</p>
              </div>
              <div>
                <span className="text-[#ECECEC]/60">Факт по раскрою (к распределению)</span>
                <p className="font-medium text-primary-400">{calcResult.cutting_actual_total || calcResult.cutting_planned_total || calcResult.total_quantity} ед</p>
              </div>
              <div>
                <span className="text-[#ECECEC]/60">Уже выполнено (факт)</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.actual_total} ед</p>
              </div>
              {calcResult.cutting_actual_total > 0 && (
                <div>
                  <span className="text-[#ECECEC]/60">Факт по раскрою</span>
                  <p className="font-medium text-[#ECECEC]">{calcResult.cutting_actual_total} ед</p>
                </div>
              )}
              <div>
                <span className="text-[#ECECEC]/60">Остаток (план к выполнению)</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.remaining} ед</p>
              </div>
              <div>
                <span className="text-[#ECECEC]/60">Дневная мощность этажа</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.daily_capacity} ед/день</p>
              </div>
              {calcResult.capacity_week && (
                <div>
                  <span className="text-[#ECECEC]/60">Мощность в неделю (задана)</span>
                  <p className="font-medium text-[#ECECEC]">{calcResult.capacity_week} ед/неделю</p>
                </div>
              )}
              <div>
                <span className="text-[#ECECEC]/60">Количество дней</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.working_days}</p>
              </div>
              <div>
                <span className="text-[#ECECEC]/60">Общая мощность периода</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.total_capacity} ед</p>
              </div>
              <div>
                <span className="text-[#ECECEC]/60">% загрузки</span>
                <p className={`font-medium ${calcResult.overload ? 'text-red-400' : 'text-[#ECECEC]'}`}>
                  {calcResult.percent}%
                </p>
              </div>
            </div>

            {calcResult.overload && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500 text-red-400 text-sm">
                Перегруз: остаток ({calcResult.remaining}) превышает мощность периода ({calcResult.total_capacity}).
                Увеличьте период или уменьшите объём.
              </div>
            )}

            {!calcResult.overload && calcResult.days?.length > 0 && (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[300px]">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left px-4 py-2 text-sm font-medium text-[#ECECEC]/90">Дата</th>
                        <th className="text-right px-4 py-2 text-sm font-medium text-[#ECECEC]/90">Предложенный план (ед)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calcResult.days.map((d) => (
                        <tr key={d.date} className="border-b border-white/10">
                          <td className="px-4 py-2 text-[#ECECEC]/90 whitespace-nowrap">{d.date}</td>
                          <td className="px-4 py-2 text-right text-[#ECECEC]/90">{d.planned_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canApply && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleApplyCapacity}
                      disabled={applyLoading}
                      className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {applyLoading ? 'Применение...' : 'Применить план'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm">{errorMsg}</div>
      )}

      {/* Пустое состояние */}
      {!workshopId && (
        <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 p-12 text-center text-[#ECECEC]/80 dark:text-dark-text/80 transition-block">
          Выберите цех
        </div>
      )}

      {/* Таблица */}
      {workshopId && (
        <div className="print-area bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 overflow-hidden overflow-x-auto transition-block">
          {!canLoadTable ? (
            <div className="p-12 text-center text-[#ECECEC]/70 dark:text-dark-text/70">
              {!orderId
                ? 'Выберите модель'
                : !from || !to
                  ? 'Выберите даты начала и окончания'
                  : showFloorStep && !floorId
                    ? 'Выберите этаж'
                    : 'Заполните все фильтры'}
            </div>
          ) : tableLoading ? (
            <div className="p-12 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
          ) : !data?.rows?.length ? (
            <div className="p-12 text-center text-[#ECECEC]/80 dark:text-dark-text/80">
              Нет данных за выбранный период
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-white/20 dark:border-white/20">
                <p className="text-sm text-[#ECECEC]/90 dark:text-dark-text/80">
                  {data.order?.client_name} — {data.order?.title}
                  {data.floor && ` • ${data.floor.name}`}
                </p>
              </div>
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="bg-accent-2/80 dark:bg-dark-800 border-b border-white/25">
                    <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дата</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">План</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Факт</th>
                    {canEdit && <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Действия</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const isOver = (row.actual_qty || 0) > (row.planned_qty || 0);
                    const isUnder = (row.actual_qty || 0) < (row.planned_qty || 0) && (row.planned_qty || 0) > 0;
                    const isOk = (row.actual_qty || 0) >= (row.planned_qty || 0) && (row.planned_qty || 0) > 0;
                    const rowClass = isOver ? 'bg-red-500/10' : isOk ? 'bg-green-500/10' : isUnder ? 'bg-amber-500/10' : '';
                    return (
                      <tr key={row.date} className={`border-b border-white/10 dark:border-white/10 ${rowClass}`}>
                        <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text">{row.date}</td>
                        <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{row.planned_qty}</td>
                        <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{row.actual_qty}</td>
                        {canEdit && (
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                setEditModal({
                                  order_id: data.order.id,
                                  order_title: data.order.title,
                                  date: row.date,
                                  planned_qty: row.planned_qty,
                                  actual_qty: row.actual_qty,
                                })
                              }
                              className="text-xs px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700"
                            >
                              Редактировать
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  <tr className="bg-accent-2/50 dark:bg-dark-800 border-t-2 border-white/25 font-bold">
                    <td className="px-4 py-3 text-[#ECECEC] dark:text-dark-text">Итого</td>
                    <td className="px-4 py-3 text-right text-[#ECECEC] dark:text-dark-text">{data.totals?.planned_sum ?? 0}</td>
                    <td className="px-4 py-3 text-right text-[#ECECEC] dark:text-dark-text">{data.totals?.actual_sum ?? 0}</td>
                    {canEdit && <td className="px-4 py-3" />}
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Модалка редактирования */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditModal(null)}>
          <div
            className="bg-accent-3 dark:bg-dark-900 rounded-xl p-6 max-w-md w-full border border-white/25 dark:border-white/25 animate-page-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Редактировать — {editModal.order_title}
            </h3>
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-2">{editModal.date}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#ECECEC]/90 mb-1">План</label>
                <input
                  type="number"
                  min="0"
                  value={editModal.planned_qty}
                  onChange={(e) => setEditModal({ ...editModal, planned_qty: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
                />
              </div>
              <div>
                <label className="block text-sm text-[#ECECEC]/90 mb-1">Факт</label>
                <input
                  type="number"
                  min="0"
                  value={editModal.actual_qty}
                  onChange={(e) => setEditModal({ ...editModal, actual_qty: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSaveDay}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


