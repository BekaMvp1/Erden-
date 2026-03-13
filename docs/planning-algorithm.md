# Алгоритм планирования

## Расчёт по мощности (POST /api/planning/calc-capacity)

1. **Остаток** = total_quantity заказа − actual_total (уже выполнено).
2. **Мощность:**
   - Если задана `capacity_week` (напр. 1800): `total_capacity = capacity_week × (дней / 7)`, `daily_capacity = capacity_week / 7`.
   - Иначе: мощность из БД (сумма sewers.capacity_per_day по этажу).
3. **Предложенный план:** концентрировать остаток в первые дни, не более daily_capacity в день.

Пример: мощность 1800/неделю, выбрано 4 дня → total_capacity = 1800 × (4/7) ≈ 1028, daily ≈ 257.

## План на день (GET /api/planning/day)

1. Получить список швей (с учётом этажа для технолога).
2. Для каждой швеи:
   - Взять `capacity_per_day` или значение из `production_calendar` на дату.
   - Посчитать плановую нагрузку: сумма `planned_quantity * norm_minutes` по всем `order_operations` с `planned_date = date` и `sewer_id = sewer.id`.
   - Перегруз = `max(0, planned_load - capacity)`.

## План на неделю (GET /api/planning/week)

1. Параметры: `from`, `to` (даты).
2. Получить все `order_operations` в диапазоне дат для швей текущего этажа (или всех для admin/manager).
3. Сгруппировать по дате.

## План на месяц (GET /api/planning/month)

1. Параметр: `month` (YYYY-MM).
2. Определить `from` и `to` (первый и последний день месяца).
3. Для каждой швеи:
   - `total_capacity` = `capacity_per_day * количество рабочих дней`.
   - `total_planned` = сумма `planned_quantity * norm_minutes` по операциям в диапазоне.

## Формулы

- **Время операции** = `planned_quantity * norm_minutes` (из справочника operations).
- **Мощность швеи** = `capacity_per_day` (минуты).
- **Перегруз** = `planned_load - capacity` (если > 0).
