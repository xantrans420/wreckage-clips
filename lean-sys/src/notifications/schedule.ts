import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Profile, Weekday, WEEKDAYS } from '../types';
import { dayFromCompletedCount } from '../domain/rotation';
import { completedSessionCount } from '../db/repositories/train';

/**
 * Quiet by design. One nudge, not spam. Errors/reminders speak plainly, no
 * cheerleading.
 *
 *   - Gym-day morning (07:30): which session (A/B/C) is up next.
 *   - Weekly (Sun 09:00): weigh in + shoot progress photos.
 *   - Step reminder is scheduled live by the app when steps are under goal by
 *     evening (see requestStepNudge), not as a fixed weekly trigger.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Expo weekday numbering: 1 = Sunday .. 7 = Saturday. */
const EXPO_WEEKDAY: Record<Weekday, number> = {
  Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7,
};

export async function ensurePermissions(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('leansys', {
      name: 'LEAN.SYS',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
    });
  }
  return req.granted;
}

/** Rebuild the whole schedule from the current profile. Idempotent. */
export async function rescheduleAll(profile: Profile): Promise<void> {
  const ok = await ensurePermissions();
  if (!ok) return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Gym-day morning nudges. We can't compute the exact rotation letter for each
  // future date without the completion history, so we surface the *next* letter
  // as of now; the app corrects the label live on the home screen.
  const nextLetter = dayFromCompletedCount(await completedSessionCount(profile.id));
  for (const wd of profile.gym_days) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'GYM DAY',
        body: `Session ${nextLetter} is up in the A/B/C rotation.`,
      },
      trigger: {
        weekday: EXPO_WEEKDAY[wd],
        hour: 7,
        minute: 30,
        repeats: true,
      },
    });
  }

  // Weekly weigh-in + photos, Sunday morning.
  await Notifications.scheduleNotificationAsync({
    content: { title: 'WEEKLY CHECK', body: 'Weigh in (morning, empty) + shoot progress photos.' },
    trigger: {
      weekday: EXPO_WEEKDAY.Sun,
      hour: 9,
      minute: 0,
      repeats: true,
    },
  });
}

/**
 * Fire-and-forget evening step reminder if under goal. Call from the app in the
 * evening after reading step count; schedules a near-immediate local notice.
 */
export async function stepNudge(steps: number, goal: number): Promise<void> {
  if (steps >= goal) return;
  const ok = await ensurePermissions();
  if (!ok) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'STEPS', body: `${steps.toLocaleString()} / ${goal.toLocaleString()}. Walk it off before bed.` },
    trigger: { seconds: 2 },
  });
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Weekday label list in operator order, for settings toggles. */
export const ALL_WEEKDAYS: Weekday[] = WEEKDAYS;
