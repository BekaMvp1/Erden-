/**
 * Контроллер калькулятора параметров потока
 * POST /api/planning/flow/calc — расчёт такта, рабочих, рабочих мест, нормы выработки
 * и проверка мощности на период
 */

const { Op } = require('sequelize');
const db = require('../models');

/** Коэффициент f по типу изделия */
function getF(productType) {
  const map = { dress: 1.15, coat: 1.25, suit: 1.2, underwear: 1.15 };
  return map[productType] ?? 1.15;
}

/** Площадь S (м²) на рабочее место по типу изделия */
function getS(productType) {
  const map = { coat: 5.0, suit: 4.3, dress: 4.0, underwear: 4.0 };
  return map[productType] ?? 4.0;
}

/** Количество дней в периоде (inclusive) */
function getPeriodDays(from, to) {
  if (!from || !to) return 0;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff + 1);
}

/**
 * POST /api/planning/flow/calc
 */
async function calc(req, res) {
  try {
    const {
      workshop_id,
      floor_id,
      from,
      to,
      order_id,
      shift_hours = 8,
      product_type = 'dress',
      mode,
      Msm,
      Np,
      Kr,
      Su,
      T,
      M,
      operation_time_sec,
      planned_total_ui,
    } = req.body;

    const validModes = ['BY_SHIFT_CAPACITY', 'BY_WORKERS', 'BY_WORKPLACES', 'BY_AREA', 'BY_T_AND_M'];
    if (!mode || !validModes.includes(mode)) {
      return res.status(400).json({ error: 'Укажите режим расчёта (mode): ' + validModes.join(', ') });
    }

    const notes = [];
    const R_sec = (shift_hours || 8) * 3600;

    let t_sec = null;
    let Np_calc = null;
    let Kr_calc = null;
    const f_used = getF(product_type);
    const S_used = getS(product_type);

    // Режим 1: BY_SHIFT_CAPACITY — t_sec = R_sec / Msm
    if (mode === 'BY_SHIFT_CAPACITY') {
      const msm = parseFloat(Msm);
      if (!msm || msm <= 0) {
        return res.status(400).json({ error: 'Укажите мощность смены Mсм > 0' });
      }
      t_sec = R_sec / msm;
      notes.push(`Такт: t = R_сек / Mсм = ${R_sec} / ${msm} = ${t_sec.toFixed(2)} сек`);
    }

    // Режим 2: BY_WORKERS — t_sec = T / Np
    if (mode === 'BY_WORKERS') {
      const t = parseFloat(T);
      const np = parseFloat(Np);
      if (!t || t <= 0) return res.status(400).json({ error: 'Укажите трудоёмкость T (сек) > 0' });
      if (!np || np <= 0) return res.status(400).json({ error: 'Укажите число рабочих Np > 0' });
      t_sec = t / np;
      Np_calc = np;
      notes.push(`Такт: t = T / Np = ${t} / ${np} = ${t_sec.toFixed(2)} сек`);
    }

    // Режим 3: BY_WORKPLACES — Np_calc = Kr / f
    if (mode === 'BY_WORKPLACES') {
      const kr = parseFloat(Kr);
      if (!kr || kr <= 0) return res.status(400).json({ error: 'Укажите число рабочих мест Kr > 0' });
      Np_calc = kr / f_used;
      t_sec = null; // не вычисляется в этом режиме без T
      notes.push(`Рабочие: Np = Kr / f = ${kr} / ${f_used} = ${Np_calc.toFixed(2)}`);
    }

    // Режим 4: BY_AREA — Kr_calc = Su / S, Np_calc = Kr_calc / f
    if (mode === 'BY_AREA') {
      const su = parseFloat(Su);
      if (!su || su <= 0) return res.status(400).json({ error: 'Укажите площадь Su (м²) > 0' });
      Kr_calc = su / S_used;
      Np_calc = Kr_calc / f_used;
      t_sec = null;
      notes.push(`Рабочие места: Kr = Su / S = ${su} / ${S_used} = ${Kr_calc.toFixed(2)}`);
      notes.push(`Рабочие: Np = Kr / f = ${Kr_calc.toFixed(2)} / ${f_used} = ${Np_calc.toFixed(2)}`);
    }

    // Режим 5: BY_T_AND_M — Np_calc = (T * M) / R_sec
    if (mode === 'BY_T_AND_M') {
      const t = parseFloat(T);
      const m = parseFloat(M);
      if (!t || t <= 0) return res.status(400).json({ error: 'Укажите трудоёмкость T (сек) > 0' });
      if (!m || m <= 0) return res.status(400).json({ error: 'Укажите сменный выпуск M (ед/смена) > 0' });
      Np_calc = (t * m) / R_sec;
      t_sec = R_sec / m;
      notes.push(`Рабочие: Np = (T * M) / R_сек = (${t} * ${m}) / ${R_sec} = ${Np_calc.toFixed(2)}`);
      notes.push(`Такт: t = R_сек / M = ${R_sec} / ${m} = ${t_sec.toFixed(2)} сек`);
    }

    // Норма выработки Нв
    let Nv_per_shift = null;
    if (operation_time_sec != null && operation_time_sec > 0) {
      Nv_per_shift = R_sec / parseFloat(operation_time_sec);
      notes.push(`Норма выработки: Нв = R_сек / t_op = ${R_sec} / ${operation_time_sec} = ${Nv_per_shift.toFixed(2)} ед/смена`);
    }

    // Проверка мощности на период
    const period_days = getPeriodDays(from, to);
    let planned_total_in_period = 0;
    let capacity_total_in_period = 0;

    if (workshop_id && from && to) {
      // planned_total_in_period — из БД или UI
      if (order_id) {
        const workshop = await db.Workshop.findByPk(workshop_id);
        const filterByFloor = floor_id != null && floor_id !== '' && floor_id !== 'all';
        const floorIdNum = filterByFloor ? Number(floor_id) : null;

        let sql;
        const replacements = {
          orderId: Number(order_id),
          workshopId: Number(workshop_id),
          from,
          to,
        };
        if (workshop?.floors_count === 1) {
          sql = `SELECT COALESCE(SUM(planned_qty), 0)::int as total
                 FROM production_plan_day
                 WHERE order_id = :orderId AND workshop_id = :workshopId
                   AND date BETWEEN :from AND :to AND floor_id IS NULL`;
        } else if (filterByFloor) {
          sql = `SELECT COALESCE(SUM(planned_qty), 0)::int as total
                 FROM production_plan_day
                 WHERE order_id = :orderId AND workshop_id = :workshopId
                   AND date BETWEEN :from AND :to AND floor_id = :floorId`;
          replacements.floorId = floorIdNum;
        } else {
          sql = `SELECT COALESCE(SUM(planned_qty), 0)::int as total
                 FROM production_plan_day
                 WHERE order_id = :orderId AND workshop_id = :workshopId
                   AND date BETWEEN :from AND :to`;
        }
        const sumRows = await db.sequelize.query(sql, {
          replacements,
          type: db.sequelize.QueryTypes.SELECT,
        });
        planned_total_in_period = sumRows[0]?.total ?? 0;
      }
      if (planned_total_ui != null && planned_total_ui !== '' && planned_total_in_period === 0) {
        planned_total_in_period = parseInt(planned_total_ui, 10) || 0;
      }

      // capacity_total_in_period
      if (mode === 'BY_SHIFT_CAPACITY' && Msm && parseFloat(Msm) > 0) {
        capacity_total_in_period = parseFloat(Msm) * period_days;
        notes.push(`Мощность: Mсм * ${period_days} дней = ${capacity_total_in_period} ед`);
      } else if (mode === 'BY_T_AND_M' && t_sec && t_sec > 0) {
        const capacity_per_day = R_sec / t_sec;
        capacity_total_in_period = capacity_per_day * period_days;
        notes.push(`Мощность: (R_сек / t) * ${period_days} дней = ${capacity_total_in_period.toFixed(0)} ед`);
      } else {
        // Мощность из БД (sewers.capacity_per_day по этажу)
        let dailyCapacity = 200;
        const effectiveFloorId = floor_id && floor_id !== 'all' ? Number(floor_id) : null;
        if (effectiveFloorId) {
          const capRows = await db.sequelize.query(
            `SELECT COALESCE(SUM(s.capacity_per_day), 0)::int as daily_capacity
             FROM technologists t
             JOIN sewers s ON s.technologist_id = t.id
             WHERE t.building_floor_id = :floorId`,
            {
              replacements: { floorId: effectiveFloorId },
              type: db.sequelize.QueryTypes.SELECT,
            }
          );
          dailyCapacity = capRows[0]?.daily_capacity ?? 200;
        } else {
          const workshop = await db.Workshop.findByPk(workshop_id);
          if (workshop?.floors_count === 1) {
            const capRows = await db.sequelize.query(
              `SELECT COALESCE(SUM(s.capacity_per_day), 0)::int as daily_capacity
               FROM technologists t
               JOIN sewers s ON s.technologist_id = t.id`,
              { type: db.sequelize.QueryTypes.SELECT }
            );
            dailyCapacity = capRows[0]?.daily_capacity ?? 200;
          }
        }
        capacity_total_in_period = dailyCapacity * period_days;
        notes.push(`Мощность из БД: ${dailyCapacity} ед/день * ${period_days} дней = ${capacity_total_in_period} ед`);
      }
    }

    const capacity_ok = capacity_total_in_period >= planned_total_in_period;
    const capacity_percent =
      capacity_total_in_period > 0 ? Math.round((planned_total_in_period / capacity_total_in_period) * 100) : 0;

    res.json({
      R_sec,
      t_sec: t_sec != null ? Math.round(t_sec * 100) / 100 : null,
      Np_calc: Np_calc != null ? Math.round(Np_calc * 100) / 100 : null,
      Kr_calc: Kr_calc != null ? Math.round(Kr_calc * 100) / 100 : null,
      f_used,
      S_used,
      Nv_per_shift: Nv_per_shift != null ? Math.round(Nv_per_shift * 100) / 100 : null,
      notes,
      period_days,
      planned_total_in_period,
      capacity_total_in_period: Math.round(capacity_total_in_period),
      capacity_ok,
      capacity_percent,
    });
  } catch (err) {
    console.error('flow/calc error:', err);
    res.status(400).json({ error: err.message || 'Ошибка расчёта' });
  }
}

