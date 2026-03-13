/**
 * Контекст печати: заголовок, подзаголовок, дата
 * Страницы вызывают setPrintHeader для шапки при печати
 */

import { createContext, useContext, useEffect, useRef } from 'react';

const PrintContext = createContext(null);

export function PrintProvider({ children }) {
  const headerRef = useRef({ title: '', subtitle: '' });

  const setPrintHeader = (title, subtitle = '') => {
    headerRef.current = { title: title || '', subtitle: subtitle || '' };
  };

  useEffect(() => {
    const updateDate = () => {
      const el = document.getElementById('print-date');
      if (el) {
        const d = new Date();
        el.textContent = `Дата печати: ${d.toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}`;
      }
      const titleEl = document.getElementById('print-title-text');
      const subEl = document.getElementById('print-subtitle-text');
      const { title, subtitle } = headerRef.current;
      if (titleEl) titleEl.textContent = title;
      if (subEl) {
        subEl.textContent = subtitle;
        subEl.style.display = subtitle ? 'block' : 'none';
      }
    };

    const onBeforePrint = () => updateDate();
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, []);

  return (
    <PrintContext.Provider value={{ setPrintHeader }}>
      {children}
    </PrintContext.Provider>
  );
}

export function usePrintHeader(title, subtitle) {
  const ctx = useContext(PrintContext);
  useEffect(() => {
    if (ctx?.setPrintHeader && title) {
      ctx.setPrintHeader(title, subtitle || '');
    }
    return () => {
      if (ctx?.setPrintHeader) ctx.setPrintHeader('', '');
    };
  }, [ctx, title, subtitle]);
}
