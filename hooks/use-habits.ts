import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '@/context/database-context';
import {
  Habit,
  HabitWithCompletion,
  HabitWithDays,
  IntervalHabit,
  NewHabit,
} from '@/types/habit';
import {
  createHabit,
  getHabitsForDate,
  getDailyHabits,
  getCustomHabits,
  getIntervalHabits,
  completeHabit,
  uncompleteHabit,
  deleteHabit,
  getWeekProgress,
  getStreak,
  getTotalCompletions,
  getDailyCompletionStreak,
} from '@/database/habit-repository';
import { formatDateString } from '@/database/database';

// Hook for Today view - habits for a specific date
export function useHabitsForDate(date: Date) {
  const { db, isLoading: dbLoading } = useDatabase();
  const [habits, setHabits] = useState<HabitWithCompletion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dateString = formatDateString(date);

  const refresh = useCallback(async () => {
    if (!db) return;
    setIsLoading(true);
    try {
      console.log('[useHabitsForDate] Refreshing for date:', dateString);
      const data = await getHabitsForDate(db, date);
      console.log('[useHabitsForDate] Got habits:', data.length, data.map(h => ({ name: h.name, type: h.scheduleType, completed: h.completed })));
      setHabits(data);
    } finally {
      setIsLoading(false);
    }
  }, [db, dateString]);

  useEffect(() => {
    if (!dbLoading) {
      refresh();
    }
  }, [dbLoading, refresh]);

  const toggleHabit = useCallback(
    async (habitId: string) => {
      if (!db) return;
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;

      console.log('[HabitToggle] start', {
        habitId,
        completed: habit.completed,
        date: formatDateString(date),
      });
      if (habit.completed) {
        await uncompleteHabit(db, habitId, date);
        console.log('[HabitToggle] uncomplete', { habitId });
      } else {
        await completeHabit(db, habitId, date);
        console.log('[HabitToggle] complete', { habitId });
      }
      await refresh();
      console.log('[HabitToggle] refreshed', { habitId });
    },
    [db, habits, date, refresh]
  );

  const addHabit = useCallback(
    async (newHabit: NewHabit) => {
      if (!db) return;
      await createHabit(db, newHabit);
      await refresh();
    },
    [db, refresh]
  );

  const removeHabit = useCallback(
    async (habitId: string) => {
      if (!db) return;
      await deleteHabit(db, habitId);
      await refresh();
    },
    [db, refresh]
  );

  return {
    habits,
    isLoading: dbLoading || isLoading,
    toggleHabit,
    addHabit,
    removeHabit,
    refresh,
  };
}

// Hook for Daily habits management
export function useDailyHabits() {
  const { db, isLoading: dbLoading } = useDatabase();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!db) return;
    setIsLoading(true);
    try {
      const data = await getDailyHabits(db);
      setHabits(data);
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  useEffect(() => {
    if (!dbLoading) {
      refresh();
    }
  }, [dbLoading, refresh]);

  const addHabit = useCallback(
    async (name: string) => {
      if (!db) return;
      await createHabit(db, { name, scheduleType: 'daily' });
      await refresh();
    },
    [db, refresh]
  );

  const removeHabit = useCallback(
    async (habitId: string) => {
      if (!db) return;
      await deleteHabit(db, habitId);
      await refresh();
    },
    [db, refresh]
  );

  return {
    habits,
    isLoading: dbLoading || isLoading,
    addHabit,
    removeHabit,
    refresh,
  };
}

// Hook for Custom habits management
export function useCustomHabits() {
  const { db, isLoading: dbLoading } = useDatabase();
  const [habits, setHabits] = useState<HabitWithDays[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!db) return;
    setIsLoading(true);
    try {
      const data = await getCustomHabits(db);
      setHabits(data);
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  useEffect(() => {
    if (!dbLoading) {
      refresh();
    }
  }, [dbLoading, refresh]);

  const addHabit = useCallback(
    async (name: string, days: number[]) => {
      if (!db) return;
      await createHabit(db, { name, scheduleType: 'custom', days });
      await refresh();
    },
    [db, refresh]
  );

  const removeHabit = useCallback(
    async (habitId: string) => {
      if (!db) return;
      await deleteHabit(db, habitId);
      await refresh();
    },
    [db, refresh]
  );

  return {
    habits,
    isLoading: dbLoading || isLoading,
    addHabit,
    removeHabit,
    refresh,
  };
}

// Hook for Interval habits management
export function useIntervalHabits(referenceDate?: Date) {
  const { db, isLoading: dbLoading } = useDatabase();
  const [habits, setHabits] = useState<IntervalHabit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dateString = referenceDate ? formatDateString(referenceDate) : undefined;

  const refresh = useCallback(async () => {
    if (!db) return;
    setIsLoading(true);
    try {
      const data = await getIntervalHabits(db, referenceDate);
      setHabits(data);
    } finally {
      setIsLoading(false);
    }
  }, [db, dateString]);

  useEffect(() => {
    if (!dbLoading) {
      refresh();
    }
  }, [dbLoading, refresh]);

  const addHabit = useCallback(
    async (name: string, intervalDays: number, startDate?: string) => {
      if (!db) return;
      await createHabit(db, { name, scheduleType: 'interval', intervalDays, startDate });
      await refresh();
    },
    [db, refresh]
  );

  const removeHabit = useCallback(
    async (habitId: string) => {
      if (!db) return;
      await deleteHabit(db, habitId);
      await refresh();
    },
    [db, refresh]
  );

  return {
    habits,
    isLoading: dbLoading || isLoading,
    addHabit,
    removeHabit,
    refresh,
  };
}

// Hook for stats
export function useHabitStats(habitId?: string, date?: Date) {
  const { db, isLoading: dbLoading } = useDatabase();
  const [streak, setStreak] = useState(0);
  const [dailyStreak, setDailyStreak] = useState(0);
  const [totalCompletions, setTotalCompletions] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!db) return;
    setIsLoading(true);
    try {
      if (habitId) {
        const streakValue = await getStreak(db, habitId);
        setStreak(streakValue);
      }
      const statsDate = date ?? new Date();
      const dailyStreakValue = await getDailyCompletionStreak(db, statsDate);
      setDailyStreak(dailyStreakValue);
      const total = await getTotalCompletions(db);
      setTotalCompletions(total);
    } finally {
      setIsLoading(false);
    }
  }, [db, habitId, date ? formatDateString(date) : undefined]);

  useEffect(() => {
    if (!dbLoading) {
      refresh();
    }
  }, [dbLoading, refresh]);

  return {
    streak,
    dailyStreak,
    totalCompletions,
    isLoading: dbLoading || isLoading,
    refresh,
  };
}

// Hook for week progress
export function useWeekProgress(habitId: string, weekStartDate: Date) {
  const { db, isLoading: dbLoading } = useDatabase();
  const [progress, setProgress] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!db) return;
    setIsLoading(true);
    try {
      const data = await getWeekProgress(db, habitId, weekStartDate);
      setProgress(data);
    } finally {
      setIsLoading(false);
    }
  }, [db, habitId, formatDateString(weekStartDate)]);

  useEffect(() => {
    if (!dbLoading) {
      refresh();
    }
  }, [dbLoading, refresh]);

  return {
    progress,
    isLoading: dbLoading || isLoading,
    refresh,
  };
}
