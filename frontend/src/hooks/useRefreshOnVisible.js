/**
 * Хук: при возврате пользователя в приложение (вкладку) вызывается callback.
 * Используется для автообновления данных на всех устройствах — когда админ создаёт
 * клиента/заказ, остальные увидят изменения при возврате в приложение.
 */
import { useEffect } from 'react';

export function useRefreshOnVisible(onVisible) {
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && typeof onVisible === 'function') {
        onVisible();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [onVisible]);
}
