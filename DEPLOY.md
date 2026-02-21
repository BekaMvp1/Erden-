# Деплой (Render + Netlify + PostgreSQL)

## Render (Backend)

- **Build Command:** `npm ci` (или `npm install`)
- **Start Command:** `npx sequelize-cli db:migrate && npm start`
- **Root Directory:** `backend` (если монорепо — укажите в настройках Render)

### Переменные окружения (Render)

| Переменная      | Описание                                      |
|-----------------|-----------------------------------------------|
| `DATABASE_URL`  | PostgreSQL connection string (обязательно)    |
| `JWT_SECRET`    | Секретный ключ JWT (обязательно)              |
| `JWT_EXPIRES_IN`| Срок действия токена (по умолчанию 24h)       |
| `NODE_ENV`      | `production`                                  |
| `FRONTEND_URL`  | URL фронтенда **только https://** (например https://erdenbrand.com или https://xxx.netlify.app) для CORS |

---

## Netlify (Frontend)

- **Build command:** `cd frontend && npm ci && npm run build` (или из `frontend/netlify.toml`)
- **Publish directory:** `frontend/dist` (при base=пусто) или `dist` (при base=`frontend`)
- **Base directory:** `frontend` (если репозиторий — корень монорепо)

### SPA fallback (404 на маршрутах /dispatcher, /login и т.д.)

Редиректы заданы в `frontend/netlify.toml`:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Проверка после `npm run build`:**
- Vite создаёт `frontend/dist/` с `index.html` и `assets/`
- В Netlify **Publish directory** должен указывать на `dist` (при base=`frontend`) или `frontend/dist` (при base=пусто)
- Если используется `public/_redirects` вместо netlify.toml — после сборки файл `dist/_redirects` должен существовать

### Переменные окружения (Netlify)

| Переменная      | Описание                                      |
|-----------------|-----------------------------------------------|
| `VITE_API_URL`  | URL backend API **только https://** (обязательно, например https://your-app.onrender.com) |

---

## База данных (PostgreSQL)

- Supabase, Render Postgres, Railway или любой managed PostgreSQL.
- Указать `DATABASE_URL` в Render.
- SSL поддерживается автоматически в production.

---

## Перенос данных: локальная БД → облачная (Netlify)

Если заказы и клиенты есть в локальной БД, но на Netlify они пустые — нужно скопировать данные:

1. **Скопируйте строку подключения** из облачной БД (Neon, Supabase, Render):
   - Neon: Dashboard → Connection string
   - Supabase: Settings → Database → Connection string
   - Render: PostgreSQL → Internal Database URL

2. **Запустите скрипт** (в папке `backend`):
   ```bash
   cd backend
   set CLOUD_DATABASE_URL=postgresql://user:password@host/database?sslmode=require
   node scripts/export-to-cloud.js
   ```
   (PowerShell: `$env:CLOUD_DATABASE_URL="postgresql://..."`)

3. Или создайте файл `.env.cloud`:
   ```
   CLOUD_DATABASE_URL=postgresql://user:password@host/database?sslmode=require
   ```
   И запустите:
   ```bash
   node -r dotenv/config scripts/export-to-cloud.js dotenv_config_path=.env.cloud
   ```

4. После успешного выполнения — клиенты и заказы появятся на Netlify.

---

## Локальный запуск

### Backend

```bash
cd backend
cp .env.example .env
# Заполнить DATABASE_URL, JWT_SECRET в .env
npm install
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

В dev режиме API запросы идут на тот же origin (proxy) или на `VITE_API_URL`, если задан.

---

## Чек-лист безопасности (HTTPS / Mixed Content)

- [ ] `VITE_API_URL` в Netlify — **только https://** (например https://your-app.onrender.com)
- [ ] `FRONTEND_URL` в Render — **только https://** (например https://erdenbrand.com или https://xxx.netlify.app)
- [ ] DevTools → Console: нет ошибок "Mixed Content" (http на https-странице)
- [ ] DevTools → Security: страница помечена как Secure
- [ ] DevTools → Network: все запросы к API идут по https://
- [ ] Иконка замочка в адресной строке браузера — закрытый (HTTPS)

---

## Analytics & Assistant API

### Analytics (read-only)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/analytics/overdue` | Просроченные заказы |
| GET | `/api/analytics/bottlenecks` | Узкие места по этапам |
| GET | `/api/analytics/workers` | Производительность операторов |
| GET | `/api/analytics/order/:id/timeline` | Таймлайн заказа (события) |

Требуется авторизация (admin, manager, technologist, operator).

#### Query params

**GET /api/analytics/overdue**
- `client` — ID или имя клиента
- `days` — N дней вперёд (deadline ≤ now + N), по умолчанию 0
- `status` — фильтр по статусу (по умолчанию исключается «Готов»)

**GET /api/analytics/bottlenecks**
- `days` — анализ за последние N дней
- `step` — фильтр по step_code (cut, sew, qc, pack и т.д.)

**GET /api/analytics/workers**
- `days` — период в днях (по умолчанию 7)
- `step` — фильтр по step_code

**GET /api/analytics/order/:id/timeline**
- Без параметров

### Assistant (rule-based MVP)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/assistant/query` | Вопрос помощнику. Body: `{ "question": "..." }` |

#### Распознавание типа
- «просроч» → overdue
- «узк» / «очередь» → bottlenecks
- «оператор» / «производительн» → workers
- «таймлайн» / «история» → timeline

#### Извлечение фильтров из текста
- «за N дней» → `days=N`
- «этап sew» / «по этапу крой» / «отк» → `step`
- «заказ 5» → `order_id=5`
- «клиент X» → `client`

Ответ: `{ type, filters_used, data, summary }`.

---

## Planner API

### Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/planner/priority` | Приоритеты активных заказов (priority_score, risk_level) |
| GET | `/api/planner/bottleneck-map` | Карта загрузки по этапам |
| GET | `/api/planner/recommendations` | Рекомендации (риски, перераспределение) |

Требуется авторизация (admin, manager, technologist, operator).

### Query params

**GET /api/planner/priority**
- `days=7` — период для очередей
- `limit=100` — макс. заказов

**GET /api/planner/bottleneck-map**
- `days=7` — период для avg_rate_per_hour

**GET /api/planner/recommendations**
- `days=7` — период анализа

### Примеры запросов

```
GET /api/planner/priority?days=7&limit=50
GET /api/planner/bottleneck-map?days=7
GET /api/planner/recommendations?days=7
```
