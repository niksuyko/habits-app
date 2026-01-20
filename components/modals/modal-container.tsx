import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

interface ModalContainerProps {
  title: string;
  children: React.ReactNode;
  onSave: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
}

export function ModalContainer({
  title,
  children,
  onSave,
  saveDisabled = false,
  saveLabel = 'Save',
}: ModalContainerProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.content, { paddingTop: insets.top + 10 }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            onPress={onSave}
            disabled={saveDisabled}
            style={styles.headerButton}
          >
            <Text
              style={[styles.saveText, saveDisabled && styles.saveTextDisabled]}
            >
              {saveLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Body */}
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerButton: {
    minWidth: 60,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  cancelText: {
    fontSize: 17,
    color: '#888',
  },
  saveText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#4CAF50',
    textAlign: 'right',
  },
  saveTextDisabled: {
    color: '#444',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
  },
});
