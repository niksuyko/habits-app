import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ModalContainer } from '@/components/modals/modal-container';
import { DayPicker } from '@/components/modals/day-picker';
import { IntervalPicker } from '@/components/modals/interval-picker';
import { useDatabase } from '@/context/database-context';
import { deleteHabit } from '@/database/habit-repository';
import * as SQLite from 'expo-sqlite';
import { HabitScheduleType } from '@/types/habit';

interface HabitDetails {
  id: string;
  name: string;
  scheduleType: HabitScheduleType;
  intervalDays?: number;
  days?: number[];
}

export default function EditHabitModal() {
  const router = useRouter();
  const { db } = useDatabase();
  const params = useLocalSearchParams<{ habitId: string }>();
  const habitId = params.habitId;

  const [habit, setHabit] = useState<HabitDetails | null>(null);
  const [name, setName] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [intervalDays, setIntervalDays] = useState(3);
  const [isLoading, setIsLoading] = useState(true);

  // Load habit data
  useEffect(() => {
    async function loadHabit() {
      if (!db || !habitId) return;

      try {
        const habitRow = await db.getFirstAsync<{
          id: string;
          name: string;
          schedule_type: string;
          interval_days: number | null;
        }>('SELECT * FROM habits WHERE id = ?', [habitId]);

        if (habitRow) {
          const habitDetails: HabitDetails = {
            id: habitRow.id,
            name: habitRow.name,
            scheduleType: habitRow.schedule_type as HabitScheduleType,
            intervalDays: habitRow.interval_days ?? undefined,
          };

          // Load days for custom habits
          if (habitRow.schedule_type === 'custom') {
            const days = await db.getAllAsync<{ day_of_week: number }>(
              'SELECT day_of_week FROM habit_days WHERE habit_id = ?',
              [habitId]
            );
            habitDetails.days = days.map(d => d.day_of_week);
            setSelectedDays(habitDetails.days);
          }

          setHabit(habitDetails);
          setName(habitRow.name);
          if (habitRow.interval_days) {
            setIntervalDays(habitRow.interval_days);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadHabit();
  }, [db, habitId]);

  const handleSave = async () => {
    if (!db || !habitId || !name.trim()) return;

    // Update habit name
    await db.runAsync('UPDATE habits SET name = ?, updated_at = ? WHERE id = ?', [
      name.trim(),
      new Date().toISOString(),
      habitId,
    ]);

    // Update schedule-specific data
    if (habit?.scheduleType === 'custom') {
      // Delete old days and insert new ones
      await db.runAsync('DELETE FROM habit_days WHERE habit_id = ?', [habitId]);
      for (const day of selectedDays) {
        await db.runAsync(
          'INSERT INTO habit_days (habit_id, day_of_week) VALUES (?, ?)',
          [habitId, day]
        );
      }
    } else if (habit?.scheduleType === 'interval') {
      await db.runAsync('UPDATE habits SET interval_days = ? WHERE id = ?', [
        intervalDays,
        habitId,
      ]);
    }

    router.back();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Habit',
      `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!db || !habitId) return;
            await deleteHabit(db, habitId);
            router.back();
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <ModalContainer title="Edit Habit" onSave={() => {}} saveDisabled>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </ModalContainer>
    );
  }

  if (!habit) {
    return (
      <ModalContainer title="Edit Habit" onSave={() => router.back()} saveLabel="Close">
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Habit not found</Text>
        </View>
      </ModalContainer>
    );
  }

  const isSaveDisabled =
    !name.trim() ||
    (habit.scheduleType === 'custom' && selectedDays.length === 0);

  return (
    <ModalContainer
      title="Edit Habit"
      onSave={handleSave}
      saveDisabled={isSaveDisabled}
    >
      <View>
        <Text style={styles.label}>Habit Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Enter habit name"
          placeholderTextColor="#555"
          autoFocus
        />
      </View>

      {habit.scheduleType === 'custom' && (
        <DayPicker selectedDays={selectedDays} onDaysChange={setSelectedDays} />
      )}

      {habit.scheduleType === 'interval' && (
        <IntervalPicker intervalDays={intervalDays} onIntervalChange={setIntervalDays} />
      )}

      {habit.scheduleType === 'daily' && (
        <Text style={styles.scheduleHint}>This habit repeats every day</Text>
      )}

      {/* Delete Button */}
      <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
        <Text style={styles.deleteButtonText}>Delete Habit</Text>
      </TouchableOpacity>
    </ModalContainer>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
    fontSize: 17,
    color: '#fff',
  },
  scheduleHint: {
    marginTop: 20,
    fontSize: 14,
    color: '#666',
  },
  deleteButton: {
    marginTop: 40,
    padding: 16,
    backgroundColor: '#331111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#662222',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff4444',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#888',
  },
});
