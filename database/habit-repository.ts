import * as SQLite from 'expo-sqlite';
import { formatDateString, generateId } from './database';
import {
  Habit,
  HabitWithCompletion,
  HabitWithDays,
  IntervalHabit,
  NewHabit,
  HabitRow,
  HabitScheduleType,
} from '@/types/habit';

// Helper to map database row to Habit object
function mapRowToHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    scheduleType: row.schedule_type as HabitScheduleType,
    intervalDays: row.interval_days ?? undefined,
    oneTimeDate: row.one_time_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper to auto-advance overdue interval habits that don't have reschedule_if_missed enabled
// This ensures missed habits automatically move to the next scheduled date rather than disappearing
async function autoAdvanceOverdueIntervalHabits(
  db: SQLite.SQLiteDatabase,
  referenceDate: Date
): Promise<void> {
  const dateString = formatDateString(referenceDate);

  const overdueHabits = await db.getAllAsync<{ habit_id: string; next_due: string; interval_days: number }>(
    `SELECT ihs.habit_id, ihs.next_due, h.interval_days
     FROM interval_habit_state ihs
     JOIN habits h ON h.id = ihs.habit_id
     WHERE ihs.reschedule_if_missed = 0 AND ihs.next_due < ?`,
    [dateString]
  );

  for (const habit of overdueHabits) {
    // Parse due date as local date (not UTC) to avoid timezone issues
    const [year, month, day] = habit.next_due.split('-').map(Number);

    // Calculate days passed using UTC to avoid DST issues
    const dueDateUtc = Date.UTC(year, month - 1, day);
    const todayUtc = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    const daysPassed = Math.floor((todayUtc - dueDateUtc) / (1000 * 60 * 60 * 24));

    // Calculate how many full intervals fit in that time, plus one to get to the future
    const intervalsToAdd = Math.ceil(daysPassed / habit.interval_days);
    const newDueDate = new Date(year, month - 1, day);
    newDueDate.setDate(newDueDate.getDate() + (intervalsToAdd * habit.interval_days));

    if (__DEV__) {
      console.log('[autoAdvance] Advancing habit', habit.habit_id, 'from', habit.next_due, 'to', formatDateString(newDueDate), 'daysPassed:', daysPassed, 'intervalsToAdd:', intervalsToAdd);
    }

    const lastDueDate = new Date(newDueDate);
    lastDueDate.setDate(lastDueDate.getDate() - habit.interval_days);

    await db.runAsync(
      `UPDATE interval_habit_state SET next_due = ?, last_due = ? WHERE habit_id = ?`,
      [formatDateString(newDueDate), formatDateString(lastDueDate), habit.habit_id]
    );
  }
}

// Create a new habit
export async function createHabit(
  db: SQLite.SQLiteDatabase,
  newHabit: NewHabit
): Promise<Habit> {
  const id = generateId();
  const now = new Date().toISOString();
  const oneTimeDate =
    newHabit.scheduleType === 'custom' ? newHabit.oneTimeDate ?? null : null;

  await db.runAsync(
    `INSERT INTO habits (id, name, schedule_type, interval_days, one_time_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      newHabit.name,
      newHabit.scheduleType,
      newHabit.scheduleType === 'interval' ? newHabit.intervalDays : null,
      oneTimeDate,
      now,
      now,
    ]
  );

  // Handle custom habits - insert days
  if (newHabit.scheduleType === 'custom' && !newHabit.oneTimeDate && newHabit.days.length > 0) {
    for (const day of newHabit.days) {
      await db.runAsync(
        `INSERT INTO habit_days (habit_id, day_of_week) VALUES (?, ?)`,
        [id, day]
      );
    }
  }

  // Handle interval habits - insert initial state
  if (newHabit.scheduleType === 'interval') {
    const startDate = newHabit.startDate || formatDateString(new Date());
    const rescheduleIfMissed = newHabit.rescheduleIfMissed ? 1 : 0;
    await db.runAsync(
      `INSERT INTO interval_habit_state (habit_id, next_due, reschedule_if_missed) VALUES (?, ?, ?)`,
      [id, startDate, rescheduleIfMissed]
    );
  }

  return {
    id,
    name: newHabit.name,
    scheduleType: newHabit.scheduleType,
    intervalDays: newHabit.scheduleType === 'interval' ? newHabit.intervalDays : undefined,
    oneTimeDate: newHabit.scheduleType === 'custom' ? newHabit.oneTimeDate : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

// Get all habits for a specific date (for Today view)
export async function getHabitsForDate(
  db: SQLite.SQLiteDatabase,
  date: Date
): Promise<HabitWithCompletion[]> {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dateString = formatDateString(date);

  // Auto-advance overdue interval habits
  await autoAdvanceOverdueIntervalHabits(db, date);

  // Debug: Check interval habit states
  if (__DEV__) {
    const intervalStates = await db.getAllAsync<{ habit_id: string; next_due: string; reschedule_if_missed: number }>(
      `SELECT habit_id, next_due, reschedule_if_missed FROM interval_habit_state`
    );
    console.log('[getHabitsForDate] Query date:', dateString, 'dayOfWeek:', dayOfWeek);
    console.log('[getHabitsForDate] Interval states:', intervalStates);
  }

  const rows = await db.getAllAsync<HabitRow & { completed: number }>(
    `SELECT
      h.id,
      h.name,
      h.schedule_type,
      h.interval_days,
      h.one_time_date,
      h.created_at,
      h.updated_at,
      CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END as completed
    FROM habits h
    LEFT JOIN habit_completions c
      ON h.id = c.habit_id AND c.completed_date = ?
    WHERE
      h.schedule_type = 'daily'
      OR (h.schedule_type = 'custom' AND h.one_time_date IS NULL AND EXISTS (
        SELECT 1 FROM habit_days hd WHERE hd.habit_id = h.id AND hd.day_of_week = ?
      ))
      OR (h.schedule_type = 'custom' AND h.one_time_date = ?)
      OR (h.schedule_type = 'interval' AND (
        c.id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM interval_habit_state ihs
          WHERE ihs.habit_id = h.id AND (
            ihs.next_due = ?
            OR (ihs.reschedule_if_missed = 1 AND ihs.next_due < ?)
            OR (
              ihs.reschedule_if_missed = 1
              AND ihs.last_due IS NOT NULL
              AND ihs.last_completed IS NOT NULL
              AND ihs.last_due <= ?
              AND ihs.last_completed > ?
            )
            OR (
              ihs.reschedule_if_missed = 0
              AND ihs.last_due = ?
              AND (ihs.last_completed IS NULL OR ihs.last_completed <> ihs.last_due)
            )
          )
        )
      ))
    ORDER BY h.created_at ASC`,
    [dateString, dayOfWeek, dateString, dateString, dateString, dateString, dateString, dateString]
  );

  if (__DEV__) {
    console.log('[getHabitsForDate] Found habits:', rows.length, rows.map(r => ({ name: r.name, type: r.schedule_type })));
  }

  return rows.map((row) => ({
    ...mapRowToHabit(row),
    completed: row.completed === 1,
  }));
}

// Get all daily habits
export async function getDailyHabits(
  db: SQLite.SQLiteDatabase
): Promise<Habit[]> {
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT * FROM habits WHERE schedule_type = 'daily' ORDER BY created_at ASC`
  );
  return rows.map(mapRowToHabit);
}

