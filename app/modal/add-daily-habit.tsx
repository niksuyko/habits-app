import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ModalContainer } from '@/components/modals/modal-container';
import { useDatabase } from '@/context/database-context';
import { createHabit } from '@/database/habit-repository';

export default function AddDailyHabitModal() {
  const router = useRouter();
  const { db } = useDatabase();
  const [name, setName] = useState('');

  const handleSave = async () => {
    if (!db || !name.trim()) return;

    await createHabit(db, {
      name: name.trim(),
      scheduleType: 'daily',
    });

    router.back();
  };

  return (
    <ModalContainer
      title="Add Daily Habit"
      onSave={handleSave}
      saveDisabled={!name.trim()}
    >
      <View>
        <Text style={styles.label}>Habit Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Drink 8 glasses of water"
          placeholderTextColor="#555"
          autoFocus
        />
        <Text style={styles.hint}>
          This habit will appear every day
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
