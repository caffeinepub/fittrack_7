import { useCallback, useState } from "react";
import type { WorkoutSession, WorkoutTemplate } from "../types/workout";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  sessions: "fittrack_workout_sessions",
  templates: "fittrack_workout_templates",
  prs: "fittrack_exercise_prs",
  recentExercises: "fittrack_recent_exercises",
} as const;

// ─── PR type ──────────────────────────────────────────────────────────────────
export interface PRRecord {
  weightKg: number;
  reps: number;
  date: string;
  estimatedOneRM: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcEstimated1RM(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

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

// ─── useSessions ──────────────────────────────────────────────────────────────
export function useSessions() {
  const [sessions, setSessionsState] = useState<WorkoutSession[]>(() =>
    loadJSON<WorkoutSession[]>(STORAGE_KEYS.sessions, []),
  );

  const addSession = useCallback((session: WorkoutSession) => {
    setSessionsState((prev) => {
      const updated = [session, ...prev];
      saveJSON(STORAGE_KEYS.sessions, updated);
      return updated;
    });
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessionsState((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      saveJSON(STORAGE_KEYS.sessions, updated);
      return updated;
    });
  }, []);

  return { sessions, addSession, deleteSession };
}

// ─── useTemplates ─────────────────────────────────────────────────────────────
export function useTemplates() {
  const [templates, setTemplatesState] = useState<WorkoutTemplate[]>(() =>
    loadJSON<WorkoutTemplate[]>(STORAGE_KEYS.templates, []),
  );

  const addTemplate = useCallback((template: WorkoutTemplate) => {
    setTemplatesState((prev) => {
      const updated = [template, ...prev];
      saveJSON(STORAGE_KEYS.templates, updated);
      return updated;
    });
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplatesState((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      saveJSON(STORAGE_KEYS.templates, updated);
      return updated;
    });
  }, []);

  const incrementUsage = useCallback((id: string) => {
    setTemplatesState((prev) => {
      const updated = prev.map((t) =>
        t.id === id ? { ...t, usageCount: t.usageCount + 1 } : t,
      );
      saveJSON(STORAGE_KEYS.templates, updated);
      return updated;
    });
  }, []);

  return { templates, addTemplate, deleteTemplate, incrementUsage };
}

// ─── usePRs ───────────────────────────────────────────────────────────────────
export function usePRs() {
  const [prs, setPRsState] = useState<Record<string, PRRecord>>(() =>
    loadJSON<Record<string, PRRecord>>(STORAGE_KEYS.prs, {}),
  );

  /** Returns true if this is a new PR for the exercise */
  const checkAndUpdatePR = useCallback(
    (exerciseId: string, weightKg: number, reps: number): boolean => {
      const today = new Date().toISOString().split("T")[0];
      const newEstim = calcEstimated1RM(weightKg, reps);
      const existing = loadJSON<Record<string, PRRecord>>(STORAGE_KEYS.prs, {});
      const prev = existing[exerciseId];
      const prevEstim = prev ? calcEstimated1RM(prev.weightKg, prev.reps) : 0;

      if (newEstim > prevEstim) {
        const updated = {
          ...existing,
          [exerciseId]: {
            weightKg,
            reps,
            date: today,
            estimatedOneRM: newEstim,
          },
        };
        saveJSON(STORAGE_KEYS.prs, updated);
        setPRsState(updated);
        return true;
      }
      return false;
    },
    [],
  );

  return { prs, checkAndUpdatePR };
}

// ─── useRecentExercises ───────────────────────────────────────────────────────
export function useRecentExercises() {
  const [recentIds, setRecentIdsState] = useState<string[]>(() =>
    loadJSON<string[]>(STORAGE_KEYS.recentExercises, []),
  );

  const addRecentExercise = useCallback((exerciseId: string) => {
    setRecentIdsState((prev) => {
      const filtered = prev.filter((id) => id !== exerciseId);
      const updated = [exerciseId, ...filtered].slice(0, 10);
      saveJSON(STORAGE_KEYS.recentExercises, updated);
      return updated;
    });
  }, []);

  return { recentIds, addRecentExercise };
}

// ─── getLastSessionDataForExercise ───────────────────────────────────────────
/** Returns array of { weightKg, reps } from the most recent session that had this exercise */
export function getLastSessionDataForExercise(
  exerciseId: string,
): Array<{ weightKg: number; reps: number }> {
  const sessions = loadJSON<WorkoutSession[]>(STORAGE_KEYS.sessions, []);
  for (const session of sessions) {
    const ex = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (ex) {
      return ex.sets
        .filter((s) => s.completed)
        .map((s) => ({ weightKg: s.weightKg, reps: s.reps }));
    }
  }
  return [];
}
