/**
 * Основной layout: Topbar + Sidebar + контент + ИИ-ассистент
 */

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';
import AIAssistant from './AIAssistant';
import DashboardSummary from './DashboardSummary';

const ROLE_LABELS = {
  admin: 'Администратор',
  manager: 'Менеджер',
  technologist: 'Технолог',
  operator: 'Швея',
};

const NAV_ICONS = {
  orders: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  create: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  assign: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  planning: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  reports: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  finance: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  references: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  procurement: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  cutting: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm-6.364 0a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243z" />
    </svg>
  ),
  floorTasks: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  warehouse: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  dispatcher: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
};

const CUTTING_DEFAULT = ['Аксы', 'Аутсорс', 'Наш цех'];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [cuttingTypes, setCuttingTypes] = useState([]);
  const [cuttingOpen, setCuttingOpen] = useState(false);
  // На мобильном меню открыто по умолчанию — сразу видно навигацию
  const [mobileMenuOpen, setMobileMenuOpen] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );

  const isReferences = location.pathname === '/references';
  const isCutting = location.pathname.startsWith('/cutting');
  // Аксы и Аутсорс — по умолчанию; остальные — из справочника (без дублей)
  const cuttingMenuItems = [
    ...CUTTING_DEFAULT,
    ...cuttingTypes.filter((t) => !CUTTING_DEFAULT.includes(t.name)).map((t) => t.name),
  ];

  useEffect(() => {
    if (user?.role !== 'operator') {
      api.references.cuttingTypes().then(setCuttingTypes).catch(() => setCuttingTypes([]));
    }
  }, [user?.role]);

  useEffect(() => {
    if (!isReferences) {
      setSummaryLoading(true);
      api.dashboard
        .summary()
        .then((d) => {
          setSummary(d);
          setSummaryLoading(false);
        })
        .catch(() => {
          setSummary(null);
          setSummaryLoading(false);
        });
    }
  }, [isReferences]);

  const navItems = [
    { to: '/', label: 'Заказы', icon: 'orders', end: true },
    ...(user?.role !== 'operator' ? [{ to: '/orders/create', label: 'Создать заказ', icon: 'create' }] : []),
    ...(user?.role !== 'operator' ? [{ to: '/procurement', label: 'Закуп', icon: 'procurement' }] : []),
    ...(user?.role !== 'operator' ? [{ to: '/cutting', label: 'Раскрой', icon: 'cutting', dropdown: cuttingMenuItems }] : []),
    { to: '/floor-tasks', label: 'Задачи по этажам', icon: 'floorTasks' },
    ...(user?.role !== 'operator' ? [{ to: '/warehouse', label: 'Склад', icon: 'warehouse' }] : []),
    ...(user?.role !== 'operator' ? [{ to: '/planning/assign', label: 'Распределение', icon: 'assign' }] : []),
    ...(user?.role !== 'operator' ? [{ to: '/planning', label: 'Планирование', icon: 'planning', end: true }] : []),
    ...(user?.role !== 'operator' ? [{ to: '/reports', label: 'Отчёты', icon: 'reports' }] : []),
    ...(user?.role !== 'operator' ? [{ to: '/dispatcher', label: 'Планировщик', icon: 'dispatcher' }] : []),
    ...(user?.role !== 'operator' ? [{ to: '/finance', label: 'Финансы', icon: 'finance' }] : []),
    { to: '/references', label: 'Справочники', icon: 'references' },
    { to: '/settings', label: 'Настройки', icon: 'settings' },
  ];

  return (
    <div className="flex h-screen bg-accent-2 dark:bg-dark-950 overflow-hidden">
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — скрыт на мобильном, выезжает по кнопке */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-50 w-64 md:w-56 bg-accent-3 dark:bg-dark-900 sidebar-header-border flex flex-col transform transition-transform duration-200 ease-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="header-top flex items-center p-4">
          <h1 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text">Швейная фабрика</h1>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, label, icon, end, dropdown }) =>
            dropdown ? (
              <div key={to} className="relative">
                <button
                  onClick={() => setCuttingOpen(!cuttingOpen)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-300 ease-out ${
                    isCutting
                      ? 'bg-primary-600 text-white'
                      : 'text-[#ECECEC]/90 dark:text-dark-text/80 hover:bg-accent-1/30 dark:hover:bg-dark-2 hover:text-[#ECECEC] dark:hover:text-dark-text'
                  }`}
                >
                  {NAV_ICONS[icon]}
                  {label}
                  <svg className={`w-4 h-4 ml-auto transition-transform ${cuttingOpen ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {cuttingOpen && (
                  <div className="mt-1 ml-4 pl-2 border-l border-white/20 dark:border-white/20 space-y-0.5">
                    {dropdown.map((type) => (
                      <NavLink
                        key={type}
                        to={`/cutting/${encodeURIComponent(type)}`}
                        onClick={() => { setCuttingOpen(false); setMobileMenuOpen(false); }}
                        className={({ isActive }) =>
                          `block px-3 py-1.5 rounded text-sm ${
                            isActive
                              ? 'bg-primary-600/80 text-white'
                              : 'text-[#ECECEC]/80 dark:text-dark-text/70 hover:bg-accent-1/20 dark:hover:bg-dark-2'
                          }`
                        }
                      >
                        {type}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-300 ease-out ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-[#ECECEC]/90 dark:text-dark-text/80 hover:bg-accent-1/30 dark:hover:bg-dark-2 hover:text-[#ECECEC] dark:hover:text-dark-text'
                  }`
                }
              >
                {NAV_ICONS[icon]}
                {label}
              </NavLink>
            )
          )}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="header-top bg-accent-3 dark:bg-dark-900 flex items-center justify-between px-3 md:px-6 gap-2">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg md:hidden hover:bg-accent-1/30 dark:hover:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
            aria-label="Меню"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 hover:bg-accent-1/40 dark:hover:bg-dark-3 text-[#ECECEC] dark:text-dark-text transition-colors duration-300 ease-out"
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>
            <span className="text-xs md:text-sm text-[#ECECEC] dark:text-dark-text/90 truncate max-w-[120px] md:max-w-none">
              {user?.name}
              {user?.role && (ROLE_LABELS[user.role] || user.role) !== user?.name && (
                <span className="hidden sm:inline"> • {ROLE_LABELS[user.role] || user.role}</span>
              )}
            </span>
            <button
              onClick={logout}
              className="px-2 md:px-3 py-1.5 text-xs md:text-sm rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40 dark:hover:bg-dark-3 transition-colors duration-300 ease-out"
            >
              Выход
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 bg-accent-2 dark:bg-dark-950">
          {!isReferences && (
            <DashboardSummary data={summary} loading={summaryLoading} />
          )}
          <div key={location.pathname} className="animate-page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Правая панель — ИИ Ассистент (скрыта на мобильном) */}
      <div className="hidden lg:flex lg:flex-col lg:min-h-0 bg-accent-3 dark:bg-dark-900">
        <AIAssistant />
      </div>
    </div>
  );
}
