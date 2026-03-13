# Отчёты

## Доступные отчёты

### Дневной (GET /api/reports/daily?date=YYYY-MM-DD)

- Список операций на указанную дату.
- Включает: заказ, операцию, швею, плановое количество.
- Фильтрация по этажу для технолога.

### Недельный (GET /api/reports/weekly?from=&to=)

- Операции в диапазоне дат.
- Суммарный план и факт в минутах.
- `plan` = сумма `planned_quantity * norm_minutes`.
- `fact` = сумма `actual_quantity * norm_minutes`.

### Месячный (GET /api/reports/monthly?month=YYYY-MM)

- Аналогично недельному, но за весь месяц.
- Возвращает `plan` и `fact` в минутах.

### План vs Факт (GET /api/reports/plan-fact?from=&to=)

- Группировка по этажам.
- Для каждого этажа: `plan` и `fact` в минутах.

## Формулы

- **План (мин)** = Σ (`planned_quantity` × `norm_minutes`) по операциям.
- **Факт (мин)** = Σ (`actual_quantity` × `norm_minutes`) по операциям.
