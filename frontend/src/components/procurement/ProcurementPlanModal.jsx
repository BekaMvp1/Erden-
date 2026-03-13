/**
 * Модалка «План закупа» — только для редактирования плана (материал + план + ед.)
 * Открывается из карточки заказа (OrderDetails). План вводится ТОЛЬКО здесь.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api';
import { NeonButton, NeonInput, NeonSelect } from '../ui';

const UNIT_OPTIONS = ['шт', 'метр', 'кг', 'тонн', 'рулон'];

function makeEmptyRow(seed) {
  return {
    _localId: `new-${seed}-${Math.random().toString(36).slice(2, 8)}`,
    material_name: '',
    planned_qty: '',
    unit: 'шт',
  };
}

export default function ProcurementPlanModal({ open, orderId, onClose, onSaved, canEdit = true }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [rows, setRows] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open || !orderId) return;
    setLoading(true);
    setError('');
    api.orders
      .getProcurement(orderId)
      .then((res) => {
        setData(res);
        setDueDate(res.procurement?.due_date || '');
        const prepared = (res.items || []).map((item) => ({
          _localId: `db-${item.id}`,
          id: item.id,
          material_name: item.material_name || '',
          planned_qty: String(item.planned_qty ?? ''),
          unit: String(item.unit || 'шт').toLowerCase(),
        }));
        const withEmpties = [...prepared];
        while (withEmpties.length < 3) withEmpties.push(makeEmptyRow(withEmpties.length + 1));
        setRows(withEmpties);
      })
      .catch((err) => setError(err.message || 'Ошибка загрузки закупа'))
      .finally(() => setLoading(false));
  }, [open, orderId]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const tzCode = String(data?.order?.tz_code || '').trim();
  const modelName = String(data?.order?.model_name || '').trim();
  const orderTitle =
    (tzCode && modelName ? `${tzCode} — ${modelName}` : '') || data?.order?.title || tzCode || modelName || '';
  const status = data?.procurement?.status || 'draft';
  const isReceived = status === 'received';
  const hasProcurement = !!data?.procurement?.id;
  const canDelete = hasProcurement && !isReceived;

  const updateRow = (localId, patch) => {
    setRows((prev) =>
      prev.map((row) => (row._localId !== localId ? row : { ...row, ...patch }))
    );
  };

  const addRow = () => setRows((prev) => [...prev, makeEmptyRow(prev.length + 1)]);
  const removeRow = (localId) => setRows((prev) => prev.filter((row) => row._localId !== localId));

  const validate = () => {
    const nextErrors = {};
    rows.forEach((row, idx) => {
      const hasAny = String(row.material_name || '').trim() || String(row.planned_qty || '').trim();
      if (!hasAny) return;
      if (!String(row.material_name || '').trim()) nextErrors[`${idx}-material_name`] = true;
      if (!(Number(row.planned_qty) > 0)) nextErrors[`${idx}-planned_qty`] = true;
      if (!UNIT_OPTIONS.includes(String(row.unit || '').toLowerCase())) nextErrors[`${idx}-unit`] = true;
    });
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleDelete = async () => {
    if (!window.confirm('Удалить закуп целиком и начать заново?')) return;
    setError('');
    setSaving(true);
    try {
      await api.orders.deleteProcurement(orderId);
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Ошибка удаления закупа');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setError('');
    if (!validate()) {
      setError('Заполните материал, план (> 0) и единицы для всех строк');
      return;
    }
    setSaving(true);
    try {
      const items = rows
        .filter((row) => String(row.material_name || '').trim())
        .map((row) => ({
          id: row.id,
          material_name: String(row.material_name || '').trim(),
          planned_qty: Number(row.planned_qty || 0),
          unit: String(row.unit || 'шт').toLowerCase(),
        }));
      const res = await api.orders.saveProcurementPlan(orderId, { due_date: dueDate || null, items });
      setData(res);
      onSaved?.(res);
    } catch (err) {
      setError(err.message || 'Ошибка сохранения плана закупа');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-hidden" onClick={onClose}>
      <div
        className="card-neon rounded-card w-[min(96vw,72rem)] max-h-[90vh] p-5 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-[#ECECEC]">План закупа</h2>
            <p className="text-sm text-[#ECECEC]/70">Заказ: {orderTitle || data?.order?.title || '—'}</p>
          </div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg bg-accent-1/30 text-[#ECECEC]">
            Закрыть
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto pr-1">
          {loading ? (
            <div className="py-8 text-center text-[#ECECEC]/70">Загрузка...</div>
          ) : (
            <>
              {isReceived && (
                <div className="mb-4 p-3 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400">
                  Закуп выполнен
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg bg-accent-2/40 p-3">
                  <div className="text-xs text-[#ECECEC]/70">Клиент</div>
                  <div className="text-sm text-[#ECECEC]">{data?.order?.client_name || '—'}</div>
                </div>
                <div className="rounded-lg bg-accent-2/40 p-3">
                  <div className="text-xs text-[#ECECEC]/70">Общий объём</div>
                  <div className="text-sm text-[#ECECEC]">{data?.order?.total_quantity ?? 0}</div>
                </div>
                <div>
                  <label className="block text-xs text-[#ECECEC]/70 mb-1">Дедлайн закупа</label>
                  <NeonInput
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/20">
                <table className="w-full min-w-[400px] text-sm">
                  <thead>
                    <tr className="bg-accent-3/80 border-b border-white/20">
                      <th className="text-left px-3 py-2">Материал</th>
                      <th className="text-left px-3 py-2">План</th>
                      <th className="text-left px-3 py-2">Ед. изм.</th>
                      {canEdit && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={row._localId} className="border-b border-white/10">
                        <td className="px-3 py-2">
                          <NeonInput
                            value={row.material_name}
                            onChange={(e) => updateRow(row._localId, { material_name: e.target.value })}
                            disabled={!canEdit}
                            className={fieldErrors[`${idx}-material_name`] ? 'ring-1 ring-red-500' : ''}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NeonInput
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.planned_qty}
                            onChange={(e) => updateRow(row._localId, { planned_qty: e.target.value })}
                            disabled={!canEdit}
                            className={fieldErrors[`${idx}-planned_qty`] ? 'ring-1 ring-red-500' : ''}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NeonSelect
                            value={row.unit}
                            onChange={(e) => updateRow(row._localId, { unit: e.target.value })}
                            disabled={!canEdit}
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </NeonSelect>
                        </td>
                        {canEdit && (
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => removeRow(row._localId)}
                              title="Удалить строку"
                            >
                              x
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={addRow}
                  className="mt-4 px-3 py-2 rounded-lg bg-accent-1/30 text-[#ECECEC]"
                >
                  + Добавить строку
                </button>
              )}

              {error && (
                <div className="mt-3 p-2 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
              )}
            </>
          )}
        </div>

        {!loading && canEdit && !isReceived && (
          <div className="mt-4 flex justify-between shrink-0">
            <div>
              {canDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400"
                >
                  {saving ? '...' : 'Удалить закуп'}
                </button>
              )}
            </div>
            <NeonButton onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить план'}
            </NeonButton>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
