# Схема базы данных

## Обзор

Система использует PostgreSQL. Все таблицы создаются через миграции Sequelize (без `sync()`).

## Таблицы

### floors (Этажи)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| name | VARCHAR(100) | Название этажа |

### order_status (Статусы заказов)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| name | VARCHAR(50) | Название (Принят, В работе, Готов, Просрочен) |

### users (Пользователи)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| name | VARCHAR(255) | Имя |
| email | VARCHAR(255) UNIQUE | Email для входа |
| password_hash | VARCHAR(255) | Хеш пароля (bcrypt) |
| role | ENUM | admin, manager, technologist, operator |
| floor_id | INTEGER FK | Ссылка на этаж (опционально) |
| is_active | BOOLEAN | Активен ли пользователь |

### clients (Клиенты)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| name | VARCHAR(255) | Название |

### technologists (Технологи)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| user_id | INTEGER FK UNIQUE | Ссылка на users |
| floor_id | INTEGER FK | Этаж |

### sewers (Швеи)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| user_id | INTEGER FK UNIQUE | Ссылка на users |
| technologist_id | INTEGER FK | Технолог |
| capacity_per_day | INTEGER | Мощность в минутах/день |

### orders (Заказы)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| client_id | INTEGER FK | Клиент |
| title | VARCHAR(255) | Название заказа |
| quantity | INTEGER | Количество изделий |
| deadline | DATE | Дедлайн |
| status_id | INTEGER FK | Статус |
| floor_id | INTEGER FK | Этаж (после распределения) |
| technologist_id | INTEGER FK | Технолог (после распределения) |

### operations (Операции / НОПА)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| name | VARCHAR(255) | Название операции |
| norm_minutes | DECIMAL(10,2) | Норма времени на единицу (мин) |

### order_operations (Операции заказа)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| order_id | INTEGER FK | Заказ |
| operation_id | INTEGER FK | Операция |
| sewer_id | INTEGER FK | Швея |
| planned_quantity | INTEGER | Запланированное количество |
| actual_quantity | INTEGER | Фактическое количество |
| planned_date | DATE | Запланированная дата |

### production_calendar (Производственный календарь)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| date | DATE | Дата |
| sewer_id | INTEGER FK | Швея |
| capacity | INTEGER | Мощность (мин) |
| load | INTEGER | Загрузка (мин) |

### audit_logs (Журнал аудита)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Идентификатор |
| user_id | INTEGER FK | Пользователь |
| action | VARCHAR(100) | Действие |
| entity | VARCHAR(100) | Сущность |
| entity_id | INTEGER | ID сущности |
| created_at | TIMESTAMP | Время |

## Связи

- Floor → User (1:N)
- Floor → Technologist (1:N)
- User → Technologist (1:1)
- Technologist → Sewer (1:N)
- User → Sewer (1:1)
- Client → Order (1:N)
- OrderStatus → Order (1:N)
- Order → OrderOperation (1:N)
- Operation → OrderOperation (1:N)
- Sewer → OrderOperation (1:N)
- Sewer → ProductionCalendar (1:N)
- User → AuditLog (1:N)
