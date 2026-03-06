/**
 * Основной layout: Topbar + Sidebar + контент + ИИ-ассистент
 */

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrintHeader } from '../context/PrintContext';
import PrintDocHeader from './PrintDocHeader';
import { api } from '../api';
import DashboardSummary from './DashboardSummary';

const ROLE_LABELS = {
  admin: 'Администратор',
  manager: 'Менеджер',
  technologist: 'Технолог',
  operator: 'Швея',
};

const NAV_ICONS = {
  dashboard: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  board: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18M6 7v10m6-10v10m6-10v10" />
    </svg>
  ),
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
  qc: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  shipments: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  dispatcher: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  assistant: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 3 3-1 3-1m6-9a9 9 0 11-18 0 9 9 0 0118 0zm-4.5 0a4.5 4.5 0 10-9 0 4.5 4.5 0 009 0z" />
    </svg>
  ),
};

const CUTTING_DEFAULT = ['Аксы', 'Аутсорс', 'Наш цех'];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [cuttingTypes, setCuttingTypes] = useState([]);
  const [cuttingOpen, setCuttingOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  const isReferences = location.pathname === '/references';

  // Заголовок для печати по текущему маршруту
  const printTitles = {
    '/': 'Панель заказов',
    '/orders': 'Заказы',
    '/production-dashboard': 'Дашборд',
    '/board': 'Панель заказов',
    '/orders/create': 'Создать заказ',
    '/procurement': 'Закуп',
    '/planning': 'Планирование',
    '/sewing': 'Пошив',
    '/reports': 'Отчёты',
    '/finance': 'Финансы',
    '/warehouse': 'Склад',
    '/qc': 'ОТК',
    '/shipments': 'Отгрузка',
    '/cutting': 'Раскрой',
    '/references': 'Справочники',
    '/settings': 'Настройки',
    '/assistant': 'ИИ Ассистент',
  };
  const basePath = location.pathname.replace(/\/$/, '') || '/';
  const printTitle = printTitles[basePath] || printTitles[location.pathname] || (basePath.startsWith('/cutting') ? 'Раскрой' : basePath.startsWith('/orders/') ? 'Заказ' : 'Документ');
  usePrintHeader(printTitle, '');
  const isBoard = location.pathname === '/board';
  const isAssistant = location.pathname === '/assistant';
  const isCutting = location.pathname.startsWith('/cutting');
  const shouldShowSummary = !isReferences && !isBoard && !isAssistant;
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
    if (shouldShowSummary) {
      setSummaryLoading(true);
      setConnectionError(false);
      api.dashboard
        .summary()
        .then((d) => {
          setSummary(d);
          setSummaryLoading(false);
          setConnectionError(false);
        })
        .catch(() => {
          setSummary(null);
          setSummaryLoading(false);
          setConnectionError(true);
        });
    }
  }, [shouldShowSummary]);

  // Структура sidebar: Дашборд сверху, блок заказов, разделитель, производственный блок, разделитель, системный блок
  const dashboardItem = { type: 'item', to: '/production-dashboard', label: 'Дашборд', icon: 'dashboard' };
  const orderBlockItems =
    user?.role === 'operator'
      ? [
          { type: 'item', to: '/board', label: 'Панель заказов', icon: 'board' },
          { type: 'item', to: '/orders', label: 'Заказы', icon: 'orders', end: true },
        ]
      : [
          { type: 'item', to: '/board', label: 'Панель заказов', icon: 'board' },
          { type: 'item', to: '/orders', label: 'Заказы', icon: 'orders', end: true },
          { type: 'item', to: '/orders/create', label: 'Создать заказ', icon: 'create' },
          { type: 'item', to: '/planning', label: 'Планирование', icon: 'planning', end: true },
        ];
  // ОТК и производственный блок: admin, manager, technologist (не operator)
  const canSeeProduction = user?.role && ['admin', 'manager', 'technologist'].includes(user.role);
  const productionBlockItems = canSeeProduction
    ? [
        { type: 'item', to: '/procurement', label: 'Закуп', icon: 'procurement' },
        { type: 'item', to: '/cutting', label: 'Раскрой', icon: 'cutting', dropdown: cuttingMenuItems },
        { type: 'item', to: '/sewing', label: 'Пошив', icon: 'floorTasks' },
        { type: 'item', to: '/qc', label: 'ОТК', icon: 'qc' },
        { type: 'item', to: '/warehouse', label: 'Склад', icon: 'warehouse' },
        { type: 'item', to: '/shipments', label: 'Отгрузка', icon: 'shipments' },
      ]
    : [];
  const systemBlockItems = [
    ...(user?.role !== 'operator' ? [{ type: 'item', to: '/reports', label: 'Отчёты', icon: 'reports' }] : []),
    ...(user?.role !== 'operator' ? [{ type: 'item', to: '/finance', label: 'Финансы', icon: 'finance' }] : []),
    { type: 'item', to: '/assistant', label: 'ИИ Ассистент', icon: 'assistant' },
    { type: 'item', to: '/references', label: 'Справочники', icon: 'references' },
    { type: 'item', to: '/settings', label: 'Настройки', icon: 'settings' },
  ];

  const navStructure = [
    dashboardItem,
    { type: 'divider' },
    ...orderBlockItems,
    { type: 'divider' },
    { type: 'spacer' }, // отступ сверху производственного блока
    ...productionBlockItems,
    { type: 'spacer' }, // отступ снизу производственного блока
    { type: 'divider' },
    ...systemBlockItems,
  ];

  return (
    <div className="flex h-screen bg-neon-bg text-neon-text overflow-hidden">
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — на десктопе свёрнут (только иконки), при наведении раскрывается с текстами */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-50 bg-neon-bg2 sidebar-header-border flex flex-col transform transition-all duration-200 ease-out group/sidebar overflow-hidden
          w-64 md:w-16 md:hover:w-56
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="header-top flex items-center p-4 md:px-3 md:justify-center md:group-hover/sidebar:justify-start shrink-0">
          <h1 className="text-lg font-semibold text-neon-text truncate overflow-hidden whitespace-nowrap">
            <span className="md:hidden">Швейная фабрика</span>
            <span className="hidden md:inline md:group-hover/sidebar:hidden">ШФ</span>
            <span className="hidden md:group-hover/sidebar:inline">Швейная фабрика</span>
          </h1>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-x-hidden">
          {navStructure.map((entry, idx) => {
            if (entry.type === 'divider') {
              return <div key={`divider-${idx}`} className="border-t border-white/10 my-2" aria-hidden="true" />;
            }
            if (entry.type === 'spacer') {
              return <div key={`spacer-${idx}`} className="py-2" aria-hidden="true" />;
            }
            const { to, label, icon, end, dropdown } = entry;
            return dropdown ? (
              <div key={to} className="relative">
                <button
                  onClick={() => setCuttingOpen(!cuttingOpen)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-300 ease-out min-w-0 ${
                    isCutting
                      ? 'bg-primary-600 text-white'
                      : 'text-neon-text/85 hover:bg-white/5 hover:text-neon-text'
                  }`}
                >
                  <span className="flex-shrink-0">{NAV_ICONS[icon]}</span>
                  <span className="hidden md:group-hover/sidebar:inline truncate whitespace-nowrap">{label}</span>
                  <svg className={`w-4 h-4 ml-auto hidden md:group-hover/sidebar:block flex-shrink-0 transition-transform ${cuttingOpen ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {cuttingOpen && (
                  <div className="mt-1 ml-4 pl-2 border-l border-white/20 dark:border-white/20 space-y-0.5 block md:hidden md:group-hover/sidebar:block">
                    {dropdown.map((type) => (
                      <NavLink
                        key={type}
                        to={`/cutting/${encodeURIComponent(type)}`}
                        onClick={() => { setCuttingOpen(false); setMobileMenuOpen(false); }}
                        className={({ isActive }) =>
                          `block px-3 py-1.5 rounded text-sm truncate ${
                            isActive
                              ? 'bg-primary-600/80 text-white'
                              : 'text-neon-muted hover:bg-white/5'
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
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-300 ease-out min-w-0 ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-neon-text/85 hover:bg-white/5 hover:text-neon-text'
                  }`
                }
              >
                <span className="flex-shrink-0">{NAV_ICONS[icon]}</span>
                <span className="hidden md:group-hover/sidebar:inline truncate whitespace-nowrap">{label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="header-top bg-neon-surface flex items-center justify-between px-3 md:px-6 gap-2">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg md:hidden hover:bg-white/10 text-neon-text"
            aria-label="Меню"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            <span className="text-xs md:text-sm text-neon-text truncate max-w-[120px] md:max-w-none">
              {user?.name}
              {user?.role && (ROLE_LABELS[user.role] || user.role) !== user?.name && (
                <span className="hidden sm:inline"> • {ROLE_LABELS[user.role] || user.role}</span>
              )}
            </span>
            <button
              onClick={logout}
              className="btn-neon px-2 md:px-3 py-1.5 text-xs md:text-sm bg-neon-surface2 text-neon-text hover:shadow-neon"
            >
              Выход
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 bg-transparent relative">
          <PrintDocHeader />
          {connectionError && (
            <div className="no-print mb-4 p-4 rounded-xl bg-red-500/20 border border-red-500/50 text-red-400">
              <strong>Сервер не отвечает.</strong> Запустите backend: <code className="bg-black/20 px-1 rounded">cd backend && npm run dev</code>
            </div>
          )}
          {shouldShowSummary && (
            <div className="no-print">
              <DashboardSummary data={summary} loading={summaryLoading} />
            </div>
          )}
          <div key={location.pathname} className="animate-page-enter">
            <Outlet />
          </div>
        </main>
      </div>

    </div>
  );
}
