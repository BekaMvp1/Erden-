/**
 * Страница входа
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
    <div className="min-h-screen flex items-center justify-center bg-accent-2 dark:bg-dark-950 relative">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40 dark:hover:bg-dark-3 transition-colors"
        title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      >
        {theme === 'dark' ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        )}
      </button>
      <div className="w-full max-w-sm p-8 bg-accent-3/90 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 shadow-xl animate-page-enter">
        <h1 className="text-2xl font-bold text-center text-primary-400 mb-6">
          Швейная фабрика
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text focus:border-primary-500 focus:outline-none"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text focus:border-primary-500 focus:outline-none"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        <p className="mt-4 text-xs text-[#ECECEC]/80 dark:text-dark-text/80 text-center">
          Демо: admin@factory.local / admin123
        </p>
      </div>
    </div>
  );
}
