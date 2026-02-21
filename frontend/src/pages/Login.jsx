/**
 * Страница входа
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';

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
    <div className="min-h-screen flex items-center justify-center bg-[#656D3F] dark:bg-[#003161] relative">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg bg-black/20 text-[#FDEB9E] hover:bg-black/30 transition-colors"
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
      <div className="w-full max-w-sm p-8 bg-[#492828]/90 dark:bg-[#000B58] rounded-xl border border-white/30 shadow-xl animate-page-enter">
        <h1 className="text-2xl font-bold text-center text-[#FDEB9E] mb-6">
          Швейная фабрика
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm text-[#FDEB9E]/90 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-black/20 border border-white/30 text-[#FDEB9E] placeholder-white/40 focus:border-[#40c9c5] focus:outline-none"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm text-[#FDEB9E]/90 mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-black/20 border border-white/30 text-[#FDEB9E] placeholder-white/40 focus:border-[#40c9c5] focus:outline-none"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#006A67] text-[#FDEB9E] font-medium hover:bg-[#00807c] disabled:opacity-50"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        <p className="mt-4 text-xs text-[#FDEB9E]/80 text-center">
          Демо: admin@factory.local / admin123
        </p>
      </div>
    </div>
  );
}
