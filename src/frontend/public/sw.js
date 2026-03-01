/* FitTrack Service Worker — Background Notifications v4
 *
 * Strategy:
 *  1. Store reminder configs in SW Cache Storage (persists across SW restarts).
 *  2. On every SW startup (install/activate/fetch wake), arm setTimeout timers.
 *  3. On periodic background sync (Chrome Android), fire due reminders.
 *  4. The app re-sends all reminder configs on every open/focus, so timers
 *     are always fresh even after the OS kills the SW.
 *
 * This gives three independent trigger paths so at least one will fire:
 *   A) setTimeout while SW is alive (tab open or PWA running)
 *   B) Periodic background sync wakes SW ~every 15-60 min
 *   C) App re-arms on next open (catches any missed notifications)
 */

const CACHE_NAME = "fittrack-sw-v4";
const CONFIG_KEY = "fittrack-reminder-config-v4";

// ── Persistent config via Cache API ───────────────────────────────────────────
async function saveConfig(config) {
  const cache = await caches.open(CACHE_NAME);
  const response = new Response(JSON.stringify(config), {
    headers: { "Content-Type": "application/json" },
  });
  await cache.put(CONFIG_KEY, response);
}

async function loadConfig() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(CONFIG_KEY);
    if (!response) return { water: null, habits: {} };
    return await response.json();
  } catch {
    return { water: null, habits: {} };
  }
}

// ── In-memory scheduled timers (while SW is alive) ───────────────────────────
const scheduledTimers = {};

function clearTimers(prefix) {
  Object.keys(scheduledTimers).forEach((k) => {
    if (k.startsWith(prefix)) {
      clearTimeout(scheduledTimers[k]);
      delete scheduledTimers[k];
    }
  });
}

// ── SW lifecycle ──────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Arm timers immediately on install
  event.waitUntil(armAllTimers());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(() => {
      // On activation, reload config and arm timers
      return armAllTimers();
    })
  );
});

// Wake up SW on any fetch (keeps timers alive while app is open)
self.addEventListener("fetch", () => {
  // No-op: just keeps SW alive so timers don't die while app is in foreground
});

// ── Message handler (called from the app) ─────────────────────────────────────
self.addEventListener("message", (event) => {
  const { type, payload } = event.data || {};

  if (type === "SCHEDULE_WATER_REMINDERS") {
    handleScheduleWater(payload);
  } else if (type === "CANCEL_WATER_REMINDERS") {
    handleCancelWater();
  } else if (type === "SCHEDULE_HABIT_REMINDER") {
    handleScheduleHabit(payload);
  } else if (type === "CANCEL_HABIT_REMINDER") {
    handleCancelHabit(payload.habitId);
  } else if (type === "CHECK_DUE_NOW") {
    // Called by the app on page focus / visibility change
    checkAndFireDueReminders();
  }
});

// ── Periodic Background Sync (Chrome Android) ────────────────────────────────
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "fittrack-reminders") {
    event.waitUntil(
      checkAndFireDueReminders().then(() => armAllTimers())
    );
  }
});

// ── Push event (future use) ───────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    showNotification(data.title || "FitTrack Reminder", {
      body: data.body || "",
      tag: data.tag || "fittrack",
    })
  );
});

// ── Water: schedule ───────────────────────────────────────────────────────────
async function handleScheduleWater(payload) {
  clearTimers("water_");
  const config = await loadConfig();
  config.water = payload;
  await saveConfig(config);
  armWaterTimers(payload);
}

async function handleCancelWater() {
  clearTimers("water_");
  const config = await loadConfig();
  config.water = null;
  await saveConfig(config);
}

function armWaterTimers(payload) {
  if (!payload) return;
  const { intervalHours, startHour, endHour, goalL } = payload;
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const now = new Date();

  // Schedule up to 20 upcoming reminders within today's window
  let next = new Date(now.getTime() + intervalMs);
  let count = 0;
  for (let i = 0; i < 30 && count < 20; i++) {
    const h = next.getHours();
    if (h >= startHour && h < endHour) {
      const delay = next.getTime() - Date.now();
      if (delay > 0 && delay < 48 * 60 * 60 * 1000) {
        const key = `water_${i}`;
        scheduledTimers[key] = setTimeout(async () => {
          delete scheduledTimers[key];
          // Check if still enabled before firing
          const cfg = await loadConfig();
          if (cfg.water) {
            await showNotification("💧 Water Reminder — FitTrack", {
              body: `Stay hydrated! Daily goal: ${goalL}L`,
              tag: "water-reminder",
              renotify: true,
            });
            // Re-arm next water timer after firing
            armWaterTimers(cfg.water);
          }
        }, delay);
        count++;
      }
    }
    next = new Date(next.getTime() + intervalMs);
  }
}

