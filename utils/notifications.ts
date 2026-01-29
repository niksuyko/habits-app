import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { getHabitsForDate } from '@/database/habit-repository';

const REMINDER_NOTIFICATION_ID = 'daily-habit-reminder';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Request notification permissions
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  // Set up Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('habit-reminders', {
      name: 'Habit Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return true;
}

// Schedule (or reschedule) the daily 7PM reminder notification
// Uses a daily repeating trigger so it fires every day even if the app isn't opened.
// When the app is opened or habits change, this is called again to update the message content.
export async function scheduleDailyReminder(db: SQLite.SQLiteDatabase): Promise<void> {
  // Cancel any existing reminder
  await Notifications.cancelScheduledNotificationAsync(REMINDER_NOTIFICATION_ID).catch(() => {});

  // Check if there are uncompleted habits today
  const today = new Date();
  const habits = await getHabitsForDate(db, today);
  const hasUncompleted = habits.some((h) => !h.completed);

  // Only schedule if there are uncompleted habits
  if (!hasUncompleted) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_NOTIFICATION_ID,
    content: {
      title: 'Habit Reminder',
      body: 'You still have remaining habits!',
      ...(Platform.OS === 'android' && { channelId: 'habit-reminders' }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 19,
      minute: 0,
    },
  });
}

// Cancel the daily reminder (e.g., when all habits are completed)
export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_NOTIFICATION_ID).catch(() => {});
}
