import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

interface IntervalPickerProps {
  intervalDays: number;
  onIntervalChange: (days: number) => void;
}

const QUICK_OPTIONS = [2, 3, 7, 14, 30];

export function IntervalPicker({ intervalDays, onIntervalChange }: IntervalPickerProps) {
  const handleTextChange = (text: string) => {
    const num = parseInt(text, 10);
    if (!isNaN(num) && num > 0) {
      onIntervalChange(num);
    } else if (text === '') {
      onIntervalChange(1);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Repeat Every</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={intervalDays.toString()}
          onChangeText={handleTextChange}
          keyboardType="number-pad"
          selectTextOnFocus
        />
        <Text style={styles.daysLabel}>
          {intervalDays === 1 ? 'day' : 'days'}
        </Text>
      </View>

      <View style={styles.quickOptions}>
        {QUICK_OPTIONS.map((days) => (
          <TouchableOpacity
            key={days}
            onPress={() => onIntervalChange(days)}
            style={[
              styles.quickOption,
              intervalDays === days && styles.quickOptionSelected,
            ]}
          >
            <Text
              style={[
                styles.quickOptionText,
                intervalDays === days && styles.quickOptionTextSelected,
              ]}
            >
              {days}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.previewText}>
        This habit will appear every {intervalDays} {intervalDays === 1 ? 'day' : 'days'}
      </Text>
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    width: 80,
    height: 50,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  daysLabel: {
    fontSize: 18,
    color: '#888',
  },
  quickOptions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  quickOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  quickOptionSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  quickOptionText: {
    fontSize: 14,
    color: '#888',
  },
  quickOptionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  previewText: {
    marginTop: 20,
    fontSize: 13,
    color: '#666',
  },
});
