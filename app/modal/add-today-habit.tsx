import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ModalContainer } from '@/components/modals/modal-container';
import { useDatabase } from '@/context/database-context';
import { createHabit } from '@/database/habit-repository';
import { formatDateString } from '@/database/database';

export default function AddTodayHabitModal() {
  const router = useRouter();
  const { db } = useDatabase();
  const params = useLocalSearchParams<{ date?: string }>();
  const [name, setName] = useState('');
  const targetDate = useMemo(() => {
    const dateParam = typeof params.date === 'string' ? params.date : undefined;
    if (!dateParam) return new Date();
    const [year, month, day] = dateParam.split('-').map(Number);
    if (!year || !month || !day) return new Date();
    return new Date(year, month - 1, day);
  }, [params.date]);

  const handleSave = async () => {
    if (!db || !name.trim()) return;

    await createHabit(db, {
      name: name.trim(),
      scheduleType: 'custom',
      days: [],
      oneTimeDate: formatDateString(targetDate),
    });

    router.back();
  };

  return (
    <ModalContainer
      title="Add Habit for Today"
      onSave={handleSave}
      saveDisabled={!name.trim()}
    >
      <View>
        <Text style={styles.label}>Habit Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Morning meditation"
          placeholderTextColor="#555"
          autoFocus
        />
        <Text style={styles.hint}>
          This habit only appears on {targetDate.toLocaleDateString('en-US', { weekday: 'long' })}.
        </Text>
      </View>
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
  hint: {
    marginTop: 12,
    fontSize: 13,
    color: '#666',
  },
});
