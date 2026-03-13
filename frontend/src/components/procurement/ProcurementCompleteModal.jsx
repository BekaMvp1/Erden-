/**
 * Модалка завершения закупа — только Куплено + Цена (план read-only)
 * Открывается со страницы «Закуп». material_name, planned_qty, unit — только для отображения.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api';
import { NeonButton, NeonInput } from '../ui';

export default function ProcurementCompleteModal({ open, procurementId, onClose, onSaved, canEdit = true }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open || !procurementId) return;
    setLoading(true);
    setError('');
    api.procurement
      .getById(procurementId)
      .then((res) => {
        setData(res);
        setRows(
          (res.items || []).map((item) => ({
            id: item.id,
            material_name: item.material_name || '',
            planned_qty: item.planned_qty ?? '',
            unit: item.unit || 'шт',
            purchased_qty: String(item.purchased_qty ?? ''),
            purchased_price: String(item.purchased_price ?? ''),
            purchased_sum: Number(item.purchased_sum || 0),
          }))
        );
      })
      .catch((err) => setError(err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, procurementId]);

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

  const updateRow = (id, patch) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        const pqty = Number(next.purchased_qty) || 0;
        const pprice = Number(next.purchased_price) || 0;
        next.purchased_sum = Number((pqty * pprice).toFixed(2));
        return next;
      })
    );
  };

  const totalSum = useMemo(
    () => rows.reduce((acc, row) => acc + (Number(row.purchased_sum) || 0), 0),
    [rows]
  );

  const validate = () => {
    const nextErrors = {};
    rows.forEach((row, idx) => {
      if (!String(row.material_name || '').trim()) return;
      const pq = Number(row.purchased_qty);
      const pp = Number(row.purchased_price);
      if (!Number.isFinite(pq) || pq < 0 || !Number.isFinite(pp) || pp < 0) {
        nextErrors[`${idx}-purchased`] = true;
      }
    });
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleComplete = async () => {
    setError('');
    if (!validate()) {
      setError('Заполните «Куплено» и «Цена» по всем материалам');
      return;
    }
    setSaving(true);
    try {
      const items = rows.map((row) => ({
        id: row.id,
        purchased_qty: Number(row.purchased_qty) || 0,
        purchased_price: Number(row.purchased_price) || 0,
      }));
      await api.procurement.complete(procurementId, items);
      const res = await api.procurement.getById(procurementId);
      setData(res);
      onSaved?.(res);
    } catch (err) {
      setError(err.message || 'Ошибка завершения закупа');
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
            <h2 className="text-lg font-semibold text-[#ECECEC]">Закуп</h2>
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
                  ✅ Закуп завершён
                  {data?.procurement?.completed_at && (
                    <span className="ml-2 text-sm">
                      {new Date(data.procurement.completed_at).toLocaleString('ru-RU')}
                    </span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg bg-accent-2/40 p-3">
                  <div className="text-xs text-[#ECECEC]/70">Клиент</div>
                  <div className="text-sm text-[#ECECEC]">{data?.order?.client_name || '—'}</div>
                </div>
                <div className="rounded-lg bg-accent-2/40 p-3">
                  <div className="text-xs text-[#ECECEC]/70">Дедлайн</div>
                  <div className="text-sm text-[#ECECEC]">{data?.procurement?.due_date || '—'}</div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/20">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="bg-accent-3/80 border-b border-white/20">
                      <th className="text-left px-3 py-2">Материал</th>
                      <th className="text-left px-3 py-2">План</th>
                      <th className="text-left px-3 py-2">Ед.</th>
                      <th className="text-left px-3 py-2">Куплено</th>
                      <th className="text-left px-3 py-2">Цена</th>
                      <th className="text-left px-3 py-2">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={row.id} className="border-b border-white/10">
                        <td className="px-3 py-2 text-[#ECECEC]">{row.material_name || '—'}</td>
                        <td className="px-3 py-2 text-[#ECECEC]">{row.planned_qty ?? '—'}</td>
                        <td className="px-3 py-2 text-[#ECECEC]">{row.unit || '—'}</td>
                        <td className="px-3 py-2">
                          <NeonInput
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.purchased_qty}
                            onChange={(e) => updateRow(row.id, { purchased_qty: e.target.value })}
                            disabled={!canEdit || isReceived}
                            className={fieldErrors[`${idx}-purchased`] ? 'ring-1 ring-red-500' : ''}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NeonInput
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.purchased_price}
                            onChange={(e) => updateRow(row.id, { purchased_price: e.target.value })}
                            disabled={!canEdit || isReceived}
                            className={fieldErrors[`${idx}-purchased`] ? 'ring-1 ring-red-500' : ''}
                          />
                        </td>
                        <td className="px-3 py-2 text-[#ECECEC] font-medium">
                          {Number(row.purchased_sum || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-sm text-[#ECECEC] text-right">
                Итого: <span className="font-semibold text-primary-400">{totalSum.toFixed(2)} ₽</span>
              </div>

              {error && (
                <div className="mt-3 p-2 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
              )}
            </>
          )}
        </div>

        {!loading && canEdit && !isReceived && status === 'sent' && (
          <div className="mt-4 flex justify-end shrink-0">
            <NeonButton onClick={handleComplete} disabled={saving}>
              {saving ? 'Сохранение...' : 'Завершить закуп'}
            </NeonButton>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
