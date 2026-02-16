/**
 * Страница настроек
 * Выбор шрифта, добавление технологов (admin/manager), удаление всех заказов (admin)
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFont } from '../context/FontContext';
import { api } from '../api';

export default function Settings() {
  const { user } = useAuth();
  const { fontId, setFontId, fonts } = useFont();
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [floors, setFloors] = useState([]);
  const [buildingFloors, setBuildingFloors] = useState([]);
  const [technologists, setTechnologists] = useState([]);
  const [newTechnologist, setNewTechnologist] = useState({ name: '', email: '', password: '', floor_id: '', building_floor_id: '' });
  const [addingTechnologist, setAddingTechnologist] = useState(false);

  useEffect(() => {
    api.references.floors().then(setFloors).catch(() => setFloors([]));
    api.references.buildingFloors().then(setBuildingFloors).catch(() => setBuildingFloors([]));
    api.references.technologists().then(setTechnologists).catch(() => setTechnologists([]));
  }, []);

  const handleDeleteAll = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.settings.deleteAllOrders();
      setSuccessMsg(res.message || 'Все заказы удалены');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка удаления');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddTechnologist = async (e) => {
    e.preventDefault();
    const { name, email, password, floor_id } = newTechnologist;
    if (!name?.trim() || !email?.trim() || !password || !floor_id || !building_floor_id) {
      setErrorMsg('Заполните все поля: ФИО, email, пароль, цех пошива, этаж');
      return;
    }
    setAddingTechnologist(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.references.addTechnologist({ name: name.trim(), email: email.trim(), password, floor_id, building_floor_id });
      setSuccessMsg('Технолог добавлен');
      setTimeout(() => setSuccessMsg(''), 3000);
      setNewTechnologist({ name: '', email: '', password: '', floor_id: '', building_floor_id: '' });
      const list = await api.references.technologists();
      setTechnologists(list);
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка добавления');
    } finally {
      setAddingTechnologist(false);
    }
  };

  const isAdmin = user?.role === 'admin';
  const canManageTechnologists = ['admin', 'manager'].includes(user?.role);

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text mb-6">Настройки</h1>

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

      <div className="space-y-8 max-w-2xl">
        {/* Шрифт */}
        <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 p-6 transition-block">
          <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
            Шрифт интерфейса
          </h2>
          <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-4">
            Выберите один из 5 шрифтов для отображения текста в приложении.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fonts.map((font) => (
              <button
                key={font.id}
                type="button"
                onClick={() => setFontId(font.id)}
                className={`px-4 py-3 rounded-lg border text-left transition-colors ${
                  fontId === font.id
                    ? 'bg-primary-600/30 border-primary-500 text-[#ECECEC] dark:text-dark-text'
                    : 'bg-accent-2/50 dark:bg-dark-800 border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/20 dark:hover:bg-dark-2'
                }`}
                style={font.id !== 'system' ? { fontFamily: font.value } : {}}
              >
                {font.name}
              </button>
            ))}
          </div>
        </div>

        {/* Добавление технолога (admin/manager) */}
        {canManageTechnologists && (
          <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 p-6 transition-block">
            <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Добавить технолога
            </h2>
            <form onSubmit={handleAddTechnologist} className="flex flex-wrap gap-2 items-end mb-4">
              <input
                type="text"
                value={newTechnologist.name}
                onChange={(e) => setNewTechnologist({ ...newTechnologist, name: e.target.value })}
                placeholder="ФИО"
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
              />
              <input
                type="email"
                value={newTechnologist.email}
                onChange={(e) => setNewTechnologist({ ...newTechnologist, email: e.target.value })}
                placeholder="Email"
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[160px]"
              />
              <input
                type="password"
                value={newTechnologist.password}
                onChange={(e) => setNewTechnologist({ ...newTechnologist, password: e.target.value })}
                placeholder="Пароль (мин. 6)"
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[120px]"
              />
              <select
                value={newTechnologist.floor_id}
                onChange={(e) => setNewTechnologist({ ...newTechnologist, floor_id: e.target.value })}
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
              >
                <option value="">Цех пошива</option>
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <select
                value={newTechnologist.building_floor_id}
                onChange={(e) => setNewTechnologist({ ...newTechnologist, building_floor_id: e.target.value })}
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
              >
                <option value="">Этаж</option>
                {buildingFloors.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={addingTechnologist || !newTechnologist.name?.trim() || !newTechnologist.email?.trim() || !newTechnologist.password || newTechnologist.password.length < 6 || !newTechnologist.floor_id || !newTechnologist.building_floor_id}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {addingTechnologist ? 'Добавление...' : 'Добавить'}
              </button>
            </form>
            {technologists.length > 0 && (
              <div className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80">
                <span className="font-medium">Технологи:</span>{' '}
                {technologists.map((t) => t.User?.name || t.name || `ID ${t.id}`).join(', ')}
              </div>
            )}
          </div>
        )}

        {/* Удаление (только admin) */}
        {isAdmin && (
          <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-red-500/30 p-6">
            <h2 className="text-lg font-semibold text-red-400 mb-4">Опасная зона</h2>
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-4">
              Удалить все заказы из системы. Операция необратима. Справочники (клиенты, этажи, операции и т.д.) не удаляются.
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-red-500/30 text-red-400 hover:bg-red-500/40 font-medium disabled:opacity-50"
            >
              {deleting ? 'Удаление...' : 'Удалить все заказы'}
            </button>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-accent-3 dark:bg-dark-900 rounded-xl p-6 max-w-md w-full mx-4 border border-red-500/30">
            <h2 className="text-lg font-semibold text-red-400 mb-4">Подтверждение</h2>
            <p className="text-[#ECECEC]/90 dark:text-dark-text/80 mb-6">
              Вы уверены, что хотите удалить все заказы? Это действие нельзя отменить.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                className="px-4 py-2 rounded-lg bg-red-500/80 text-white font-medium hover:bg-red-500"
              >
                Удалить всё
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
