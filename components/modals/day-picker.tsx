import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const DAYS = [
  { index: 0, label: 'Sun', fullLabel: 'Sunday' },
  { index: 1, label: 'Mon', fullLabel: 'Monday' },
  { index: 2, label: 'Tue', fullLabel: 'Tuesday' },
  { index: 3, label: 'Wed', fullLabel: 'Wednesday' },
  { index: 4, label: 'Thu', fullLabel: 'Thursday' },
  { index: 5, label: 'Fri', fullLabel: 'Friday' },
  { index: 6, label: 'Sat', fullLabel: 'Saturday' },
];

interface DayPickerProps {
  selectedDays: number[];
  onDaysChange: (days: number[]) => void;
}

export function DayPicker({ selectedDays, onDaysChange }: DayPickerProps) {
  const toggleDay = (dayIndex: number) => {
    if (selectedDays.includes(dayIndex)) {
      onDaysChange(selectedDays.filter((d) => d !== dayIndex));
    } else {
      onDaysChange([...selectedDays, dayIndex].sort());
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Select Days</Text>
      <View style={styles.daysRow}>
        {DAYS.map((day) => {
          const isSelected = selectedDays.includes(day.index);
          return (
            <TouchableOpacity
              key={day.index}
              onPress={() => toggleDay(day.index)}
              style={[styles.dayButton, isSelected && styles.dayButtonSelected]}
            >
              <Text
                style={[styles.dayText, isSelected && styles.dayTextSelected]}
              >
                {day.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {selectedDays.length > 0 && (
        <Text style={styles.selectedText}>
          {selectedDays
            .sort()
            .map((d) => DAYS.find((day) => day.index === d)?.fullLabel)
            .join(', ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
  },
  label: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  dayButtonSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
  },
  dayTextSelected: {
    color: '#fff',
  },
  selectedText: {
    marginTop: 16,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
});