// ── Habit: schedule ───────────────────────────────────────────────────────────
async function handleScheduleHabit(payload) {
  const { habitId } = payload;
  clearTimers(`habit_${habitId}`);
  const config = await loadConfig();
  if (!config.habits) config.habits = {};
  config.habits[habitId] = payload;
  await saveConfig(config);
  armHabitTimer(payload);
}

async function handleCancelHabit(habitId) {
  clearTimers(`habit_${habitId}`);
  const config = await loadConfig();
  if (config.habits) delete config.habits[habitId];
  await saveConfig(config);
}

function armHabitTimer(payload) {
  if (!payload || !payload.reminderTime) return;
  const { habitId, habitName, habitEmoji, reminderTime } = payload;
  clearTimers(`habit_${habitId}`);

  const [hStr, mStr] = reminderTime.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);

  const now = new Date();
  let target = new Date(now);
  target.setHours(h, m, 0, 0);

  // If time already passed today, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target.getTime() - now.getTime();
  const key = `habit_${habitId}_next`;

  console.log(
    `[FitTrack SW] Arming habit "${habitName}" at ${reminderTime}, delay: ${Math.round(delay / 60000)}min`
  );

  scheduledTimers[key] = setTimeout(async () => {
    delete scheduledTimers[key];
    const cfg = await loadConfig();
    if (cfg.habits && cfg.habits[habitId]) {
      await showNotification(`${habitEmoji || "✅"} Habit Reminder — FitTrack`, {
        body: `Time to complete: ${habitName}`,
        tag: `habit-${habitId}`,
        renotify: true,
      });
      // Re-arm for next day automatically
      armHabitTimer(payload);
    }
  }, delay);
}

// ── Arm all timers from persisted config (called on SW restart) ───────────────
async function armAllTimers() {
  const config = await loadConfig();
  if (config.water) armWaterTimers(config.water);
  if (config.habits) {
    Object.values(config.habits).forEach((h) => armHabitTimer(h));
  }
}

// ── Check & fire reminders that are due RIGHT NOW ─────────────────────────────
// Used on periodic sync / page focus wake — catches any missed notifications.
async function checkAndFireDueReminders() {
  const config = await loadConfig();
  const now = new Date();
  const nowH = now.getHours();
  const nowM = now.getMinutes();

  // Water: fire if current time is on a reminder interval
  if (config.water) {
    const { intervalHours, startHour, endHour, goalL } = config.water;
    if (nowH >= startHour && nowH < endHour) {
      const totalMin = nowH * 60 + nowM;
      const startMin = startHour * 60;
      const elapsed = totalMin - startMin;
      const intervalMin = intervalHours * 60;
      // Fire if within 3-minute window of a scheduled slot
      if (elapsed % intervalMin <= 3) {
        await showNotification("💧 Water Reminder — FitTrack", {
          body: `Stay hydrated! Daily goal: ${goalL}L`,
          tag: "water-reminder",
          renotify: true,
        });
      }
    }
  }

  // Habits: fire if current time matches reminder time (within 3 min)
  if (config.habits) {
    for (const h of Object.values(config.habits)) {
      if (!h || !h.reminderTime) continue;
      const [hStr, mStr] = h.reminderTime.split(":");
      const rh = parseInt(hStr, 10);
      const rm = parseInt(mStr, 10);
      if (nowH === rh && Math.abs(nowM - rm) <= 3) {
        await showNotification(
          `${h.habitEmoji || "✅"} Habit Reminder — FitTrack`,
          {
            body: `Time to complete: ${h.habitName}`,
            tag: `habit-${h.habitId}`,
            renotify: true,
          }
        );
      }
    }
  }
}

// ── Helper: show notification safely ─────────────────────────────────────────
async function showNotification(title, options) {
  try {
    await self.registration.showNotification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      vibrate: [200, 100, 200],
      requireInteraction: false,
      actions: [{ action: "dismiss", title: "Got it" }],
      ...options,
    });
  } catch (e) {
    console.warn("[FitTrack SW] showNotification failed:", e);
  }
}

// ── Notification click ─────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
