import { useCustomHabits, useDailyHabits, useHabitsForDate, useHabitStats, useIntervalHabits } from '@/hooks/use-habits';
import { clearAllData } from '@/database/habit-repository';
import { useDatabase } from '@/context/database-context';
import { formatDateString } from '@/database/database';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Svg } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Habit {
  id: string;
  name: string;
  completed: boolean;
  weekProgress?: boolean[];
}

interface IntervalHabit extends Habit {
  interval: number; // every X days
  lastCompleted?: string; // ISO date string
  nextDue?: string; // ISO date string
  daysUntilDue?: number;
}

interface DayHabits {
  [key: string]: Habit[];
}

type HabitScheduleType = 'daily' | 'custom' | 'interval';

const CompletedSection = ({ habits, isExpanded, onToggle, renderHabitItem }: {
  habits: Habit[];
  isExpanded: boolean;
  onToggle: () => void;
  renderHabitItem: (habit: Habit) => React.ReactNode;
}) => {
  const [contentHeight, setContentHeight] = useState(0);
  const animatedHeight = useSharedValue(0);
  const animatedTranslateY = useSharedValue(0);
  const rotateValue = useSharedValue(0);

  // Track previous expanded state to detect actual transitions
  const wasExpanded = React.useRef(isExpanded);

  // Animate when isExpanded changes
  React.useEffect(() => {
    if (contentHeight === 0) return;

    if (isExpanded) {
      // Opening: slide content down from above
      animatedTranslateY.value = -contentHeight;
      animatedHeight.value = withTiming(contentHeight, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      });
      animatedTranslateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      });
      rotateValue.value = withTiming(1, { duration: 250 });
    } else if (wasExpanded.current) {
      // Only animate closed if we were actually open before
      animatedHeight.value = withTiming(0, {
        duration: 250,
        easing: Easing.out(Easing.ease),
      });
      animatedTranslateY.value = withTiming(-contentHeight, {
        duration: 250,
        easing: Easing.out(Easing.ease),
      });
      rotateValue.value = withTiming(0, { duration: 250 });
    }

    wasExpanded.current = isExpanded;
  }, [isExpanded, contentHeight]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      height: animatedHeight.value,
      overflow: 'hidden' as const,
    };
  });

  const animatedContentStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: animatedTranslateY.value }],
    };
  });

  const animatedArrowStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotateValue.value * 180}deg` }],
    };
  });

  const onContentLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0 && height !== contentHeight) {
      setContentHeight(height);
      // If expanded and height changed, update the animated height immediately
      if (isExpanded && animatedHeight.value > 0) {
        animatedHeight.value = withTiming(height, {
          duration: 200,
          easing: Easing.out(Easing.ease),
        });
      }
    }
  };

  const renderContent = () => (
    <>
      {habits.map(habit => renderHabitItem(habit))}
    </>
  );

  return (
    <View style={styles.completedSection}>
      <TouchableOpacity
        style={styles.completedHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <Text style={styles.completedTitle}>
          Completed ({habits.length})
        </Text>
        <Animated.View style={animatedArrowStyle}>
          <Text style={styles.completedArrow}>▼</Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Hidden measurement view - always present to track height changes */}
      <View
        style={styles.completedListMeasure}
        onLayout={onContentLayout}
        pointerEvents="none"
      >
        {renderContent()}
      </View>

      {/* Animated visible view */}
      <Animated.View style={[styles.completedListAnimated, animatedContainerStyle]}>
        <Animated.View style={[styles.completedListInner, animatedContentStyle]}>
          {renderContent()}
        </Animated.View>
      </Animated.View>
    </View>
  );
};

const WeekIndicator = ({ weekProgress }: { weekProgress?: boolean[] }) => {
  if (!weekProgress) return null;

  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <View style={styles.weekIndicator}>
      {days.map((day, index) => (
        <View key={index} style={styles.dayColumn}>
          <Text style={styles.dayLabel}>{day}</Text>
          <View style={[
            styles.dayDot,
            weekProgress[index] && styles.dayDotCompleted
          ]} />
        </View>
      ))}
    </View>
  );
};

const HabitItem = ({ habit, isCompleted = false, onAnimationStart, onAnimationComplete, onLog }: {
  habit: Habit;
  isCompleted?: boolean;
  onAnimationStart?: () => void;
  onAnimationComplete?: () => void;
  onLog?: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const logSwipeEvent = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (onLog) {
      onLog(event, payload);
    }
  }, [onLog]);

  // Shared values for swipe and collapse animation
  const translateX = useSharedValue(0);
  const isActive = useSharedValue(false);
  const itemHeight = useSharedValue<number | null>(null);
  const opacity = useSharedValue(1);
  const marginBottom = useSharedValue(12); // matches gap in habitsList

  const SWIPE_THRESHOLD = 120; // pixels needed to complete swipe

  const resetAnimation = (reason: string) => {
    'worklet';
    runOnJS(logSwipeEvent)('reset', {
      id: habit.id,
      reason,
      translateX: translateX.value,
    });
    translateX.value = withTiming(0, {
      duration: 200,
      easing: Easing.out(Easing.ease)
    });
    isActive.value = false;
  };

  const gesture = useMemo(() => {
    // For completed habits, don't allow any gesture interaction
    if (isCompleted) {
      return Gesture.Pan().enabled(false);
    }

    return Gesture.Pan()
      .maxPointers(1)
      .activeOffsetX(10) // Start recognizing after 10px horizontal movement
      .failOffsetY([-20, 20]) // Fail if vertical movement exceeds 20px (allow scrolling)
      .onStart(() => {
        isActive.value = true;
      })
      .onUpdate((event) => {
        // Only allow swiping right (positive X)
        if (event.translationX > 0) {
          // Apply some resistance as user swipes further
          const resistance = 0.8;
          translateX.value = Math.min(event.translationX * resistance, dimensions.width * 0.6);
        } else {
          translateX.value = 0;
        }
      })
      .onEnd((event) => {
        runOnJS(logSwipeEvent)('pan-end', {
          id: habit.id,
          translationX: event.translationX,
          threshold: SWIPE_THRESHOLD,
          width: dimensions.width,
        });
        if (event.translationX >= SWIPE_THRESHOLD) {
          runOnJS(logSwipeEvent)('threshold-met', { id: habit.id });
          // Notify that animation is starting (hide from list immediately)
          if (onAnimationStart) {
            runOnJS(onAnimationStart)();
          }
          // Swipe completed - animate to full width
          translateX.value = withTiming(
            dimensions.width * 1.2,
            {
              duration: 200,
              easing: Easing.out(Easing.ease),
            },
            (finished) => {
              runOnJS(logSwipeEvent)('slide-out-finished', {
                id: habit.id,
                finished,
              });
              if (finished) {
                // After slide out, collapse the height
                itemHeight.value = withTiming(0, {
                  duration: 250,
                  easing: Easing.out(Easing.ease),
                });
                opacity.value = withTiming(0, { duration: 200 });
                marginBottom.value = withTiming(0, {
                  duration: 250,
                  easing: Easing.out(Easing.ease),
                }, (collapseFinished) => {
                  if (collapseFinished && onAnimationComplete) {
                    runOnJS(logSwipeEvent)('collapse-finished', { id: habit.id });
                    runOnJS(onAnimationComplete)();
                  }
                });
              }
            }
          );
        } else {
          runOnJS(logSwipeEvent)('threshold-not-met', { id: habit.id });
          // Swipe not far enough - snap back
          resetAnimation('threshold');
        }
      })
      .onFinalize((event, success) => {
        runOnJS(logSwipeEvent)('finalize', {
          id: habit.id,
          success,
          translationX: event.translationX,
          translateX: translateX.value,
        });
        if (translateX.value < SWIPE_THRESHOLD) {
          runOnJS(logSwipeEvent)('finalize-reset', { id: habit.id });
          resetAnimation('finalize');
        }
      });
  }, [habit.id, onAnimationStart, onAnimationComplete, logSwipeEvent, dimensions.width, dimensions.height, isCompleted]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const animatedBackgroundStyle = useAnimatedStyle(() => {
    const progress = Math.min(translateX.value / SWIPE_THRESHOLD, 1);
    return {
      opacity: progress * 0.8,
    };
  });

  const animatedWrapperStyle = useAnimatedStyle(() => {
    return {
      height: itemHeight.value !== null ? itemHeight.value : undefined,
      opacity: opacity.value,
      marginBottom: marginBottom.value,
      overflow: 'hidden' as const,
    };
  });

  const handleLayout = (event: any) => {
    const { width, height } = event.nativeEvent.layout;
    if (dimensions.height === 0) {
      setDimensions({ width, height });
      logSwipeEvent('layout', { id: habit.id, width, height });
      // Initialize the height for animation (only if not already set)
      if (itemHeight.value === null) {
        itemHeight.value = height;
      }
    }
  };

  return (
    <Animated.View
      style={[styles.habitItemWrapper, !isCompleted && animatedWrapperStyle]}
    >
      {/* Background reveal on swipe */}
      {!isCompleted && (
        <Animated.View style={[styles.swipeBackground, animatedBackgroundStyle]}>
          <Text style={styles.swipeBackgroundIcon}>✓</Text>
        </Animated.View>
      )}
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.habitItem,
            isCompleted && styles.habitItemCompleted,
            !isCompleted && animatedContainerStyle
          ]}
          onLayout={handleLayout}
        >
          <View style={styles.habitContent}>
            {habit.completed && (
              <View style={[styles.checkbox, styles.checkboxCompleted]}>
                <Text style={styles.checkmark}>✓</Text>
              </View>
            )}
            <Text style={[
              styles.habitName,
              isCompleted && styles.habitNameCompleted,
              !habit.completed && { marginLeft: 0 }
            ]}>{habit.name}</Text>
          </View>
          {habit.weekProgress && <WeekIndicator weekProgress={habit.weekProgress} />}

          {/* Swipe hint */}
          {!habit.completed && (
            <View style={styles.swipeHint}>
              <Text style={styles.swipeHintText}>Swipe →</Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db } = useDatabase();
  const [activeTab, setActiveTab] = useState<'today' | 'weekly'>('today');
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay()); // Current day
  const [scheduleType, setScheduleType] = useState<HabitScheduleType>('custom');
  const [showCompleted, setShowCompleted] = useState(false);

  // Track habits that are animating completion to prevent flicker
  const [animatingHabitIds, setAnimatingHabitIds] = useState<Set<string>>(new Set());

  // Database hooks
  const [today, setToday] = useState(() => new Date());
  const [isDebugMode, setIsDebugMode] = useState(false); // Track if date was manually set for testing
  const { habits: todayHabits, isLoading: todayLoading, toggleHabit, refresh: refreshToday } = useHabitsForDate(today);
  const { habits: dailyHabitsData, isLoading: dailyLoading, refresh: refreshDaily } = useDailyHabits();
  const { habits: customHabitsData, isLoading: customLoading, refresh: refreshCustom } = useCustomHabits();
  const { habits: intervalHabitsData, isLoading: intervalLoading, refresh: refreshInterval } = useIntervalHabits(today);
  const { dailyStreak, refresh: refreshStats } = useHabitStats(undefined, today);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const getDaysUntilDate = useCallback((dateString?: string) => {
    if (!dateString) return undefined;
    const [year, month, day] = dateString.split('-').map(Number);
    const dueUtc = Date.UTC(year, month - 1, day);
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.round((dueUtc - todayUtc) / MS_PER_DAY);
    return Math.max(0, diffDays);
  }, [today]);

  // Refresh data when screen comes into focus (after adding a habit)
  useFocusEffect(
    useCallback(() => {
      // Only reset to current date if not in debug mode
      if (!isDebugMode) {
        setToday(new Date());
      }
      refreshToday();
      refreshDaily();
      refreshCustom();
      refreshInterval();
      refreshStats();
    }, [isDebugMode, refreshToday, refreshDaily, refreshCustom, refreshInterval, refreshStats])
  );

  // Move to the next day at midnight (only if not in debug mode)
  React.useEffect(() => {
    if (isDebugMode) return; // Don't auto-advance when testing

    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );
    const timeoutMs = nextMidnight.getTime() - now.getTime() + 1000;
    const timer = setTimeout(() => {
      setToday(new Date());
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [today, isDebugMode]);

  // Debug: Skip to next day (simulates midnight transition)
  const skipToNextDay = useCallback(() => {
    setIsDebugMode(true); // Enter debug mode to prevent auto-reset
    const nextDay = new Date(today);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0); // Set to midnight of next day
    setToday(nextDay);
    console.log('[Debug] Skipped to:', nextDay.toDateString());
  }, [today]);

  // Debug: Reset all data
  const resetDebugData = useCallback(() => {
    if (!db) return;
    Alert.alert(
      'Reset All Data',
      'This will delete all habits and completions. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearAllData(db);
            setIsDebugMode(false);
            setToday(new Date());
            setAnimatingHabitIds(new Set());
            setShowCompleted(false);
            refreshToday();
            refreshDaily();
            refreshCustom();
            refreshInterval();
            refreshStats();
            console.log('[Debug] Reset all data');
          },
        },
      ]
    );
  }, [db, refreshToday, refreshDaily, refreshCustom, refreshInterval, refreshStats]);

  // Convert database habits to UI format
  const habits: Habit[] = todayHabits.map(h => ({
    id: h.id,
    name: h.name,
    completed: h.completed,
  }));

  // Build weekly habits from custom habits
  const weeklyHabits: DayHabits = useMemo(() => {
    const result: DayHabits = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    customHabitsData.forEach(habit => {
      habit.days.forEach(day => {
        result[day].push({
          id: habit.id,
          name: habit.name,
          completed: false, // Would need to check completions for specific date
        });
      });
    });
    return result;
  }, [customHabitsData]);

  // Convert daily habits
  const dailyHabits: Habit[] = dailyHabitsData.map(h => ({
    id: h.id,
    name: h.name,
    completed: false, // Would need to check completions for specific date
  }));

  // Convert interval habits
  const intervalHabits: IntervalHabit[] = intervalHabitsData.map(h => ({
    id: h.id,
    name: h.name,
    completed: false,
    interval: h.intervalDays,
    lastCompleted: h.lastCompleted,
    nextDue: h.nextDue,
    daysUntilDue: getDaysUntilDate(h.nextDue),
  }));

  const currentStreak = Math.min(dailyStreak, 99);

  // Get current date formatted
  const currentDate = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    };
    return today.toLocaleDateString('en-US', options);
  }, [today]);

  const completedHabits = habits.filter(h => h.completed).length;
  const totalHabits = habits.length;
  const dailyProgress = totalHabits > 0 ? (completedHabits / totalHabits) * 100 : 0;
  const isDayComplete = totalHabits > 0 && completedHabits === totalHabits;

  React.useEffect(() => {
    refreshStats();
  }, [refreshStats, totalHabits, completedHabits]);

  // Animated progress bar
  const progressBarWidth = useSharedValue(dailyProgress);

  React.useEffect(() => {
    progressBarWidth.value = withTiming(dailyProgress, {
      duration: 500,
      easing: Easing.out(Easing.ease),
    });
  }, [dailyProgress]);

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${progressBarWidth.value}%`,
  }));

  const daysOfWeek = [
    { short: 'M', full: 'Monday', date: 1, dayOfWeek: 1 },
    { short: 'T', full: 'Tuesday', date: 2, dayOfWeek: 2 },
    { short: 'W', full: 'Wednesday', date: 3, dayOfWeek: 3 },
    { short: 'T', full: 'Thursday', date: 4, dayOfWeek: 4 },
    { short: 'F', full: 'Friday', date: 5, dayOfWeek: 5 },
    { short: 'S', full: 'Saturday', date: 6, dayOfWeek: 6 },
    { short: 'S', full: 'Sunday', date: 7, dayOfWeek: 0 },
  ];

  // Called when swipe animation starts - mark as animating to prevent flicker in completed section
  const onHabitAnimationStart = useCallback((id: string) => {
    setAnimatingHabitIds(prev => new Set(prev).add(id));
    console.log('[HabitSwipe] animation-start', { id });
  }, []);

  // Called when swipe animation completes - persist to database
  const onHabitAnimationComplete = useCallback((id: string) => {
    console.log('[HabitSwipe] animation-complete', { id });
    // Small delay to ensure the collapse animation has visually completed
    setTimeout(() => {
      toggleHabit(id).finally(() => refreshStats());
      // Remove from animating set after DB update
      setTimeout(() => {
        setAnimatingHabitIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 50);
    }, 50);
  }, [toggleHabit]);

  const logSwipeEvent = useCallback((event: string, payload?: Record<string, unknown>) => {
    console.log(`[HabitSwipe] ${event}`, payload ?? {});
  }, []);

  const renderCircularProgress = () => {
    const size = 180;
    const inProgressStroke = 2;
    const innerRingOffset = 10;
    const radius = (size - inProgressStroke) / 2;
    const ringRadius = radius - innerRingOffset / 2;
    const ringStrokeWidth = innerRingOffset;
    const ringBaseColor = '#8BBFB8';
    const ringInnerColor = '#D9E9E6';
    const ringCompleteColor = '#8BBFB8';

    return (
      <View style={styles.streakContainer}>
        <View style={[styles.streakCircle, { width: size, height: size }]}>
          <Svg width={size} height={size} style={styles.circularProgress}>
            {isDayComplete ? (
              <Circle
                stroke={ringCompleteColor}
                fill="none"
                cx={size / 2}
                cy={size / 2}
                r={ringRadius}
                strokeWidth={ringStrokeWidth}
              />
            ) : (
              <>
                <Circle
                  stroke={ringBaseColor}
                  fill="none"
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  strokeWidth={inProgressStroke}
                />
                <Circle
                  stroke={ringInnerColor}
                  fill="none"
                  cx={size / 2}
                  cy={size / 2}
                  r={radius - innerRingOffset}
                  strokeWidth={inProgressStroke}
                />
              </>
            )}
          </Svg>
          <View style={styles.streakTextContainer}>
            <Text style={styles.streakNumber}>{currentStreak}</Text>
            <Text style={styles.streakLabel}>DAY STREAK</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderProgressBar = () => {
    return (
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground}>
          <Animated.View style={[styles.progressBarFill, animatedProgressStyle]} />
        </View>
        <Text style={styles.progressText}>Today's Progress: {completedHabits}/{totalHabits}</Text>
      </View>
    );
  };

  const renderWeeklyView = () => {
    const selectedDayHabits = weeklyHabits[selectedDay] || [];
    const selectedDayInfo = daysOfWeek.find((day) => day.dayOfWeek === selectedDay) ?? daysOfWeek[0];

    return (
      <View style={styles.weeklyContainer}>
        {/* Schedule Type Selector */}
        <View style={styles.scheduleTypeSelector}>
          <TouchableOpacity
            style={[styles.scheduleTypeButton, scheduleType === 'daily' && styles.scheduleTypeButtonActive]}
            onPress={() => setScheduleType('daily')}
            activeOpacity={0.7}
          >
            <Text style={[styles.scheduleTypeText, scheduleType === 'daily' && styles.scheduleTypeTextActive]}>
              Daily
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scheduleTypeButton, scheduleType === 'custom' && styles.scheduleTypeButtonActive]}
            onPress={() => setScheduleType('custom')}
            activeOpacity={0.7}
          >
            <Text style={[styles.scheduleTypeText, scheduleType === 'custom' && styles.scheduleTypeTextActive]}>
              Custom
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scheduleTypeButton, scheduleType === 'interval' && styles.scheduleTypeButtonActive]}
            onPress={() => setScheduleType('interval')}
            activeOpacity={0.7}
          >
            <Text style={[styles.scheduleTypeText, scheduleType === 'interval' && styles.scheduleTypeTextActive]}>
              Interval
            </Text>
          </TouchableOpacity>
        </View>

        {/* Day Selector - Only show for Custom schedules */}
        {scheduleType === 'custom' && (
          <View style={styles.daySelector}>
            {daysOfWeek.map((day) => {
              const dayHabits = weeklyHabits[day.dayOfWeek] || [];
              const completedCount = dayHabits.filter(h => h.completed).length;
              const totalCount = dayHabits.length;
              const isSelected = selectedDay === day.dayOfWeek;

              return (
                <TouchableOpacity
                  key={day.dayOfWeek}
                  style={[styles.dayCard, isSelected && styles.dayCardSelected]}
                  onPress={() => setSelectedDay(day.dayOfWeek)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dayCardLetter, isSelected && styles.dayCardLetterSelected]}>
                    {day.short}
                  </Text>
                  <View style={styles.dayCardProgress}>
                    <View style={styles.dayCardProgressBar}>
                      <View
                        style={[
                          styles.dayCardProgressFill,
                          {
                            width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%',
                          },
                          isSelected && styles.dayCardProgressFillSelected,
                        ]}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Content Area */}
        {scheduleType === 'custom' && (
          <View style={styles.weeklyContent}>
            <Text style={styles.weeklyDayTitle}>{selectedDayInfo.full}</Text>
            <View style={styles.habitsGrid}>
              {selectedDayHabits.map((habit) => (
                <TouchableOpacity
                  key={habit.id}
                  style={[styles.gridHabitCard, habit.completed && styles.gridHabitCardCompleted]}
                  onPress={() => router.push(`/modal/edit-habit?habitId=${habit.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.gridHabitContent}>
                    <View
                      style={[
                        styles.gridCheckbox,
                        habit.completed && styles.gridCheckboxCompleted,
                      ]}
                    >
                      {habit.completed && <Text style={styles.gridCheckmark}>✓</Text>}
                    </View>
                    <Text
                      style={[
                        styles.gridHabitName,
                        habit.completed && styles.gridHabitNameCompleted,
                      ]}
                    >
                      {habit.name}
                    </Text>
                  </View>
                  <View style={styles.editIndicator}>
                    <Text style={styles.editIndicatorText}>Edit</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.gridAddCard}
                activeOpacity={0.7}
                onPress={() => router.push(`/modal/add-day-habit?day=${selectedDay}`)}
              >
                <Text style={styles.gridAddIcon}>+</Text>
                <Text style={styles.gridAddText}>Add Habit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Daily Habits View */}
        {scheduleType === 'daily' && (
          <View style={styles.weeklyContent}>
            <Text style={styles.weeklyDayTitle}>Daily Habits</Text>
            <Text style={styles.weeklySubtitle}>Repeat every single day</Text>
            <View style={styles.habitsGrid}>
              {dailyHabits.map((habit) => (
                <TouchableOpacity
                  key={habit.id}
                  style={[styles.gridHabitCard, habit.completed && styles.gridHabitCardCompleted]}
                  onPress={() => router.push(`/modal/edit-habit?habitId=${habit.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.gridHabitContent}>
                    <View
                      style={[
                        styles.gridCheckbox,
                        habit.completed && styles.gridCheckboxCompleted,
                      ]}
                    >
                      {habit.completed && <Text style={styles.gridCheckmark}>✓</Text>}
                    </View>
                    <Text
                      style={[
                        styles.gridHabitName,
                        habit.completed && styles.gridHabitNameCompleted,
                      ]}
                    >
                      {habit.name}
                    </Text>
                  </View>
                  <View style={styles.editIndicator}>
                    <Text style={styles.editIndicatorText}>Edit</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.gridAddCard}
                activeOpacity={0.7}
                onPress={() => router.push('/modal/add-daily-habit')}
              >
                <Text style={styles.gridAddIcon}>+</Text>
                <Text style={styles.gridAddText}>Add Habit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Interval Habits View */}
        {scheduleType === 'interval' && (
          <View style={styles.weeklyContent}>
            <Text style={styles.weeklyDayTitle}>Interval Habits</Text>
            <Text style={styles.weeklySubtitle}>Repeat every X days</Text>
            <View style={styles.intervalHabitsList}>
              {intervalHabits.map((habit) => (
                <TouchableOpacity
                  key={habit.id}
                  style={[styles.intervalHabitCard, habit.completed && styles.intervalHabitCardCompleted]}
                  onPress={() => router.push(`/modal/edit-habit?habitId=${habit.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.intervalHabitLeft}>
                    <View style={styles.intervalHabitText}>
                      <Text
                        style={[
                          styles.intervalHabitName,
                          habit.completed && styles.gridHabitNameCompleted,
                        ]}
                      >
                        {habit.name}
                      </Text>
                      <Text style={styles.intervalHabitSchedule}>
                        Every {habit.interval} days
                      </Text>
                    </View>
                  </View>
                  <View style={styles.intervalHabitRight}>
                    <View style={[
                      styles.intervalHabitBadge,
                      habit.daysUntilDue === 0 && styles.intervalHabitBadgeToday
                    ]}>
                      <Text style={styles.intervalHabitBadgeText}>
                        {habit.daysUntilDue === 0 ? 'Today' : `${habit.daysUntilDue ?? habit.interval}d`}
                      </Text>
                    </View>
                    <Text style={styles.editIndicatorTextSmall}>Edit</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.addHabitButton}
                activeOpacity={0.7}
                onPress={() => router.push(`/modal/add-interval-habit?date=${formatDateString(today)}`)}
              >
                <Text style={styles.addHabitButtonText}>+ Add Interval Habit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  // Animated tab swipe
  const translateX = useSharedValue(0);
  const currentIndex = useSharedValue(0); // 0 = today, 1 = weekly

  const setTabIndex = useCallback((index: number) => {
    setActiveTab(index === 0 ? 'today' : 'weekly');
  }, []);

  // Sync activeTab state with animated value
  React.useEffect(() => {
    const targetIndex = activeTab === 'today' ? 0 : 1;
    currentIndex.value = targetIndex;
    translateX.value = withTiming(-targetIndex * SCREEN_WIDTH, {
      duration: 300,
      easing: Easing.out(Easing.ease),
    });
  }, [activeTab]);

  const tabSwipeGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      const baseOffset = -currentIndex.value * SCREEN_WIDTH;
      // Add resistance at edges
      let newTranslateX = baseOffset + event.translationX;

      // Resistance when trying to swipe past edges
      if (newTranslateX > 0) {
        newTranslateX = newTranslateX * 0.3; // Resistance on left edge
      } else if (newTranslateX < -SCREEN_WIDTH) {
        const overflow = newTranslateX + SCREEN_WIDTH;
        newTranslateX = -SCREEN_WIDTH + overflow * 0.3; // Resistance on right edge
      }

      translateX.value = newTranslateX;
    })
    .onEnd((event) => {
      const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
      const VELOCITY_THRESHOLD = 500;

      let targetIndex = currentIndex.value;

      // Check if swipe was significant enough
      if (Math.abs(event.translationX) > SWIPE_THRESHOLD || Math.abs(event.velocityX) > VELOCITY_THRESHOLD) {
        if (event.translationX < 0 && currentIndex.value === 0) {
          targetIndex = 1; // Swipe left -> weekly
        } else if (event.translationX > 0 && currentIndex.value === 1) {
          targetIndex = 0; // Swipe right -> today
        }
      }

      // Animate to target position
      translateX.value = withTiming(-targetIndex * SCREEN_WIDTH, {
        duration: 250,
        easing: Easing.out(Easing.ease),
      });

      if (targetIndex !== currentIndex.value) {
        currentIndex.value = targetIndex;
        runOnJS(setTabIndex)(targetIndex);
      }
    }), [setTabIndex]);

  const animatedTabContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <GestureDetector gesture={tabSwipeGesture}>
          <View style={styles.tabContentContainer}>
            <Animated.View style={[styles.tabPagesContainer, animatedTabContainerStyle]}>
              {/* Today Tab */}
              <View style={styles.tabPage}>
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                  {/* Header */}
                  <View style={styles.todayHeader}>
                    <Text style={styles.todayHeaderLogo}>habits</Text>
                    <View style={styles.todayHeaderRight}>
                      <Text style={styles.todayHeaderDate}>{currentDate}</Text>
                      {/* Debug: Skip to next day button */}
                      <View style={styles.debugButtonRow}>
                        <TouchableOpacity
                          style={styles.debugSkipButton}
                          onPress={skipToNextDay}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.debugSkipButtonText}>Skip →</Text>
                        </TouchableOpacity>
                        {isDebugMode && (
                          <TouchableOpacity
                            style={styles.debugResetButton}
                            onPress={resetDebugData}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.debugResetButtonText}>Reset</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Streak Card with Gradient */}
                  <View style={styles.streakCard}>
                    {/* Circular Streak Indicator */}
                    {renderCircularProgress()}

                    {/* Progress Bar */}
                    {renderProgressBar()}
                  </View>

                  {habits.length === 0 && (
                    <View style={styles.emptyDayNotice}>
                      <Text style={styles.emptyDayNoticeText}>
                        Add a habit to avoid losing your streak.
                      </Text>
                    </View>
                  )}

                  {/* Active Habits List */}
                  <View style={styles.habitsList}>
                    {habits
                      .filter(h => !h.completed || animatingHabitIds.has(h.id))
                      .map(habit => (
                        <HabitItem
                          key={habit.id}
                          habit={habit}
                          isCompleted={false}
                          onAnimationStart={() => onHabitAnimationStart(habit.id)}
                          onAnimationComplete={() => onHabitAnimationComplete(habit.id)}
                          onLog={logSwipeEvent}
                        />
                      ))}
                  </View>

                  {/* Completed Section */}
                  {habits.some(h => h.completed && !animatingHabitIds.has(h.id)) && (
                    <CompletedSection
                      habits={habits.filter(h => h.completed && !animatingHabitIds.has(h.id))}
                      isExpanded={showCompleted}
                      onToggle={() => setShowCompleted(!showCompleted)}
                      renderHabitItem={(habit) => (
                        <HabitItem key={habit.id} habit={habit} isCompleted={true} onLog={logSwipeEvent} />
                      )}
                    />
                  )}

                  {/* Add Habit Button */}
                  <TouchableOpacity
                    style={styles.addHabitButton}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/modal/add-today-habit?date=${formatDateString(today)}`)}
                  >
                    <Text style={styles.addHabitButtonText}>+ Add Habit</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {/* Weekly Tab */}
              <View style={styles.tabPage}>
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                  <View style={styles.weeklyHeader}>
                    <Text style={styles.weeklyHeaderLogo}>weekly planner</Text>
                  </View>
                  {renderWeeklyView()}
                </ScrollView>
              </View>
            </Animated.View>
          </View>
        </GestureDetector>

        {/* Bottom Tab Bar */}
        <View style={[styles.bottomTabBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'today' && styles.tabButtonActive]}
            onPress={() => setActiveTab('today')}
          >
            <View style={[
              styles.tabIcon,
              activeTab === 'today' && styles.tabIconActive
            ]}>
              <Text style={styles.tabIconText}>✓</Text>
            </View>
            <Text style={[
              styles.tabLabel,
              activeTab === 'today' && styles.tabLabelActive
            ]}>Today</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'weekly' && styles.tabButtonActive]}
            onPress={() => setActiveTab('weekly')}
          >
            <View style={[
              styles.tabIcon,
              activeTab === 'weekly' && styles.tabIconActive
            ]}>
              <Text style={styles.tabIconText}>📅</Text>
            </View>
            <Text style={[
              styles.tabLabel,
              activeTab === 'weekly' && styles.tabLabelActive
            ]}>Weekly</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FD',
  },
  tabContentContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  tabPagesContainer: {
    flexDirection: 'row',
    flex: 1,
    width: SCREEN_WIDTH * 2,
  },
  tabPage: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  weeklyHeader: {
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  weeklyHeaderLogo: {
    fontSize: 36,
    fontWeight: '800',
    color: '#8BBFB8',
    letterSpacing: -0.5,
    textTransform: 'lowercase',
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  todayHeaderLogo: {
    fontSize: 36,
    fontWeight: '800',
    color: '#8BBFB8',
    letterSpacing: -0.5,
  },
  todayHeaderRight: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 16,
  },
  todayHeaderDate: {
    fontSize: 15,
    fontWeight: '500',
    color: '#4F7F77',
    letterSpacing: 0.4,
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '400',
    color: '#888',
    letterSpacing: 0.5,
  },
  streakCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#8BBFB8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  streakContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  streakCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circularProgress: {
    transform: [{ rotate: '0deg' }],
  },
  streakTextContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakNumber: {
    fontSize: 72,
    fontWeight: '700',
    color: '#8BBFB8',
    letterSpacing: -2,
    marginBottom: 0,
  },
  streakLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: -8,
  },
  progressBarContainer: {
    alignItems: 'center',
  },
  progressBarBackground: {
    width: '100%',
    height: 12,
    backgroundColor: '#F0F8F7',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8BBFB8',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  emptyDayNotice: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#F2F6F5',
    borderWidth: 1,
    borderColor: '#E2EAE8',
  },
  emptyDayNoticeText: {
    fontSize: 14,
    color: '#7A8C89',
    fontWeight: '500',
  },
  habitsList: {
    paddingHorizontal: 20,
  },
  habitItemWrapper: {
    position: 'relative',
    borderRadius: 20,
    marginBottom: 12,
  },
  habitItem: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#8BBFB8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  habitContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#E8E8E8',
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
    zIndex: 2,
  },
  checkboxCompleted: {
    backgroundColor: '#8BBFB8',
    borderColor: '#8BBFB8',
    shadowColor: '#8BBFB8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  checkmark: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  habitName: {
    fontSize: 17,
    color: '#1A1A1A',
    fontWeight: '500',
    letterSpacing: -0.2,
    zIndex: 2,
  },
  habitNameCompleted: {
    color: '#999',
    textDecorationLine: 'line-through',
  },
  habitItemCompleted: {
    opacity: 0.7,
  },
  weekIndicator: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 12,
  },
  dayColumn: {
    alignItems: 'center',
    gap: 4,
  },
  dayLabel: {
    fontSize: 10,
    color: '#999',
    fontWeight: '500',
  },
  dayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8E8E8',
  },
  dayDotCompleted: {
    backgroundColor: '#8BBFB8',
  },
  addHabitButton: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: '#F0F8F7',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#8BBFB8',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  addHabitButtonText: {
    fontSize: 16,
    color: '#8BBFB8',
    fontWeight: '600',
  },
  completedSection: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  completedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F0F8F7',
    borderRadius: 12,
  },
  completedTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8BBFB8',
    letterSpacing: 0.3,
  },
  completedToggle: {
    fontSize: 24,
    fontWeight: '300',
    color: '#8BBFB8',
  },
  completedArrow: {
    fontSize: 14,
    color: '#8BBFB8',
  },
  completedList: {
    marginTop: 12,
  },
  completedListAnimated: {
    marginTop: 12,
  },
  completedListInner: {
  },
  completedListMeasure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
  },
  swipeHint: {
    backgroundColor: '#F0F8F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 2,
  },
  swipeHintText: {
    fontSize: 12,
    color: '#8BBFB8',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  swipeBackground: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: '#8BBFB8',
    borderRadius: 20,
    justifyContent: 'center',
    paddingLeft: 24,
  },
  swipeBackgroundIcon: {
    fontSize: 28,
    color: '#FFF',
    fontWeight: 'bold',
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingTop: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabButtonActive: {
    // Active state handled by icon and label
  },
  tabIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  tabIconActive: {
    backgroundColor: '#8BBFB8',
  },
  tabIconText: {
    fontSize: 18,
  },
  tabLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#8BBFB8',
    fontWeight: '600',
  },
  // Weekly View Styles
  weeklyContainer: {
    flex: 1,
  },
  scheduleTypeSelector: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 20,
  },
  scheduleTypeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E8E8E8',
  },
  scheduleTypeButtonActive: {
    backgroundColor: '#8BBFB8',
    borderColor: '#8BBFB8',
  },
  scheduleTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  scheduleTypeTextActive: {
    color: '#FFF',
  },
  daySelector: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 24,
  },
  dayCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#8BBFB8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  dayCardSelected: {
    backgroundColor: '#8BBFB8',
    shadowColor: '#8BBFB8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  dayCardLetter: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  dayCardLetterSelected: {
    color: '#FFF',
  },
  dayCardDate: {
    fontSize: 18,
    fontWeight: '300',
    color: '#000',
  },
  dayCardDateSelected: {
    color: '#FFF',
  },
  dayCardProgress: {
    width: '100%',
    marginTop: 4,
  },
  dayCardProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#E8E8E8',
    borderRadius: 2,
    overflow: 'hidden',
  },
  dayCardProgressFill: {
    height: '100%',
    backgroundColor: '#8BBFB8',
    borderRadius: 2,
  },
  dayCardProgressFillSelected: {
    backgroundColor: '#FFF',
  },
  weeklyContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  weeklyDayTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  weeklySubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  habitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridHabitCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 18,
    minHeight: 110,
    justifyContent: 'center',
    shadowColor: '#8BBFB8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  gridHabitCardCompleted: {
    backgroundColor: '#F0F8F7',
    borderWidth: 2,
    borderColor: '#8BBFB8',
    shadowColor: '#8BBFB8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  gridHabitContent: {
    gap: 12,
  },
  gridCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  gridCheckboxCompleted: {
    backgroundColor: '#8BBFB8',
    borderColor: '#8BBFB8',
    borderWidth: 0,
  },
  gridCheckmark: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  gridHabitName: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
    lineHeight: 20,
  },
  gridHabitNameCompleted: {
    color: '#666',
  },
  gridAddCard: {
    width: '48%',
    backgroundColor: '#F0F8F7',
    borderRadius: 20,
    padding: 18,
    minHeight: 110,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#8BBFB8',
    borderStyle: 'dashed',
    gap: 8,
  },
  gridAddIcon: {
    fontSize: 32,
    color: '#8BBFB8',
    fontWeight: '300',
  },
  gridAddText: {
    fontSize: 14,
    color: '#8BBFB8',
    fontWeight: '600',
  },
  // Interval Habits Styles
  intervalHabitsList: {
    gap: 12,
  },
  intervalHabitCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#8BBFB8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  intervalHabitCardCompleted: {
    backgroundColor: '#F0F8F7',
    borderWidth: 2,
    borderColor: '#8BBFB8',
    shadowColor: '#8BBFB8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  intervalHabitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  intervalHabitText: {
    flex: 1,
    gap: 4,
  },
  intervalHabitName: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
  intervalHabitSchedule: {
    fontSize: 13,
    color: '#999',
  },
  intervalHabitBadge: {
    backgroundColor: '#8BBFB8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  intervalHabitBadgeToday: {
    backgroundColor: '#4F7F77',
  },
  intervalHabitBadgeText: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '700',
  },
  intervalHabitRight: {
    alignItems: 'center',
    gap: 6,
  },
  editIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#F0F8F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editIndicatorText: {
    fontSize: 11,
    color: '#8BBFB8',
    fontWeight: '600',
  },
  editIndicatorTextSmall: {
    fontSize: 11,
    color: '#8BBFB8',
    fontWeight: '600',
  },
  debugButtonRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  debugSkipButton: {
    backgroundColor: '#FFE4B5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DEB887',
  },
  debugSkipButtonText: {
    fontSize: 12,
    color: '#8B4513',
    fontWeight: '600',
  },
  debugResetButton: {
    backgroundColor: '#E8E8E8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCC',
  },
  debugResetButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
});