/**
 * POST /api/planning/flow/apply-auto
 * Распределение и применение плана по мощности.
 * admin/manager — все этажи; technologist — только свой этаж; operator — запрещено.
 */
async function applyAuto(req, res) {
  try {
    if (req.user.role === 'operator') {
      return res.status(403).json({ error: 'Оператор не может применять план' });
    }

    const {
      workshop_id,
      order_id,
      floor_id,
      from,
      to,
      planned_total,
      shift_hours = 8,
      mode,
      Msm,
      Np,
      Kr,
      Su,
      T,
      M,
      product_type = 'dress',
    } = req.body;

    if (!workshop_id || !order_id || !from || !to) {
      return res.status(400).json({ error: 'Укажите workshop_id, order_id, from, to' });
    }

    const plannedTotal = parseInt(planned_total, 10);
    if (isNaN(plannedTotal) || plannedTotal <= 0) {
      return res.status(400).json({ error: 'Укажите planned_total > 0' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    let effectiveFloorId = null;
    if (workshop.floors_count === 4) {
      if (floor_id == null || floor_id === '' || floor_id === 'all') {
        return res.status(400).json({ error: 'Для цеха «Наш цех» укажите floor_id (1–4)' });
      }
      const fid = Number(floor_id);
      if (fid < 1 || fid > 4) {
        return res.status(400).json({ error: 'floor_id должен быть от 1 до 4' });
      }
      effectiveFloorId = fid;

      // Технолог — только для своего этажа
      if (req.user.role === 'technologist') {
        const allowed = req.allowedBuildingFloorId ?? req.allowedFloorId;
        if (allowed != null && Number(allowed) !== fid) {
          return res.status(403).json({ error: 'Технолог может применять план только для своего этажа' });
        }
      }
    }

    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    if (Number(order.workshop_id) !== Number(workshop_id)) {
      return res.status(400).json({ error: 'Заказ не принадлежит выбранному цеху' });
    }

    const R_sec = (shift_hours || 8) * 3600;
    const period_days = getPeriodDays(from, to);
    if (period_days <= 0) {
      return res.status(400).json({ error: 'Некорректный период дат' });
    }

    // 1) Определить capacity_per_day
    let capacity_per_day = 0;
    const validModes = ['BY_SHIFT_CAPACITY', 'BY_WORKERS', 'BY_WORKPLACES', 'BY_AREA', 'BY_T_AND_M'];

    if (mode === 'BY_SHIFT_CAPACITY' && Msm && parseFloat(Msm) > 0) {
      capacity_per_day = parseFloat(Msm);
    } else if (mode === 'BY_T_AND_M' && T && M && parseFloat(T) > 0 && parseFloat(M) > 0) {
      const t = parseFloat(T);
      const m = parseFloat(M);
      const t_sec = R_sec / m;
      capacity_per_day = R_sec / t_sec;
    } else if (validModes.includes(mode)) {
      // Мощность из БД
      if (effectiveFloorId) {
        const capRows = await db.sequelize.query(
          `SELECT COALESCE(SUM(s.capacity_per_day), 0)::int as daily_capacity
           FROM technologists t
           JOIN sewers s ON s.technologist_id = t.id
           WHERE t.building_floor_id = :floorId`,
          {
            replacements: { floorId: effectiveFloorId },
            type: db.sequelize.QueryTypes.SELECT,
          }
        );
        capacity_per_day = capRows[0]?.daily_capacity ?? 200;
      } else {
        const capRows = await db.sequelize.query(
          `SELECT COALESCE(SUM(s.capacity_per_day), 0)::int as daily_capacity
           FROM technologists t
           JOIN sewers s ON s.technologist_id = t.id`,
          { type: db.sequelize.QueryTypes.SELECT }
        );
        capacity_per_day = capRows[0]?.daily_capacity ?? 200;
      }
    } else {
      return res.status(400).json({ error: 'Укажите режим (mode) и параметры для расчёта мощности' });
    }

    const total_capacity = Math.floor(capacity_per_day) * period_days;
    if (plannedTotal > total_capacity) {
      return res.status(400).json({
        error: 'Недостаточно мощности для применения плана',
        planned_total: plannedTotal,
        capacity_total: total_capacity,
      });
    }

    // 2) Сформировать дни
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const dates = [];
    let d = new Date(fromDate);
    while (d <= toDate) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }

    let remaining = plannedTotal;
    const capPerDay = Math.floor(capacity_per_day);
    const daysToApply = dates.map((date) => {
      const put = Math.min(capPerDay, Math.max(0, remaining));
      remaining -= put;
      return { date, planned_qty: put };
    });

    // 3) Транзакция: удалить старые, вставить новые
    const t = await db.sequelize.transaction();
    try {
      const existingRows = await db.ProductionPlanDay.findAll({
        where: {
          order_id: Number(order_id),
          workshop_id: Number(workshop_id),
          floor_id: effectiveFloorId,
          date: { [Op.between]: [from, to] },
        },
        transaction: t,
      });
      const actualByDate = (existingRows || []).reduce((acc, r) => {
        acc[r.date] = r.actual_qty || 0;
        return acc;
      }, {});

      await db.ProductionPlanDay.destroy({
        where: {
          order_id: Number(order_id),
          workshop_id: Number(workshop_id),
          floor_id: effectiveFloorId,
          date: { [Op.between]: [from, to] },
        },
        transaction: t,
      });

      for (const day of daysToApply) {
        const date = String(day.date).slice(0, 10);
        const plannedQty = Math.max(0, parseInt(day.planned_qty, 10) || 0);
        const actualQty = actualByDate[date] ?? 0;
        await db.ProductionPlanDay.create(
          {
            order_id: Number(order_id),
            workshop_id: Number(workshop_id),
            floor_id: effectiveFloorId,
            date,
            planned_qty: plannedQty,
            actual_qty: actualQty,
          },
          { transaction: t }
        );
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    const capacity_percent = total_capacity > 0 ? Math.round((plannedTotal / total_capacity) * 100) : 0;

    res.json({
      ok: true,
      days_applied: daysToApply.length,
      capacity_percent,
    });
  } catch (err) {
    console.error('flow/apply-auto error:', err);
    res.status(400).json({ error: err.message || 'Ошибка применения плана' });
  }
}

module.exports = { calc, applyAuto };