// Get all custom habits with their days
export async function getCustomHabits(
  db: SQLite.SQLiteDatabase
): Promise<HabitWithDays[]> {
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT * FROM habits
     WHERE schedule_type = 'custom' AND one_time_date IS NULL
     ORDER BY created_at ASC`
  );

  const habits: HabitWithDays[] = [];
  for (const row of rows) {
    const days = await db.getAllAsync<{ day_of_week: number }>(
      `SELECT day_of_week FROM habit_days WHERE habit_id = ? ORDER BY day_of_week`,
      [row.id]
    );
    habits.push({
      ...mapRowToHabit(row),
      days: days.map((d) => d.day_of_week),
    });
  }

  return habits;
}

// Get all interval habits with their state
export async function getIntervalHabits(
  db: SQLite.SQLiteDatabase,
  referenceDate?: Date
): Promise<IntervalHabit[]> {
  // Auto-advance overdue interval habits before fetching
  await autoAdvanceOverdueIntervalHabits(db, referenceDate ?? new Date());

  const rows = await db.getAllAsync<
    HabitRow & { last_completed: string | null; next_due: string; reschedule_if_missed: number }
  >(
    `SELECT h.*, ihs.last_completed, ihs.next_due, ihs.reschedule_if_missed
     FROM habits h
     JOIN interval_habit_state ihs ON h.id = ihs.habit_id
     WHERE h.schedule_type = 'interval'
     ORDER BY h.created_at ASC`
  );

  return rows.map((row) => ({
    ...mapRowToHabit(row),
    intervalDays: row.interval_days!,
    rescheduleIfMissed: row.reschedule_if_missed === 1,
    lastCompleted: row.last_completed ?? undefined,
    nextDue: row.next_due,
  }));
}

// Get habits for a specific day of week (for Weekly view)
export async function getHabitsForDayOfWeek(
  db: SQLite.SQLiteDatabase,
  dayOfWeek: number,
  date: Date
): Promise<HabitWithCompletion[]> {
  const dateString = formatDateString(date);

  const rows = await db.getAllAsync<HabitRow & { completed: number }>(
    `SELECT
      h.id,
      h.name,
      h.schedule_type,
      h.interval_days,
      h.one_time_date,
      h.created_at,
      h.updated_at,
      CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END as completed
    FROM habits h
    LEFT JOIN habit_completions c
      ON h.id = c.habit_id AND c.completed_date = ?
    WHERE
      h.schedule_type = 'daily'
      OR (h.schedule_type = 'custom' AND h.one_time_date IS NULL AND EXISTS (
        SELECT 1 FROM habit_days hd WHERE hd.habit_id = h.id AND hd.day_of_week = ?
      ))
    ORDER BY h.created_at ASC`,
    [dateString, dayOfWeek]
  );

  return rows.map((row) => ({
    ...mapRowToHabit(row),
    completed: row.completed === 1,
  }));
}

// Complete a habit for a specific date
export async function completeHabit(
  db: SQLite.SQLiteDatabase,
  habitId: string,
  date: Date
): Promise<void> {
  const dateString = formatDateString(date);

  await db.runAsync(
    `INSERT OR IGNORE INTO habit_completions (habit_id, completed_date) VALUES (?, ?)`,
    [habitId, dateString]
  );

  // Update interval habit state if applicable
  const habit = await db.getFirstAsync<HabitRow>(
    `SELECT * FROM habits WHERE id = ?`,
    [habitId]
  );

  if (habit?.schedule_type === 'interval' && habit.interval_days) {
    const nextDue = new Date(date);
    nextDue.setDate(nextDue.getDate() + habit.interval_days);

    const intervalState = await db.getFirstAsync<{ next_due: string | null }>(
      `SELECT next_due FROM interval_habit_state WHERE habit_id = ?`,
      [habitId]
    );
    const lastDue = intervalState?.next_due ?? dateString;

    await db.runAsync(
      `UPDATE interval_habit_state
       SET last_completed = ?, last_due = ?, next_due = ?
       WHERE habit_id = ?`,
      [dateString, lastDue, formatDateString(nextDue), habitId]
    );
  }
}

// Uncomplete a habit for a specific date
export async function uncompleteHabit(
  db: SQLite.SQLiteDatabase,
  habitId: string,
  date: Date
): Promise<void> {
  const dateString = formatDateString(date);

  await db.runAsync(
    `DELETE FROM habit_completions WHERE habit_id = ? AND completed_date = ?`,
    [habitId, dateString]
  );
}

// Delete a habit
export async function deleteHabit(
  db: SQLite.SQLiteDatabase,
  habitId: string
): Promise<void> {
  await db.runAsync(`DELETE FROM habits WHERE id = ?`, [habitId]);
}

// Delete all data (debug reset)
export async function clearAllData(
  db: SQLite.SQLiteDatabase
): Promise<void> {
  await db.execAsync(`
    DELETE FROM habit_completions;
    DELETE FROM habit_days;
    DELETE FROM interval_habit_state;
    DELETE FROM habits;
  `);
}

// Get week progress for a habit (7 days starting from weekStartDate)
export async function getWeekProgress(
  db: SQLite.SQLiteDatabase,
  habitId: string,
  weekStartDate: Date
): Promise<boolean[]> {
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + i);
    weekDates.push(formatDateString(date));
  }

  const placeholders = weekDates.map(() => '?').join(',');
  const completions = await db.getAllAsync<{ completed_date: string }>(
    `SELECT completed_date FROM habit_completions
     WHERE habit_id = ? AND completed_date IN (${placeholders})`,
    [habitId, ...weekDates]
  );

  const completedDates = new Set(completions.map((c) => c.completed_date));
  return weekDates.map((date) => completedDates.has(date));
}

// Get current streak for a habit
export async function getStreak(
  db: SQLite.SQLiteDatabase,
  habitId: string
): Promise<number> {
  const today = formatDateString(new Date());

  // Get all completions for this habit, ordered by date descending
  const completions = await db.getAllAsync<{ completed_date: string }>(
    `SELECT completed_date FROM habit_completions
     WHERE habit_id = ? AND completed_date <= ?
     ORDER BY completed_date DESC`,
    [habitId, today]
  );

  if (completions.length === 0) return 0;

  let streak = 0;
  let expectedDate = new Date();

  for (const completion of completions) {
    const completionDate = new Date(completion.completed_date);
    const expectedDateStr = formatDateString(expectedDate);

    if (completion.completed_date === expectedDateStr) {
      streak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else if (streak === 0) {
      // Allow for today not being completed yet
      expectedDate.setDate(expectedDate.getDate() - 1);
      if (completion.completed_date === formatDateString(expectedDate)) {
        streak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return streak;
}

// Get consecutive days where all habits due that day were completed
export async function getDailyCompletionStreak(
  db: SQLite.SQLiteDatabase,
  startDate: Date
): Promise<number> {
  const isCompleteDay = async (date: Date) => {
    const habits = await getHabitsForDate(db, date);
    const completedCount = habits.filter((habit) => habit.completed).length;
    if (__DEV__) {
      console.log('[DailyStreak] day-check', {
        date: formatDateString(date),
        due: habits.length,
        completed: completedCount,
      });
    }
    return habits.length > 0 && completedCount === habits.length;
  };

  const cursor = new Date(startDate);
  const isTodayComplete = await isCompleteDay(cursor);
  if (!isTodayComplete) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  let complete = isTodayComplete;
  if (!complete) {
    complete = await isCompleteDay(cursor);
  }
  while (complete) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
    complete = await isCompleteDay(cursor);
  }

  if (__DEV__) {
    console.log('[DailyStreak] result', { streak });
  }
  return streak;
}

// Get total completions count
export async function getTotalCompletions(
  db: SQLite.SQLiteDatabase
): Promise<number> {
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM habit_completions`
  );
  return result?.count ?? 0;
}
