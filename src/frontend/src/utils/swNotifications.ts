/**
 * Utility helpers to communicate with the FitTrack Service Worker
 * for scheduling background notifications that fire even when the
 * browser tab is closed.
 */

async function getSW(): Promise<ServiceWorker | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  return reg?.active ?? null;
}

function postToSW(type: string, payload?: Record<string, unknown>) {
  getSW().then((sw) => {
    if (sw) sw.postMessage({ type, payload });
  });
}

export interface WaterReminderConfig {
  intervalHours: number;
  startHour: number;
  endHour: number;
  goalL: number;
}

export function scheduleWaterReminders(config: WaterReminderConfig) {
  postToSW(
    "SCHEDULE_WATER_REMINDERS",
    config as unknown as Record<string, unknown>,
  );
}

export function cancelWaterReminders() {
  postToSW("CANCEL_WATER_REMINDERS");
}

export interface HabitReminderConfig {
  habitId: string;
  habitName: string;
  habitEmoji: string;
  reminderTime: string; // "HH:MM"
}

export function scheduleHabitReminder(config: HabitReminderConfig) {
  postToSW(
    "SCHEDULE_HABIT_REMINDER",
    config as unknown as Record<string, unknown>,
  );
}

export function cancelHabitReminder(habitId: string) {
  postToSW("CANCEL_HABIT_REMINDER", { habitId });
}
