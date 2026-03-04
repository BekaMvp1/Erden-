/**
 * Страница склада.
 * Только остатки по размерам и партиям (модель, размер, партия, остаток).
 * Данные формируются автоматически после ОТК; ручной ввод отключён.
 */

import { useState, useEffect } from 'react';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { NeonCard } from '../components/ui';

export default function Warehouse() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.warehouseStock
      .stock()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const modelName = (row) =>
    row.Order?.model_name || row.Order?.title || `#${row.order_id}`;
  const sizeName = (row) =>
    row.ModelSize?.Size?.name || `#${row.model_size_id}`;
  const batchCode = (row) => row.batch_code ?? row.batch ?? '—';

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-neon-text">Склад</h1>
        <PrintButton />
      </div>
      <p className="text-sm text-neon-muted mb-4">
        Остатки по партиям, размерам и моделям. Пополнение склада только после проведения ОТК по партии (ручной приход/расход отключён).
      </p>

      <NeonCard className="print-area rounded-card overflow-hidden p-0">
        <h1 className="print-title print-only">Склад — остатки</h1>
        {loading ? (
          <div className="p-8 text-center text-neon-muted">Загрузка...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-neon-muted">Нет остатков на складе</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-accent-3/80 border-b border-white/25">
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Партия</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Модель</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Размер</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-neon-text">Остаток</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.id} className="border-b border-white/15">
                    <td className="px-4 py-3 text-neon-text">{batchCode(row)}</td>
                    <td className="px-4 py-3 text-neon-text">{modelName(row)}</td>
                    <td className="px-4 py-3 text-neon-text">{sizeName(row)}</td>
                    <td className="px-4 py-3 text-right font-medium">{row.qty ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </NeonCard>
    </div>
  );
}
