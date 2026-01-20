import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ModalContainer } from '@/components/modals/modal-container';
import { IntervalPicker } from '@/components/modals/interval-picker';
import { useDatabase } from '@/context/database-context';
import { createHabit } from '@/database/habit-repository';
import { formatDateString } from '@/database/database';

export default function AddIntervalHabitModal() {
  const router = useRouter();
  const { db } = useDatabase();
  const params = useLocalSearchParams<{ date?: string }>();
  const [name, setName] = useState('');
  const [intervalDays, setIntervalDays] = useState(3);
  const [startToday, setStartToday] = useState(true);
  const [rescheduleIfMissed, setRescheduleIfMissed] = useState(false);
  const referenceDate = useMemo(() => {
    const dateParam = typeof params.date === 'string' ? params.date : undefined;
    if (!dateParam) return new Date();
    const [year, month, day] = dateParam.split('-').map(Number);
    if (!year || !month || !day) return new Date();
    return new Date(year, month - 1, day);
  }, [params.date]);

  const handleSave = async () => {
    if (!db || !name.trim()) return;

    // Calculate start date based on checkbox
    let startDate: string;
    if (startToday) {
      startDate = formatDateString(referenceDate);
    } else {
      // Start after the interval period
      const futureDate = new Date(referenceDate);
      futureDate.setDate(futureDate.getDate() + intervalDays);
      startDate = formatDateString(futureDate);
    }

    await createHabit(db, {
      name: name.trim(),
      scheduleType: 'interval',
      intervalDays,
      startDate,
      rescheduleIfMissed,
    });

    router.back();
  };

  return (
    <ModalContainer
      title="Add Interval Habit"
      onSave={handleSave}
      saveDisabled={!name.trim()}
    >
      <View>
        <Text style={styles.label}>Habit Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Change bedsheets"
          placeholderTextColor="#555"
          autoFocus
        />
      </View>

      <IntervalPicker intervalDays={intervalDays} onIntervalChange={setIntervalDays} />

      {/* Start Today Checkbox */}
      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setStartToday(!startToday)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, startToday && styles.checkboxChecked]}>
          {startToday && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.checkboxTextContainer}>
          <Text style={styles.checkboxLabel}>Start Today?</Text>
          <Text style={styles.checkboxHint}>
            {startToday
              ? `This habit will appear on ${referenceDate.toLocaleDateString('en-US', { weekday: 'long' })}`
              : `This habit will start in ${intervalDays} days`}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Reschedule if Missed Checkbox */}
      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setRescheduleIfMissed(!rescheduleIfMissed)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, rescheduleIfMissed && styles.checkboxChecked]}>
          {rescheduleIfMissed && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.checkboxTextContainer}>
          <Text style={styles.checkboxLabel}>Reschedule if missed?</Text>
          <Text style={styles.checkboxHint}>
            {rescheduleIfMissed
              ? 'If you miss a day, the habit will still appear until completed'
              : 'If you miss a day, the habit will skip to the next scheduled date'}
          </Text>
        </View>
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 24,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#8BBFB8',
    borderColor: '#8BBFB8',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    marginBottom: 4,
  },
  checkboxHint: {
    fontSize: 13,
    color: '#666',
  },
});
