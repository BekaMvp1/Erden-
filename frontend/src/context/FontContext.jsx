/**
 * Контекст выбора шрифта приложения
 */

import { createContext, useContext, useState, useEffect } from 'react';

const STORAGE_KEY = 'app-font';
const FONTS = [
  { id: 'system', name: 'Системный', value: 'system-ui, -apple-system, sans-serif' },
  { id: 'inter', name: 'Inter', value: '"Inter", system-ui, sans-serif' },
  { id: 'roboto', name: 'Roboto', value: '"Roboto", system-ui, sans-serif' },
  { id: 'open-sans', name: 'Open Sans', value: '"Open Sans", system-ui, sans-serif' },
  { id: 'pt-sans', name: 'PT Sans', value: '"PT Sans", system-ui, sans-serif' },
];

const FontContext = createContext(null);

export function FontProvider({ children }) {
  const [fontId, setFontIdState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {
      return 'system';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, fontId);
    } catch {}
    const font = FONTS.find((f) => f.id === fontId);
    const fontFamily = font?.value || FONTS[0].value;
    document.documentElement.style.setProperty('--app-font', fontFamily);
  }, [fontId]);

  const setFontId = (id) => {
    if (FONTS.some((f) => f.id === id)) {
      setFontIdState(id);
    }
  };

  return (
    <FontContext.Provider value={{ fontId, setFontId, fonts: FONTS }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont() {
  const ctx = useContext(FontContext);
  if (!ctx) throw new Error('useFont must be used within FontProvider');
  return ctx;
}
