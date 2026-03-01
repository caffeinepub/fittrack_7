import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";
import App from "./App";
import { InternetIdentityProvider } from "./hooks/useInternetIdentity";
import "../index.css";

BigInt.prototype.toJSON = function () {
  return this.toString();
};

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

// ── Service Worker Registration ───────────────────────────────────────────────
// Must be registered BEFORE the app renders so reminders work from PWA launch.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (reg) => {
        console.log("[FitTrack] SW registered:", reg.scope);

        // Register periodic background sync (Chrome Android) — wakes SW ~hourly
        // even when the PWA is fully closed.
        try {
          // @ts-ignore — periodicSync not yet in TS lib
          if ("periodicSync" in reg) {
            const status = await navigator.permissions.query({
              // @ts-ignore — periodic-background-sync not in TS PermissionName
              name: "periodic-background-sync" as PermissionName,
            });
            if (status.state === "granted") {
              // @ts-ignore
              await reg.periodicSync.register("fittrack-reminders", {
                minInterval: 15 * 60 * 1000, // 15 min
              });
              console.log("[FitTrack] Periodic background sync registered");
            }
          }
        } catch (e) {
          // periodicSync not supported — fall back to setTimeout in SW
          console.log("[FitTrack] periodicSync not supported:", e);
        }

        // Re-arm all saved reminders in SW every time the app opens.
        // This ensures timers survive PWA kills / SW restarts.
        await navigator.serviceWorker.ready;
        const sw = reg.active || reg.installing || reg.waiting;
        if (sw) {
          // Load reminder configs from localStorage and re-send to SW
          reArmRemindersInSW(sw);
        }
        // Also re-arm after SW activates (in case it was updating)
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          const ctrl = navigator.serviceWorker.controller;
          if (ctrl) reArmRemindersInSW(ctrl);
        });
      })
      .catch((err) => console.warn("[FitTrack] SW registration failed:", err));
  });

  // Re-arm when app comes back to foreground (PWA resume)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const ctrl = navigator.serviceWorker.controller;
      if (ctrl) {
        ctrl.postMessage({ type: "CHECK_DUE_NOW" });
        reArmRemindersInSW(ctrl);
      }
    }
  });
}

/**
 * Read all reminder configs from localStorage and re-send them to the SW.
 * Called on every app open/focus so the SW always has live timers even after
 * being terminated by the OS.
 *
 * localStorage keys (from useHabitStorage.ts):
 *   fittrack_reminders  → { water: WaterReminderSettings, habits: HabitReminder[] }
 *   fittrack_habits     → Habit[]
 *   fittrack_profile    → Profile
 */
function reArmRemindersInSW(sw: ServiceWorker) {
  try {
    const reminderRaw = localStorage.getItem("fittrack_reminders");
    const habitsRaw = localStorage.getItem("fittrack_habits");

    if (reminderRaw) {
      const settings = JSON.parse(reminderRaw) as {
        water?: {
          enabled?: boolean;
          intervalHours?: number;
          startHour?: number;
          endHour?: number;
        };
        habits?: Array<{ habitId: string; enabled: boolean; time: string }>;
      };

      // ── Water reminders ────────────────────────────────────────────────────
      if (settings?.water?.enabled) {
        let goalL = 2.0;
        try {
          const profileRaw = localStorage.getItem("fittrack_profile");
          if (profileRaw) {
            const profile = JSON.parse(profileRaw);
            const w = Number(profile.weightKg) || 70;
            goalL = Math.round(Math.max(1500, Math.min(4000, w * 35))) / 1000;
          }
        } catch {}
        sw.postMessage({
          type: "SCHEDULE_WATER_REMINDERS",
          payload: {
            intervalHours: settings.water.intervalHours ?? 2,
            startHour: settings.water.startHour ?? 8,
            endHour: settings.water.endHour ?? 22,
            goalL,
          },
        });
      }

      // ── Habit reminders ────────────────────────────────────────────────────
      if (settings?.habits?.length && habitsRaw) {
        const habits = JSON.parse(habitsRaw) as Array<{
          id: string;
          name: string;
          icon: string;
        }>;
        for (const rem of settings.habits) {
          if (!rem.enabled || !rem.time) continue;
          const habit = habits.find((h) => h.id === rem.habitId);
          if (!habit) continue;
          sw.postMessage({
            type: "SCHEDULE_HABIT_REMINDER",
            payload: {
              habitId: rem.habitId,
              habitName: habit.name,
              habitEmoji: habit.icon,
              reminderTime: rem.time,
            },
          });
        }
      }
    }
  } catch (e) {
    console.warn("[FitTrack] reArmRemindersInSW error:", e);
  }
}

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <InternetIdentityProvider>
      <App />
    </InternetIdentityProvider>
  </QueryClientProvider>,
);
