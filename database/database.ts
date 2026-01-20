import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;
let schemaInitialized = false;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('habits.db');
  }
  if (!schemaInitialized) {
    await initializeSchema(db);
    schemaInitialized = true;
  }
  return db;
}

async function initializeSchema(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schedule_type TEXT NOT NULL CHECK (schedule_type IN ('daily', 'custom', 'interval')),
      interval_days INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS habit_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
      UNIQUE(habit_id, day_of_week)
    );

    CREATE TABLE IF NOT EXISTS habit_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id TEXT NOT NULL,
      completed_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
      UNIQUE(habit_id, completed_date)
    );

    CREATE TABLE IF NOT EXISTS interval_habit_state (
      habit_id TEXT PRIMARY KEY,
      last_completed TEXT,
      last_due TEXT,
      next_due TEXT NOT NULL,
      reschedule_if_missed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );


    CREATE INDEX IF NOT EXISTS idx_habit_completions_date ON habit_completions(completed_date);
    CREATE INDEX IF NOT EXISTS idx_habit_completions_habit ON habit_completions(habit_id);
    CREATE INDEX IF NOT EXISTS idx_habit_days_habit ON habit_days(habit_id);
    CREATE INDEX IF NOT EXISTS idx_interval_state_due ON interval_habit_state(next_due);
  `);

  // Migration: Add one_time_date column to habits table
  const habitColumns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(habits)'
  );
  const hasOneTimeDate = habitColumns.some((column) => column.name === 'one_time_date');
  if (!hasOneTimeDate) {
    await database.execAsync(`ALTER TABLE habits ADD COLUMN one_time_date TEXT;`);
  }

  // Migration: Add reschedule_if_missed column to interval_habit_state table
  const intervalColumns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(interval_habit_state)'
  );
  const hasRescheduleIfMissed = intervalColumns.some((column) => column.name === 'reschedule_if_missed');
  if (!hasRescheduleIfMissed) {
    await database.execAsync(`ALTER TABLE interval_habit_state ADD COLUMN reschedule_if_missed INTEGER NOT NULL DEFAULT 0;`);
  }

  // Migration: Add last_due column to interval_habit_state table
  const hasLastDue = intervalColumns.some((column) => column.name === 'last_due');
  if (!hasLastDue) {
    await database.execAsync(`ALTER TABLE interval_habit_state ADD COLUMN last_due TEXT;`);
  }
}

// Utility function to format date as YYYY-MM-DD
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Generate a unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
