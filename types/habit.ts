// Schedule types for habits
export type HabitScheduleType = 'daily' | 'custom' | 'interval';

// Base habit interface
export interface Habit {
  id: string;
  name: string;
  scheduleType: HabitScheduleType;
  intervalDays?: number; // Only for interval habits
  oneTimeDate?: string; // YYYY-MM-DD for today-only habits
  createdAt: string;
  updatedAt: string;
}

// Habit with completion status for a specific date
export interface HabitWithCompletion extends Habit {
  completed: boolean;
  weekProgress?: boolean[]; // 7 booleans for week view
}

// Habit with associated days (for custom habits)
export interface HabitWithDays extends Habit {
  days: number[]; // Array of day indices (0=Sunday, 1=Monday, etc.)
}

// Interval habit with due date tracking
export interface IntervalHabit extends Habit {
  intervalDays: number;
  lastCompleted?: string; // ISO date string
  nextDue: string; // ISO date string
  rescheduleIfMissed: boolean; // If true, overdue habits still appear
}

// Input types for creating new habits
export interface NewHabitBase {
  name: string;
  oneTimeDate?: string; // YYYY-MM-DD for today-only habits
}

export interface NewDailyHabit extends NewHabitBase {
  scheduleType: 'daily';
}

export interface NewCustomHabit extends NewHabitBase {
  scheduleType: 'custom';
  days: number[]; // Days of week (0-6)
}

export interface NewIntervalHabit extends NewHabitBase {
  scheduleType: 'interval';
  intervalDays: number;
  startDate?: string; // ISO date string, defaults to today
  rescheduleIfMissed?: boolean; // If true, overdue habits still appear (default: false)
}

export type NewHabit = NewDailyHabit | NewCustomHabit | NewIntervalHabit;

// Database row types (for mapping from SQLite)
export interface HabitRow {
  id: string;
  name: string;
  schedule_type: string;
  interval_days: number | null;
  one_time_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitCompletionRow {
  id: number;
  habit_id: string;
  completed_date: string;
}

export interface HabitDayRow {
  id: number;
  habit_id: string;
  day_of_week: number;
}

export interface IntervalHabitStateRow {
  habit_id: string;
  last_completed: string | null;
  last_due?: string | null;
  next_due: string;
  reschedule_if_missed: number; // 0 or 1 in SQLite
}
