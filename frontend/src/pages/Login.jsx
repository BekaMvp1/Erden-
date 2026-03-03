/**
 * Страница входа
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { NeonButton, NeonCard, NeonInput } from '../components/ui';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
if (!import.meta.env.DEV && !import.meta.env.VITE_API_URL) {
  console.error('VITE_API_URL is not defined');
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Прогрев бэкенда (Render free tier засыпает, первый запрос может таймаутиться)
  useEffect(() => {
    if (API_URL) {
      fetch(`${API_URL}/health`, { mode: 'cors' }).catch(() => {});
      fetch(API_URL.replace(/\/$/, ''), { mode: 'cors' }).catch(() => {});
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.auth.login(email, password);
      login(data);
      navigate('/');
    } catch (err) {
      // Повтор при cold start (Failed to fetch = таймаут/сеть)
      if (err.message === 'Failed to fetch' && API_URL) {
        try {
          await new Promise((r) => setTimeout(r, 3000));
          const data = await api.auth.login(email, password);
          login(data);
          navigate('/');
          return;
        } catch (retryErr) {
          setError(retryErr.message || 'Сервер не отвечает. Подождите и попробуйте снова.');
        }
      } else {
        let msg = err.message || 'Ошибка входа';
        if (err.details) msg += '\n\nПодробности: ' + err.details;
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent px-4">
      <NeonCard className="w-full max-w-sm p-8 animate-page-enter">
        <h1 className="text-3xl font-bold text-center text-neon-text mb-1">
          Швейная фабрика
        </h1>
        <p className="text-center text-sm text-neon-muted mb-6">Neon Dark Dashboard</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-btn bg-red-500/15 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm text-neon-muted mb-1">Email</label>
            <NeonInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm text-neon-muted mb-1">Пароль</label>
            <NeonInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <NeonButton
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Вход...' : 'Войти'}
          </NeonButton>
        </form>
        <p className="mt-4 text-xs text-neon-muted text-center">
          Демо: admin@factory.local / admin123
        </p>
      </NeonCard>
    </div>
  );
}
