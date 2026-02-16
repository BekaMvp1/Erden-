/**
 * Задачи по операциям (по этажам)
 * Этаж 1 — финиш (ОТК, упаковка и т.д.)
 * Этажи 2–4 — раскрой и пошив
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';

const FLOORS = [
  { id: 1, name: 'Финиш / ОТК' },
  { id: 2, name: 'Производство 2' },
  { id: 3, name: 'Производство 3' },
  { id: 4, name: 'Производство 4' },
];

function EditVariantsModal({ task, onClose, onSave }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const variants = task.OrderOperationVariants || [];
    setRows(variants.map((v) => ({
      color: v.color,
      size: v.size,
      planned_qty: v.planned_qty || 0,
      actual_qty: v.actual_qty ?? v.planned_qty ?? 0,
    })));
  }, [task]);

  const handleChange = (index, value) => {
    const n = parseInt(value, 10);
    setRows((r) =>
      r.map((row, i) => (i === index ? { ...row, actual_qty: isNaN(n) ? 0 : n } : row))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.orderOperations.updateVariants(task.id, rows);
      onSave?.();
      onClose();
    } catch (err) {
      alert(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const allDone = rows.every((r) => (r.actual_qty || 0) >= (r.planned_qty || 0));
  const hasOver = rows.some((r) => (r.actual_qty || 0) > (r.planned_qty || 0));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-accent-3 dark:bg-dark-900 rounded-xl border border-white/25 p-4 sm:p-6 max-w-3xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
          Редактировать по факту — #{task.order_id} {task.Order?.title}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="overflow-x-auto -mx-1 mb-4">
            <table className="w-full text-sm table-fixed min-w-[280px]">
              <thead>
                <tr className="bg-accent-2/50 dark:bg-dark-800">
                  <th className="text-left px-4 py-2.5 font-medium">Цвет</th>
                  <th className="text-left px-4 py-2.5 font-medium">Размер</th>
                  <th className="text-left px-4 py-2.5 font-medium">Кол-во план</th>
                  <th className="text-left px-4 py-2.5 font-medium">Кол-во факт</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const done = (r.actual_qty || 0) >= (r.planned_qty || 0);
                  const over = (r.actual_qty || 0) > (r.planned_qty || 0);
                  return (
                    <tr key={i} className={`border-t border-white/10 ${over ? 'bg-red-500/10' : done ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                      <td className="px-4 py-2.5">{r.color}</td>
                      <td className="px-4 py-2.5">{r.size}</td>
                      <td className="px-4 py-2.5">{r.planned_qty}</td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min="0"
                          value={r.actual_qty}
                          onChange={(e) => handleChange(i, e.target.value)}
                          className="w-full min-w-[4rem] px-3 py-1.5 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasOver && (
            <p className="text-red-400 text-sm mb-2">Факт не может превышать план. Исправьте значения.</p>
          )}
          <div className="flex gap-2 justify-end flex-wrap">
            <button
              type="submit"
              disabled={saving || hasOver}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text">
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FloorTasks() {
  const navigate = useNavigate();
  const [floorId, setFloorId] = useState(2);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModalTask, setEditModalTask] = useState(null);
  const [completingId, setCompletingId] = useState(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState(() => new Set());

  const loadTasks = () => {
    setLoading(true);
    api.orderOperations
      .floorTasks(floorId)
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, [floorId]);

  const [statusChangingId, setStatusChangingId] = useState(null);

  const handleComplete = async (task) => {
    setCompletingId(task.id);
    try {
      await api.orderOperations.complete(task.id);
      loadTasks();
    } catch (err) {
      alert(err.message || 'Ошибка завершения');
    } finally {
      setCompletingId(null);
    }
  };

  const toggleTaskExpand = (taskId) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleStatusChange = async (task, newStatus) => {
    setStatusChangingId(task.id);
    try {
      await api.orderOperations.updateStatus(task.id, newStatus);
      loadTasks();
    } catch (err) {
      alert(err.message || 'Ошибка смены статуса');
    } finally {
      setStatusChangingId(null);
    }
  };

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canEdit = ['admin', 'manager', 'technologist'].includes(user.role);
  const canEditAsOperator = user.role === 'operator'; // только свои операции

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Задачи по операциям</h1>
        {tasks.length > 0 && <PrintButton />}
      </div>

      <div className="no-print flex flex-wrap gap-2 mb-4">
        {FLOORS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFloorId(f.id)}
            className={`px-4 py-2 rounded-lg ${
              floorId === f.id ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="print-area rounded-xl border border-white/25 dark:border-white/25 overflow-hidden overflow-x-auto">
        <h1 className="print-title print-only">
          Задачи по операциям — {FLOORS.find((f) => f.id === floorId)?.name || 'Этаж'}
        </h1>
        {loading ? (
          <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-[#ECECEC]/80 dark:text-dark-text/80">Нет задач на этом этаже</div>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Заказ</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Операция</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Ответственный</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">По факту</th>
                {canEdit && <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Действия</th>}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const variants = task.OrderOperationVariants || [];
                const allVariantsDone = variants.length === 0 || variants.every((v) => (v.actual_qty || 0) >= (v.planned_qty || 0));
                const isComplete = task.status === 'Готово';
                const responsible = task.Order?.Technologist?.User?.name || task.responsible_user_id || '—';
                const canStart = task.canStart !== false;
                const canComplete = task.canComplete !== false;
                const blockReason = task.blockReason || '';
                const editDisabled = !canStart || !canComplete;
                const completeDisabled = !canComplete || !allVariantsDone || variants.length === 0;
                const isExpanded = expandedTaskIds.has(task.id);
                const planSum = variants.reduce((s, v) => s + (v.planned_qty || 0), 0);
                const factSum = variants.reduce((s, v) => s + (v.actual_qty || 0), 0);

                return (
                  <React.Fragment key={task.id}>
                    <tr className="border-b border-white/10 dark:border-white/10">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleTaskExpand(task.id)}
                            className="p-1 rounded hover:bg-accent-2/50 dark:hover:bg-dark-800 text-[#ECECEC]/80 dark:text-dark-text/80 transition-transform duration-200"
                            title={isExpanded ? 'Свернуть' : 'Развернуть детали'}
                          >
                            <svg
                              className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <div>
                            <button
                              onClick={() => navigate(`/orders/${task.order_id}`)}
                              className="text-primary-500 hover:underline text-left"
                            >
                              #{task.order_id} {task.Order?.title}
                            </button>
                            <div className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80">{task.Order?.Client?.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.Operation?.name}</td>
                      <td className="px-4 py-3 align-top">
                        {isComplete ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                            {task.status || 'Готово'}
                          </span>
                        ) : task.status === 'В работе' ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                            В работе
                          </span>
                        ) : (canEdit || canEditAsOperator) && canStart ? (
                          <button
                            onClick={() => handleStatusChange(task, 'В работе')}
                            disabled={statusChangingId === task.id}
                            className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                          >
                            {statusChangingId === task.id ? '...' : 'Ожидает → Начать'}
                          </button>
                        ) : (
                          <span title={blockReason} className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400 cursor-help">
                            Ожидает
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{responsible}</td>
                      <td className="px-4 py-3 align-top">
                        {variants.length > 0 && (
                          isExpanded && (canEdit || canEditAsOperator) ? (
                            <button
                              onClick={() => setEditModalTask(task)}
                              disabled={editDisabled}
                              title={editDisabled ? blockReason || 'Дождитесь завершения предыдущих этапов' : ''}
                              className={`min-w-[180px] px-2.5 py-1 text-sm rounded-lg ${editDisabled ? 'bg-accent-2/50 cursor-not-allowed opacity-60' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
                            >
                              {isComplete ? 'Редактировать по факту' : 'Завершить по факту'}
                            </button>
                          ) : !isExpanded ? (
                            <div className="text-sm text-[#ECECEC]/90 dark:text-dark-text/90">
                              <span>План: {planSum}</span>
                              <span className="mx-2">|</span>
                              <span>Факт: {factSum}</span>
                            </div>
                          ) : (
                            <span className="text-[#ECECEC]/80">—</span>
                          )
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 align-top">
                          {!isComplete && variants.length > 0 && (
                            <button
                              onClick={() => handleComplete(task)}
                              disabled={completeDisabled || completingId === task.id}
                              title={completeDisabled && blockReason ? blockReason : completeDisabled && !allVariantsDone ? 'Заполните факт по всем строкам' : ''}
                              className={`px-2.5 py-1 text-sm rounded-lg ${completeDisabled ? 'bg-accent-2/50 cursor-not-allowed opacity-60' : 'bg-green-600 text-white hover:bg-green-700'} disabled:opacity-50`}
                            >
                              {completingId === task.id ? '...' : 'Завершить операцию'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    <tr className="border-b border-white/15 dark:border-white/15 bg-accent-2/20 dark:bg-dark-900/50">
                      <td colSpan={canEdit ? 6 : 5} className="px-4 py-0 overflow-hidden">
                        <div
                          className="grid transition-[grid-template-rows] duration-300 ease-out"
                          style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div className="px-4 py-2">
                              <div className="w-full max-w-[560px]">
                                <table className="w-full text-sm border border-white/15 dark:border-white/15 rounded overflow-hidden table-fixed">
                                  <thead>
                                    <tr className="bg-accent-2/50 dark:bg-dark-800">
                                      <th className="text-left px-4 py-1.5 font-medium">Цвет</th>
                                      <th className="text-left px-4 py-1.5 font-medium">Размер</th>
                                      <th className="text-left px-4 py-1.5 font-medium">Кол-во план</th>
                                      <th className="text-left px-4 py-1.5 font-medium">Кол-во факт</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {variants.length === 0 ? (
                                      <tr><td colSpan={4} className="px-4 py-1.5 text-[#ECECEC]/60">Нет детализации</td></tr>
                                    ) : variants.map((v, i) => {
                                      const done = (v.actual_qty || 0) >= (v.planned_qty || 0);
                                      const over = (v.actual_qty || 0) > (v.planned_qty || 0);
                                      return (
                                        <tr key={i} className={`border-t border-white/10 ${over ? 'bg-red-500/10' : done ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                                          <td className="px-4 py-1">{v.color}</td>
                                          <td className="px-4 py-1">{v.size}</td>
                                          <td className="px-4 py-1">{v.planned_qty}</td>
                                          <td className="px-4 py-1">{isComplete ? v.actual_qty : '—'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editModalTask && (
        <EditVariantsModal
          task={editModalTask}
          onClose={() => setEditModalTask(null)}
          onSave={loadTasks}
        />
      )}
    </div>
  );
}
