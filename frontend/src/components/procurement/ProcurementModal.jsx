/**
 * Модалка организации закупа в карточке заказа
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api';
import { NeonButton, NeonInput, NeonSelect } from '../ui';

const UNIT_OPTIONS = ['рулон', 'кг', 'тонн', 'метр', 'шт'];

function makeEmptyRow(seed) {
  return {
    _localId: `new-${seed}-${Math.random().toString(36).slice(2, 8)}`,
    material_name: '',
    qty: '',
    unit: 'рулон',
    price: '',
    sum: 0,
    supplier: '',
    comment: '',
  };
}

export default function ProcurementModal({ open, orderId, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
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
          ...item,
          qty: String(item.qty ?? ''),
          price: String(item.price ?? ''),
          sum: Number(item.sum || 0),
          supplier: item.supplier || '',
          comment: item.comment || '',
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
    (tzCode && modelName ? `${tzCode} — ${modelName}` : '') ||
    data?.order?.title ||
    tzCode ||
    modelName ||
    '';
  const totalOrderQty = data?.order?.total_quantity || 0;
  const materialsTotalQty = useMemo(
    () => rows.reduce((acc, row) => acc + (Number(row.qty) || 0), 0),
    [rows]
  );
  const totalSum = useMemo(
    () => rows.reduce((acc, row) => acc + (Number(row.sum) || 0), 0),
    [rows]
  );

  const updateRow = (localId, patch) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row._localId !== localId) return row;
        const next = { ...row, ...patch };
        const qty = Number(next.qty) || 0;
        const price = Number(next.price) || 0;
        next.sum = Number((qty * price).toFixed(2));
        return next;
      })
    );
  };

  const addRow = () => setRows((prev) => [...prev, makeEmptyRow(prev.length + 1)]);
  const removeRow = (localId) => setRows((prev) => prev.filter((row) => row._localId !== localId));

  const validate = () => {
    const nextErrors = {};
    rows.forEach((row, idx) => {
      const hasAny =
        String(row.material_name || '').trim() ||
        String(row.qty || '').trim() ||
        String(row.price || '').trim() ||
        String(row.supplier || '').trim() ||
        String(row.comment || '').trim();
      if (!hasAny) return;

      if (!String(row.material_name || '').trim()) nextErrors[`${idx}-material_name`] = true;
      if (!(Number(row.qty) > 0)) nextErrors[`${idx}-qty`] = true;
      if (!(Number(row.price) >= 0)) nextErrors[`${idx}-price`] = true;
      if (!UNIT_OPTIONS.includes(String(row.unit || '').toLowerCase())) nextErrors[`${idx}-unit`] = true;
    });
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async (targetStatus) => {
    setError('');
    if (!validate()) {
      setError('Проверьте обязательные поля в таблице материалов');
      return;
    }
    setSaving(targetStatus);
    try {
      const items = rows
        .filter((row) => String(row.material_name || '').trim())
        .map((row) => ({
          material_name: String(row.material_name || '').trim(),
          qty: Number(row.qty || 0),
          unit: String(row.unit || '').toLowerCase(),
          price: Number(row.price || 0),
          supplier: row.supplier ? String(row.supplier).trim() : '',
          comment: row.comment ? String(row.comment).trim() : '',
        }));

      const res = await api.orders.updateProcurement(orderId, {
        due_date: dueDate || null,
        status: targetStatus,
        items,
      });
      setData(res);
      onSaved?.(res);
    } catch (err) {
      setError(err.message || 'Ошибка сохранения закупа');
    } finally {
      setSaving('');
    }
  };

  if (!open) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/60 z-50 overflow-hidden" onClick={onClose}>
      <div
        className="card-neon rounded-card fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,72rem)] h-[min(88vh,880px)] p-5 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-[#ECECEC]">Организация закупки</h2>
            <p className="text-sm text-[#ECECEC]/70">
              Заказ: {orderTitle || data?.order?.title || '—'}
            </p>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg bg-accent-2/40 p-3">
                <div className="text-xs text-[#ECECEC]/70">Клиент</div>
                <div className="text-sm text-[#ECECEC]">{data?.order?.client_name || '—'}</div>
              </div>
              <div className="rounded-lg bg-accent-2/40 p-3">
                <div className="text-xs text-[#ECECEC]/70">План заказа (шт)</div>
                <div className="text-sm text-[#ECECEC]">{totalOrderQty}</div>
              </div>
              <div className="rounded-lg bg-accent-2/40 p-3">
                <div className="text-xs text-[#ECECEC]/70">Итого материалов (qty)</div>
                <div className="text-sm text-[#ECECEC]">{materialsTotalQty}</div>
              </div>
              <div>
                <label className="block text-xs text-[#ECECEC]/70 mb-1">Дедлайн закупа</label>
                <NeonInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/20">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="bg-accent-3/80 border-b border-white/20">
                    <th className="text-left px-3 py-2">Материал</th>
                    <th className="text-left px-3 py-2">Количество</th>
                    <th className="text-left px-3 py-2">Ед.</th>
                    <th className="text-left px-3 py-2">Цена</th>
                    <th className="text-left px-3 py-2">Сумма</th>
                    <th className="text-left px-3 py-2">Поставщик</th>
                    <th className="text-left px-3 py-2">Комментарий</th>
                    <th className="text-left px-3 py-2"> </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row._localId} className="border-b border-white/10">
                      <td className="px-3 py-2">
                        <NeonInput
                          value={row.material_name}
                          onChange={(e) => updateRow(row._localId, { material_name: e.target.value })}
                          className={fieldErrors[`${idx}-material_name`] ? 'ring-1 ring-red-500' : ''}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NeonInput
                          type="number"
                          step="0.001"
                          min="0"
                          value={row.qty}
                          onChange={(e) => updateRow(row._localId, { qty: e.target.value })}
                          className={fieldErrors[`${idx}-qty`] ? 'ring-1 ring-red-500' : ''}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NeonSelect
                          value={row.unit}
                          onChange={(e) => updateRow(row._localId, { unit: e.target.value })}
                          className={fieldErrors[`${idx}-unit`] ? 'ring-1 ring-red-500' : ''}
                        >
                          {UNIT_OPTIONS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </NeonSelect>
                      </td>
                      <td className="px-3 py-2">
                        <NeonInput
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.price}
                          onChange={(e) => updateRow(row._localId, { price: e.target.value })}
                          className={fieldErrors[`${idx}-price`] ? 'ring-1 ring-red-500' : ''}
                        />
                      </td>
                      <td className="px-3 py-2 text-[#ECECEC] font-medium">{Number(row.sum || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <NeonInput
                          value={row.supplier}
                          onChange={(e) => updateRow(row._localId, { supplier: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NeonInput
                          value={row.comment}
                          onChange={(e) => updateRow(row._localId, { comment: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => removeRow(row._localId)}
                          title="Удалить строку"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap justify-between items-center mt-4 gap-3">
              <button type="button" onClick={addRow} className="px-3 py-2 rounded-lg bg-accent-1/30 text-[#ECECEC]">
                + Добавить строку
              </button>
              <div className="text-sm text-[#ECECEC]">
                Итого сумма: <span className="font-semibold text-primary-400">{totalSum.toFixed(2)} ₽</span>
              </div>
            </div>

            {error && <div className="mt-3 p-2 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>}

            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 justify-end shrink-0">
          <NeonButton onClick={() => submit('draft')} disabled={!!saving || loading}>
            {saving === 'draft' ? 'Сохранение...' : 'Сохранить черновик'}
          </NeonButton>
          <NeonButton onClick={() => submit('sent')} variant="secondary" disabled={!!saving || loading}>
            {saving === 'sent' ? 'Отправка...' : 'Отправить на закупку'}
          </NeonButton>
          <NeonButton onClick={() => submit('received')} variant="secondary" disabled={!!saving || loading}>
            {saving === 'received' ? 'Сохранение...' : 'Получено'}
          </NeonButton>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
