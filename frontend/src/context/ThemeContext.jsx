/**
 * Контекст темы (светлая / тёмная)
 * Сохраняет выбор в localStorage
 */

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {}, toggleTheme: () => {} });

const STORAGE_KEY = 'app-theme';

function getInitialTheme() {
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  const setTheme = (value) => {
    const next = 'dark';
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  const toggleTheme = () => {
    setThemeState('dark');
    try {
      localStorage.setItem(STORAGE_KEY, 'dark');
    } catch {}
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
