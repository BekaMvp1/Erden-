/**
 * Страница распределения заказа
 * Пошаговый UI: этаж (4 варианта) → технолог → операции (швея, кол-во, дата)
 * Использует total_quantity заказа. TODO: Позже привязать операции к вариантам (цвет/размер) при необходимости
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default function PlanningAssign() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order_id');

  const [orders, setOrders] = useState([]);
  const [buildingFloors, setBuildingFloors] = useState([]);
  const [technologists, setTechnologists] = useState([]);
  const [sewers, setSewers] = useState([]);
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [selected, setSelected] = useState({
    order_id: orderIdParam || '',
    building_floor_id: '',
    technologist_id: '',
    operationRows: [{ operation_id: '', sewer_id: '', planned_quantity: '', planned_date: '' }],
  });

  // Загрузка справочников и заказов
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const [statuses, ords, bf, ops] = await Promise.all([
          api.references.orderStatus(),
          api.orders.list({}),
          api.references.buildingFloors(4),
          api.references.operations(),
        ]);
        const acceptedId = statuses.find((s) => s.name === 'Принят')?.id;
        const inWorkId = statuses.find((s) => s.name === 'В работе')?.id;
        const allowedStatuses = [acceptedId, inWorkId].filter(Boolean);
        const filtered =
          allowedStatuses.length > 0
            ? ords.filter((o) => allowedStatuses.includes(o.status_id))
            : ords;
        setOrders(filtered);
        setBuildingFloors(bf || []);
        setOperations(ops || []);

        if (orderIdParam && filtered.some((o) => String(o.id) === orderIdParam)) {
          setSelected((s) => ({ ...s, order_id: orderIdParam }));
          const order = await api.orders.get(orderIdParam);
          const floorId = order?.building_floor_id || order?.floor_id;
          if (floorId && order?.technologist_id) {
            setSelected((s) => ({
              ...s,
              order_id: String(order.id),
              building_floor_id: String(floorId),
              technologist_id: String(order.technologist_id),
            }));
            const sewersData = await api.references.sewers(order.technologist_id);
            setSewers(sewersData || []);
            if (order.OrderOperations?.length > 0) {
              setSelected((s) => ({
                ...s,
                operationRows: order.OrderOperations.map((oo) => ({
                  operation_id: String(oo.operation_id),
                  sewer_id: String(oo.sewer_id || ''),
                  planned_quantity: String(oo.planned_quantity || ''),
                  planned_date: oo.planned_date || '',
                })),
              }));
            }
          }
        }
      } catch (err) {
        setErrorMsg(err.message || 'Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderIdParam]);

  // Технологи — все 4 (выбор любого добавленного вручную)
  useEffect(() => {
    if (!selected.order_id) {
      setTechnologists([]);
      return;
    }
    api.references
      .technologists()
      .then((data) => setTechnologists(data || []))
      .catch(() => setTechnologists([]));
  }, [selected.order_id]);

  // Швеи по технологу
  useEffect(() => {
    if (!selected.technologist_id) {
      setSewers([]);
      return;
    }
    api.references
      .sewers(selected.technologist_id)
      .then((data) => setSewers(data || []))
      .catch(() => setSewers([]));
  }, [selected.technologist_id]);

  const addOperationRow = () => {
    setSelected((s) => ({
      ...s,
      operationRows: [
        ...s.operationRows,
        { operation_id: '', sewer_id: '', planned_quantity: '', planned_date: '' },
      ],
    }));
  };

  const updateRow = (idx, field, value) => {
    setSelected((s) => ({
      ...s,
      operationRows: s.operationRows.map((r, i) =>
        i === idx ? { ...r, [field]: value } : r
      ),
    }));
  };

  const removeRow = (idx) => {
    setSelected((s) => ({
      ...s,
      operationRows: s.operationRows.filter((_, i) => i !== idx),
    }));
  };

  const isFormValid = () => {
    if (!selected.order_id || !selected.building_floor_id || !selected.technologist_id) return false;
    if (selected.operationRows.length === 0) return false;
    const seen = new Set();
    for (const row of selected.operationRows) {
      if (!row.operation_id) return false;
      const op = operations.find((o) => String(o.id) === String(row.operation_id));
      const isFinish = op?.category === 'FINISH';
      if (!isFinish && !row.sewer_id) return false;
      const qty = parseInt(row.planned_quantity, 10);
      if (isNaN(qty) || qty <= 0) return false;
      const date = String(row.planned_date || '').trim();
      if (!date || !DATE_REGEX.test(date)) return false;
      const key = `${row.operation_id}-${date}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!isFormValid()) {
      setErrorMsg('Заполните все поля: этаж, технолог, операции (операция, швея, кол-во > 0, дата)');
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmSave = async () => {
    setShowConfirm(false);
    setSaving(true);
    setErrorMsg('');
    try {
      const ops = selected.operationRows.map((r) => {
        const op = operations.find((o) => String(o.id) === String(r.operation_id));
        const isFinish = op?.category === 'FINISH';
        return {
          operation_id: parseInt(r.operation_id, 10),
          sewer_id: r.sewer_id ? parseInt(r.sewer_id, 10) : undefined,
          planned_quantity: parseInt(r.planned_quantity, 10),
          planned_date: String(r.planned_date).trim(),
          floor_id: r.floor_id ? parseInt(r.floor_id, 10) : undefined,
        };
      });
      await api.planning.assign({
        order_id: parseInt(selected.order_id, 10),
        building_floor_id: parseInt(selected.building_floor_id, 10),
        technologist_id: parseInt(selected.technologist_id, 10),
        operations: ops,
      });
      setSuccessMsg('Распределение сохранено');
      setTimeout(() => {
        setSuccessMsg('');
        navigate('/');
      }, 2000);
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const floorDisabled = !selected.order_id;
  const technologistDisabled = !selected.order_id;
  const operationsDisabled = !selected.technologist_id;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text mb-6">
        Распределение заказа
      </h1>

      {successMsg && (
        <div className="mb-4 p-4 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
          {errorMsg}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="max-w-4xl bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 p-6 space-y-6 transition-block"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Заказ</label>
            <select
              value={selected.order_id}
              onChange={(e) =>
                setSelected({
                  ...selected,
                  order_id: e.target.value,
                  building_floor_id: '',
                  technologist_id: '',
                })
              }
              className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
            >
              <option value="">Выберите заказ</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.id} — {o.title} ({o.OrderStatus?.name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Этаж</label>
            <select
              value={selected.building_floor_id}
              onChange={(e) =>
                setSelected({
                  ...selected,
                  building_floor_id: e.target.value,
                  technologist_id: '',
                })
              }
              disabled={floorDisabled}
              className={`w-full px-4 py-2 rounded-lg border text-[#ECECEC] dark:text-dark-text ${
                floorDisabled
                  ? 'bg-accent-2/60 dark:bg-dark-800 cursor-not-allowed opacity-60'
                  : 'bg-accent-2/80 dark:bg-dark-800 border-white/25 dark:border-white/25'
              }`}
            >
              <option value="">
                {floorDisabled ? 'Сначала выберите заказ' : 'Выберите этаж'}
              </option>
              {buildingFloors.slice(0, 4).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Технолог</label>
            <select
              value={selected.technologist_id}
              onChange={(e) => setSelected({ ...selected, technologist_id: e.target.value })}
              disabled={technologistDisabled}
              className={`w-full px-4 py-2 rounded-lg border text-[#ECECEC] dark:text-dark-text ${
                technologistDisabled
                  ? 'bg-accent-2/60 dark:bg-dark-800 cursor-not-allowed opacity-60'
                  : 'bg-accent-2/80 dark:bg-dark-800 border-white/25 dark:border-white/25'
              }`}
            >
              <option value="">
                {technologistDisabled ? 'Сначала выберите заказ' : 'Выберите технолога'}
              </option>
              {technologists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.User?.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="text-sm text-[#ECECEC] dark:text-dark-text/90">
              Операции {operationsDisabled && '(сначала выберите этаж и технолога)'}
            </label>
            <button
              type="button"
              onClick={addOperationRow}
              disabled={operationsDisabled}
              className={`text-sm px-3 py-1.5 rounded-lg ${
                operationsDisabled
                  ? 'bg-accent-1/50 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
            >
              + Добавить
            </button>
          </div>
          <div className="space-y-2">
            {selected.operationRows.map((row, idx) => (
              <div key={idx} className="flex gap-2 items-center flex-wrap">
                <select
                  value={row.operation_id}
                  onChange={(e) => updateRow(idx, 'operation_id', e.target.value)}
                  disabled={operationsDisabled}
                  className={`flex-1 min-w-[140px] px-3 py-2 rounded-lg text-sm ${
                    operationsDisabled ? 'opacity-60 cursor-not-allowed' : ''
                  } bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text`}
                >
                  <option value="">Операция</option>
                  {operations.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.name} ({op.norm_minutes} мин)
                    </option>
                  ))}
                </select>
                <select
                  value={row.sewer_id}
                  onChange={(e) => updateRow(idx, 'sewer_id', e.target.value)}
                  disabled={operationsDisabled || (operations.find((o) => String(o.id) === String(row.operation_id))?.category === 'FINISH')}
                  className={`flex-1 min-w-[120px] px-3 py-2 rounded-lg text-sm ${
                    operationsDisabled ? 'opacity-60 cursor-not-allowed' : ''
                  } bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text`}
                >
                  <option value="">{operations.find((o) => String(o.id) === String(row.operation_id))?.category === 'FINISH' ? '— (Финиш)' : 'Швея'}</option>
                  {sewers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.User?.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="Кол-во"
                  value={row.planned_quantity}
                  onChange={(e) => updateRow(idx, 'planned_quantity', e.target.value)}
                  disabled={operationsDisabled}
                  className={`w-20 px-3 py-2 rounded-lg text-sm ${
                    operationsDisabled ? 'opacity-60 cursor-not-allowed' : ''
                  } bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text`}
                />
                <input
                  type="date"
                  value={row.planned_date}
                  onChange={(e) => updateRow(idx, 'planned_date', e.target.value)}
                  disabled={operationsDisabled}
                  className={`flex-1 min-w-[130px] px-3 py-2 rounded-lg text-sm ${
                    operationsDisabled ? 'opacity-60 cursor-not-allowed' : ''
                  } bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text`}
                />
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={selected.operationRows.length <= 1}
                  className="p-2 text-red-400 hover:bg-red-500/20 rounded disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || !isFormValid()}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Сохранение...' : 'Сохранить распределение'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40 dark:hover:bg-dark-3"
          >
            Отмена
          </button>
        </div>
      </form>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-accent-3 dark:bg-dark-900 rounded-xl p-6 max-w-md w-full mx-4 border border-white/25 dark:border-white/25">
            <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Подтверждение
            </h2>
            <p className="text-[#ECECEC]/90 dark:text-dark-text/80 mb-6">
              Сохранить распределение заказа? Текущее распределение будет полностью заменено.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
