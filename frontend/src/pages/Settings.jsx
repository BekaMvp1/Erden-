/**
 * Страница настроек
 * Выбор шрифта, добавление технологов (admin/manager), удаление всех заказов (admin)
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useFont } from '../context/FontContext';
import { api } from '../api';
import { NeonButton, NeonCard, NeonInput, NeonSelect } from '../components/ui';
import PrintButton from '../components/PrintButton';

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
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-neon-text">Настройки</h1>
        <PrintButton />
      </div>

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
        <NeonCard className="p-6 transition-block">
          <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
            Шрифт интерфейса
          </h2>
          <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-4">
            Выберите один из 5 шрифтов для отображения текста в приложении.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fonts.map((font) => (
              <NeonButton
                key={font.id}
                type="button"
                onClick={() => setFontId(font.id)}
                variant={fontId === font.id ? 'primary' : 'secondary'}
                className={`px-4 py-3 text-left transition-colors ${
                  fontId === font.id
                    ? 'text-black'
                    : 'text-neon-text'
                }`}
                style={font.id !== 'system' ? { fontFamily: font.value } : {}}
              >
                {font.name}
              </NeonButton>
            ))}
          </div>
        </NeonCard>

        {/* Добавление технолога (admin/manager) */}
        {canManageTechnologists && (
          <NeonCard className="p-6 transition-block">
            <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Добавить технолога
            </h2>
            <form onSubmit={handleAddTechnologist} className="flex flex-wrap gap-2 items-end mb-4">
              <NeonInput
                type="text"
                value={newTechnologist.name}
                onChange={(e) => setNewTechnologist({ ...newTechnologist, name: e.target.value })}
                placeholder="ФИО"
                className="min-w-[140px]"
              />
              <NeonInput
                type="email"
                value={newTechnologist.email}
                onChange={(e) => setNewTechnologist({ ...newTechnologist, email: e.target.value })}
                placeholder="Email"
                className="min-w-[160px]"
              />
              <NeonInput
                type="password"
                value={newTechnologist.password}
                onChange={(e) => setNewTechnologist({ ...newTechnologist, password: e.target.value })}
                placeholder="Пароль (мин. 6)"
                className="min-w-[120px]"
              />
              <NeonSelect
                value={newTechnologist.floor_id}
                onChange={(e) => setNewTechnologist({ ...newTechnologist, floor_id: e.target.value })}
                className="min-w-[140px]"
              >
                <option value="">Цех пошива</option>
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </NeonSelect>
              <NeonSelect
                value={newTechnologist.building_floor_id}
                onChange={(e) => setNewTechnologist({ ...newTechnologist, building_floor_id: e.target.value })}
                className="min-w-[140px]"
              >
                <option value="">Этаж</option>
                {buildingFloors.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </NeonSelect>
              <NeonButton
                type="submit"
                disabled={addingTechnologist || !newTechnologist.name?.trim() || !newTechnologist.email?.trim() || !newTechnologist.password || newTechnologist.password.length < 6 || !newTechnologist.floor_id || !newTechnologist.building_floor_id}
              >
                {addingTechnologist ? 'Добавление...' : 'Добавить'}
              </NeonButton>
            </form>
            {technologists.length > 0 && (
              <div className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80">
                <span className="font-medium">Технологи:</span>{' '}
                {technologists.map((t) => t.User?.name || t.name || `ID ${t.id}`).join(', ')}
              </div>
            )}
          </NeonCard>
        )}

        {/* Удаление (только admin) */}
        {isAdmin && (
          <NeonCard className="p-6 border border-red-500/30">
            <h2 className="text-lg font-semibold text-red-400 mb-4">Опасная зона</h2>
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-4">
              Удалить все заказы из системы. Операция необратима. Справочники (клиенты, этажи, операции и т.д.) не удаляются.
            </p>
            <NeonButton
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              variant="secondary"
              className="text-red-400 border-red-500/40 hover:bg-red-500/20"
            >
              {deleting ? 'Удаление...' : 'Удалить все заказы'}
            </NeonButton>
          </NeonCard>
        )}
      </div>

      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-hidden">
          <div className="card-neon rounded-card p-6 max-w-md w-full border border-red-500/30">
            <h2 className="text-lg font-semibold text-red-400 mb-4">Подтверждение</h2>
            <p className="text-[#ECECEC]/90 dark:text-dark-text/80 mb-6">
              Вы уверены, что хотите удалить все заказы? Это действие нельзя отменить.
            </p>
            <div className="flex gap-3 justify-end">
              <NeonButton
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                variant="secondary"
              >
                Отмена
              </NeonButton>
              <NeonButton
                type="button"
                onClick={handleDeleteAll}
                className="bg-red-500/80 hover:bg-red-500 text-white"
              >
                Удалить всё
              </NeonButton>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
