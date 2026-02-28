import { useCallback, useState } from "react";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  habits: "fittrack_habits",
  habitLogs: "fittrack_habit_logs",
  waterLogs: "fittrack_water_logs",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Habit {
  id: string;
  name: string;
  icon: string;
  frequency: "daily" | "weekly";
  targetCount?: number;
  createdAt: number;
}

export interface HabitLog {
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  count: number;
}

export interface WaterEntry {
  id: string;
  ml: number;
  time: string; // HH:MM
}

export interface WaterDayLog {
  date: string; // YYYY-MM-DD
  entries: WaterEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage errors */
  }
}

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function genId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── useHabits ────────────────────────────────────────────────────────────────
export function useHabits() {
  const [habits, setHabitsState] = useState<Habit[]>(() =>
    loadJSON<Habit[]>(STORAGE_KEYS.habits, []),
  );

  const addHabit = useCallback((habit: Omit<Habit, "id" | "createdAt">) => {
    const newHabit: Habit = {
      ...habit,
      id: genId(),
      createdAt: Date.now(),
    };
    setHabitsState((prev) => {
      const updated = [...prev, newHabit];
      saveJSON(STORAGE_KEYS.habits, updated);
      return updated;
    });
    return newHabit;
  }, []);

  const deleteHabit = useCallback((id: string) => {
    setHabitsState((prev) => {
      const updated = prev.filter((h) => h.id !== id);
      saveJSON(STORAGE_KEYS.habits, updated);
      return updated;
    });
  }, []);

  const updateHabit = useCallback((id: string, updates: Partial<Habit>) => {
    setHabitsState((prev) => {
      const updated = prev.map((h) => (h.id === id ? { ...h, ...updates } : h));
      saveJSON(STORAGE_KEYS.habits, updated);
      return updated;
    });
  }, []);

  return { habits, addHabit, deleteHabit, updateHabit };
}

// ─── useHabitLogs ─────────────────────────────────────────────────────────────
export function useHabitLogs() {
  const [logs, setLogsState] = useState<HabitLog[]>(() =>
    loadJSON<HabitLog[]>(STORAGE_KEYS.habitLogs, []),
  );

  const toggleHabit = useCallback((habitId: string, date?: string) => {
    const targetDate = date || getTodayStr();
    setLogsState((prev) => {
      const existingIdx = prev.findIndex(
        (l) => l.habitId === habitId && l.date === targetDate,
      );
      let updated: HabitLog[];
      if (existingIdx >= 0) {
        // Toggle completion
        updated = prev.map((l, i) =>
          i === existingIdx ? { ...l, completed: !l.completed } : l,
        );
      } else {
        // Add new completed log
        updated = [
          ...prev,
          { habitId, date: targetDate, completed: true, count: 1 },
        ];
      }
      saveJSON(STORAGE_KEYS.habitLogs, updated);
      return updated;
    });
  }, []);

  const isCompletedToday = useCallback(
    (habitId: string) => {
      const today = getTodayStr();
      return logs.some(
        (l) => l.habitId === habitId && l.date === today && l.completed,
      );
    },
    [logs],
  );

  /** Returns array of 7 booleans: past 7 days completion status */
  const getLast7Days = useCallback(
    (habitId: string): boolean[] => {
      const result: boolean[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        result.push(
          logs.some(
            (l) => l.habitId === habitId && l.date === dateStr && l.completed,
          ),
        );
      }
      return result;
    },
    [logs],
  );

  /** Calculate streak for a habit */
  const getStreak = useCallback(
    (habitId: string): number => {
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const done = logs.some(
          (l) => l.habitId === habitId && l.date === dateStr && l.completed,
        );
        if (done) {
          streak++;
        } else {
          break;
        }
      }
      return streak;
    },
    [logs],
  );

  const getTodayLogs = useCallback(() => {
    const today = getTodayStr();
    return logs.filter((l) => l.date === today);
  }, [logs]);

  return {
    logs,
    toggleHabit,
    isCompletedToday,
    getLast7Days,
    getStreak,
    getTodayLogs,
  };
}

// ─── useWaterLogs ─────────────────────────────────────────────────────────────
export function useWaterLogs() {
  const [allLogs, setAllLogsState] = useState<WaterDayLog[]>(() =>
    loadJSON<WaterDayLog[]>(STORAGE_KEYS.waterLogs, []),
  );

  const getTodayLog = useCallback((): WaterDayLog => {
    const today = getTodayStr();
    return (
      allLogs.find((l) => l.date === today) ?? { date: today, entries: [] }
    );
  }, [allLogs]);

  const getTodayTotal = useCallback((): number => {
    return getTodayLog().entries.reduce((sum, e) => sum + e.ml, 0);
  }, [getTodayLog]);

  const addWater = useCallback((ml: number) => {
    const today = getTodayStr();
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const entry: WaterEntry = { id: genId(), ml, time };

    setAllLogsState((prev) => {
      const existingIdx = prev.findIndex((l) => l.date === today);
      let updated: WaterDayLog[];
      if (existingIdx >= 0) {
        updated = prev.map((l, i) =>
          i === existingIdx ? { ...l, entries: [...l.entries, entry] } : l,
        );
      } else {
        updated = [...prev, { date: today, entries: [entry] }];
      }
      saveJSON(STORAGE_KEYS.waterLogs, updated);
      return updated;
    });
  }, []);

  const removeWaterEntry = useCallback((entryId: string) => {
    const today = getTodayStr();
    setAllLogsState((prev) => {
      const updated = prev.map((l) =>
        l.date === today
          ? { ...l, entries: l.entries.filter((e) => e.id !== entryId) }
          : l,
      );
      saveJSON(STORAGE_KEYS.waterLogs, updated);
      return updated;
    });
  }, []);

  const resetTodayWater = useCallback(() => {
    const today = getTodayStr();
    setAllLogsState((prev) => {
      const updated = prev.map((l) =>
        l.date === today ? { ...l, entries: [] } : l,
      );
      saveJSON(STORAGE_KEYS.waterLogs, updated);
      return updated;
    });
  }, []);

  return {
    allLogs,
    getTodayLog,
    getTodayTotal,
    addWater,
    removeWaterEntry,
    resetTodayWater,
  };
}
