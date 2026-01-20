import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ModalContainer } from '@/components/modals/modal-container';
import { DayPicker } from '@/components/modals/day-picker';
import { useDatabase } from '@/context/database-context';
import { createHabit } from '@/database/habit-repository';

export default function AddCustomHabitModal() {
  const router = useRouter();
  const { db } = useDatabase();
  const [name, setName] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  const handleSave = async () => {
    if (!db || !name.trim() || selectedDays.length === 0) return;

    await createHabit(db, {
      name: name.trim(),
      scheduleType: 'custom',
      days: selectedDays,
    });

    router.back();
  };

  return (
    <ModalContainer
      title="Add Custom Habit"
      onSave={handleSave}
      saveDisabled={!name.trim() || selectedDays.length === 0}
    >
      <View>
        <Text style={styles.label}>Habit Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Go to the gym"
          placeholderTextColor="#555"
          autoFocus
        />
      </View>

      <DayPicker selectedDays={selectedDays} onDaysChange={setSelectedDays} />
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
});
