-- Добавить технолога вручную через БД
-- Technologist = users (id, name) + technologists (user_id, floor_id)

-- Вариант 1: Через Node.js (рекомендуется)
-- cd backend && node scripts/add-technologist.js
-- Настройте name, email, password, floor_id в scripts/add-technologist.js

-- Вариант 2: Чистый SQL
-- 1) Сгенерируйте password_hash:
--    node -e "require('bcryptjs').hash('password123',10).then(h=>console.log(h))"

-- 2) Создайте пользователя (подставьте свой password_hash)
INSERT INTO users (name, email, password_hash, role, floor_id, is_active, created_at, updated_at)
VALUES (
  'Имя Технолога',
  'tech@factory.local',
  '$2a$10$...',  -- результат из шага 1
  'technologist',
  1,             -- floor_id (1–4)
  true,
  NOW(),
  NOW()
);

-- 3) Создайте запись технолога (user_id = id из users)
INSERT INTO technologists (user_id, floor_id, created_at, updated_at)
SELECT id, 1, NOW(), NOW()
FROM users WHERE email = 'tech@factory.local';
