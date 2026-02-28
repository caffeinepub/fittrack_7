export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

export function scheduleMealReminder(
  hour: number,
  minute: number,
  meal: string,
): ReturnType<typeof setTimeout> {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target.getTime() - now.getTime();

  return setTimeout(() => {
    if (Notification.permission === "granted") {
      new Notification(`FitTrack — ${meal} Reminder`, {
        body: `Time to log your ${meal.toLowerCase()}! Stay on track 💪`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
      });
    }
    // Reschedule for next day
    scheduleMealReminder(hour, minute, meal);
  }, delay);
}

export interface MealReminder {
  meal: string;
  hour: number;
  minute: number;
  enabled: boolean;
}

export const DEFAULT_REMINDERS: MealReminder[] = [
  { meal: "Breakfast", hour: 8, minute: 0, enabled: false },
  { meal: "Lunch", hour: 13, minute: 0, enabled: false },
  { meal: "Dinner", hour: 20, minute: 0, enabled: false },
];

export function getReminders(): MealReminder[] {
  try {
    return JSON.parse(
      localStorage.getItem("meal_reminders") ||
        JSON.stringify(DEFAULT_REMINDERS),
    );
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export function saveReminders(reminders: MealReminder[]): void {
  localStorage.setItem("meal_reminders", JSON.stringify(reminders));
}
