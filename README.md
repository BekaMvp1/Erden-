# Система управления швейной фабрикой

Полноценная система для управления заказами, распределением, планированием и отчётами швейной фабрики.

## Технологии

- **Backend:** Node.js, Express, Sequelize, PostgreSQL, JWT (RBAC)
- **Frontend:** React, Vite, Tailwind CSS

## Быстрый старт

### 1. База данных

Создайте PostgreSQL и укажите URL в `backend/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/sewing_factory
JWT_SECRET=your-secret-key
PORT=3001
```

### 2. Backend

```bash
cd backend
npm install
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Вход

- URL: http://localhost:5173
- Логин: `admin@factory.local`
- Пароль: `admin123`

## Структура проекта

```
├── backend/           # API сервер
│   ├── src/
│   │   ├── migrations/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── ...
├── frontend/          # React SPA
├── docs/              # Документация
```

## Документация

- [Схема БД](docs/database-schema.md)
- [Производственная логика](docs/production-logic.md)
- [Алгоритм планирования](docs/planning-algorithm.md)
- [Отчёты](docs/reports.md)
- [Развёртывание](docs/deployment.md)
