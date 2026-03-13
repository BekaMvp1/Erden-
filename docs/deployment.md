# Развёртывание

## Архитектура

- **Frontend** → Netlify (статика)
- **Backend** → Render / VPS (Node.js)
- **База данных** → PostgreSQL (Supabase, Render, Railway или собственный)

## Переменные окружения

### Backend (.env)

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=длинный-секретный-ключ
JWT_EXPIRES_IN=24h
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://your-app.netlify.app
```

### Frontend (Netlify)

- `VITE_API_URL` — URL backend API **только https://** (например `https://api.example.com`). Иначе Mixed Content.

## Backend (Render / VPS)

1. Установить Node.js 18+.
2. Клонировать репозиторий, перейти в `backend/`.
3. `npm install --production`
4. Выполнить миграции: `npx sequelize-cli db:migrate`
5. Выполнить сидер: `npx sequelize-cli db:seed:all`
6. Запуск: `npm start` или через PM2/systemd.

## Frontend (Netlify)

1. Build command: `cd frontend && npm install && npm run build`
2. Publish directory: `frontend/dist`
3. Переменная `VITE_API_URL` — URL backend.

## База данных

- Создать БД PostgreSQL.
- Указать `DATABASE_URL` в backend.
- Для production рекомендуется SSL: `?sslmode=require`.

## CORS и безопасность

- Backend: `FRONTEND_URL` — URL фронтенда (только https://) для CORS allowlist.
- Netlify: принудительный HTTPS redirect, security headers (HSTS, X-Content-Type-Options и др.).
- Проверка: DevTools → Console (нет Mixed Content), иконка замочка в адресной строке.
