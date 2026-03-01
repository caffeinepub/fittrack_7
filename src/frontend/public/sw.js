/* FitTrack Service Worker — Background Notifications */
const CACHE_NAME = "fittrack-sw-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Listen for messages from the app to schedule notifications
self.addEventListener("message", (event) => {
  const { type, payload } = event.data || {};

  if (type === "SCHEDULE_WATER_REMINDERS") {
    scheduleWaterReminders(payload);
  } else if (type === "CANCEL_WATER_REMINDERS") {
    cancelWaterReminders();
  } else if (type === "SCHEDULE_HABIT_REMINDER") {
    scheduleHabitReminder(payload);
  } else if (type === "CANCEL_HABIT_REMINDER") {
    cancelHabitReminder(payload.habitId);
  }
});

// Store scheduled timeouts (keyed by id)
const scheduledTimers = {};

function cancelAll(prefix) {
  Object.keys(scheduledTimers).forEach((k) => {
    if (k.startsWith(prefix)) {
      clearTimeout(scheduledTimers[k]);
      delete scheduledTimers[k];
    }
  });
}

// ── Water Reminders ────────────────────────────────────────────────────────────
function cancelWaterReminders() {
  cancelAll("water_");
}

function scheduleWaterReminders(payload) {
  const { intervalHours, startHour, endHour, goalL } = payload;
  cancelWaterReminders();

  const intervalMs = intervalHours * 60 * 60 * 1000;
  const now = new Date();

  // Schedule up to 24 reminders from now to endHour today/tomorrow
  let next = new Date(now.getTime() + intervalMs);
  for (let i = 0; i < 24; i++) {
    const h = next.getHours();
    if (h >= startHour && h < endHour) {
      const delay = next.getTime() - Date.now();
      if (delay > 0) {
        const key = `water_${i}`;
        scheduledTimers[key] = setTimeout(() => {
          self.registration.showNotification("💧 Water Reminder — FitTrack", {
            body: `Stay hydrated! Daily goal: ${goalL}L`,
            icon: "/favicon.ico",
            badge: "/favicon.ico",
            tag: "water-reminder",
            renotify: true,
            vibrate: [200, 100, 200],
            actions: [{ action: "dismiss", title: "Got it" }],
          });
          delete scheduledTimers[key];
        }, delay);
      }
    }
    next = new Date(next.getTime() + intervalMs);
  }
}

// ── Habit Reminders ────────────────────────────────────────────────────────────
function cancelHabitReminder(habitId) {
  cancelAll(`habit_${habitId}`);
}

function scheduleHabitReminder(payload) {
  const { habitId, habitName, habitEmoji, reminderTime } = payload;
  cancelHabitReminder(habitId);

  if (!reminderTime) return;

  const [hStr, mStr] = reminderTime.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);

  const now = new Date();
  let target = new Date(now);
  target.setHours(h, m, 0, 0);

  // If the time has already passed today, schedule for tomorrow
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target.getTime() - Date.now();
  const key = `habit_${habitId}_0`;
  scheduledTimers[key] = setTimeout(() => {
    self.registration.showNotification(
      `${habitEmoji || "✅"} Habit Reminder — FitTrack`,
      {
        body: `Time to complete: ${habitName}`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: `habit-${habitId}`,
        renotify: true,
        vibrate: [200, 100, 200],
        actions: [{ action: "dismiss", title: "Done!" }],
      }
    );
    delete scheduledTimers[key];

    // Re-schedule for the same time next day
    scheduleHabitReminder(payload);
  }, delay);
}

// Handle notification clicks — open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      // Focus existing tab if open
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
