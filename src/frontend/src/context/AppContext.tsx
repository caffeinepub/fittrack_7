import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type {
  FoodLog,
  UserProfile,
  WeightEntry,
  WorkoutLog,
} from "../backend.d";
import { useActor } from "../hooks/useActor";

// ─── Custom Recipe Type ────────────────────────────────────────────────────────
export interface CustomRecipe {
  id: string;
  name: string;
  servings: number;
  totalWeightG: number;
  totalCalories: number;
  caloriesPer100g: number;
  ingredients: Array<{
    name: string;
    grams: number;
    caloriesPer100g: number;
    calories: number;
  }>;
  createdAt: number;
}

// ─── localStorage keys ──────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  profile: "fittrack_profile",
  foodLogs: "fittrack_food_logs",
  workoutLogs: "fittrack_workout_logs",
  weightEntries: "fittrack_weight_entries",
  recipes: "fittrack_custom_recipes",
};

// ─── localStorage helpers ──────────────────────────────────────────────────────
function loadProfileFromStorage(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.profile);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      age: BigInt(parsed.age ?? 0),
      updatedAt: BigInt(parsed.updatedAt ?? 0),
    };
  } catch {
    return null;
  }
}

function saveProfileToStorage(profile: UserProfile) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.profile,
      JSON.stringify({
        ...profile,
        age: Number(profile.age),
        updatedAt: Number(profile.updatedAt),
      }),
    );
  } catch {
    /* ignore */
  }
}

// FoodLog has no BigInt fields, safe to JSON directly
function loadFoodLogsFromStorage(): FoodLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.foodLogs);
    if (!raw) return [];
    return JSON.parse(raw) as FoodLog[];
  } catch {
    return [];
  }
}

function saveFoodLogsToStorage(logs: FoodLog[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.foodLogs, JSON.stringify(logs));
  } catch {
    /* ignore */
  }
}

// WorkoutLog has durationMinutes as bigint — convert on save/load
function loadWorkoutLogsFromStorage(): WorkoutLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.workoutLogs);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<unknown>;
    return (parsed as Array<Record<string, unknown>>).map((l) => ({
      id: String(l.id),
      date: String(l.date),
      workoutName: String(l.workoutName),
      caloriesBurned: Number(l.caloriesBurned),
      durationMinutes: BigInt(String(l.durationMinutes)),
    }));
  } catch {
    return [];
  }
}

function saveWorkoutLogsToStorage(logs: WorkoutLog[]) {
  try {
    const serialized = logs.map((l) => ({
      ...l,
      durationMinutes: Number(l.durationMinutes),
    }));
    localStorage.setItem(STORAGE_KEYS.workoutLogs, JSON.stringify(serialized));
  } catch {
    /* ignore */
  }
}

// WeightEntry has no BigInt fields
function loadWeightEntriesFromStorage(): WeightEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.weightEntries);
    if (!raw) return [];
    return JSON.parse(raw) as WeightEntry[];
  } catch {
    return [];
  }
}

function saveWeightEntriesToStorage(entries: WeightEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.weightEntries, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

function loadRecipesFromStorage(): CustomRecipe[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.recipes);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveRecipesToStorage(recipes: CustomRecipe[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify(recipes));
  } catch {
    /* ignore */
  }
}

function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Context Interface ─────────────────────────────────────────────────────────
interface AppContextValue {
  // Profile
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
  // All logs (for progress calculations)
  allFoodLogs: FoodLog[];
  allWorkoutLogs: WorkoutLog[];
  // Today's logs (derived from allFoodLogs/allWorkoutLogs)
  todayFoodLogs: FoodLog[];
  todayWorkoutLogs: WorkoutLog[];
  // Weight entries
  weightEntries: WeightEntry[];
  // Custom recipes
  customRecipes: CustomRecipe[];
  addCustomRecipe: (recipe: CustomRecipe) => void;
  deleteCustomRecipe: (id: string) => void;
  // Loading state
  isLoading: boolean;
  // CRUD operations (localStorage-first, async backend sync)
  addFoodLog: (log: FoodLog) => Promise<void>;
  deleteFoodLog: (id: string) => Promise<void>;
  addWorkoutLog: (log: WorkoutLog) => Promise<void>;
  deleteWorkoutLog: (id: string) => Promise<void>;
  addWeightEntry: (entry: WeightEntry) => Promise<void>;
  deleteWeightEntry: (id: string) => Promise<void>;
  // Refresh functions (re-read from localStorage, optionally sync from backend)
  refreshFoodLogs: () => Promise<void>;
  refreshWorkoutLogs: () => Promise<void>;
  refreshWeightEntries: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Today's date string
  todayDate: string;
}

const AppContext = createContext<AppContextValue>({
  profile: null,
  setProfile: () => {},
  allFoodLogs: [],
  allWorkoutLogs: [],
  todayFoodLogs: [],
  todayWorkoutLogs: [],
  weightEntries: [],
  customRecipes: [],
  addCustomRecipe: () => {},
  deleteCustomRecipe: () => {},
  isLoading: false,
  addFoodLog: async () => {},
  deleteFoodLog: async () => {},
  addWorkoutLog: async () => {},
  deleteWorkoutLog: async () => {},
  addWeightEntry: async () => {},
  deleteWeightEntry: async () => {},
  refreshFoodLogs: async () => {},
  refreshWorkoutLogs: async () => {},
  refreshWeightEntries: async () => {},
  refreshProfile: async () => {},
  todayDate: "",
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { actor, isFetching: _isFetching } = useActor();
  const todayDate = getTodayDateString();

  // ── Initialize synchronously from localStorage (no loading spinner needed)
  const [profile, setProfileState] = useState<UserProfile | null>(
    loadProfileFromStorage,
  );
  const [allFoodLogs, setAllFoodLogs] = useState<FoodLog[]>(
    loadFoodLogsFromStorage,
  );
  const [allWorkoutLogs, setAllWorkoutLogs] = useState<WorkoutLog[]>(
    loadWorkoutLogsFromStorage,
  );
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>(
    loadWeightEntriesFromStorage,
  );
  const [customRecipes, setCustomRecipesState] = useState<CustomRecipe[]>(
    loadRecipesFromStorage,
  );
  const [isLoading, _setIsLoading] = useState(false); // No spinner — data is ready immediately

  // ── Derived: today's logs ──────────────────────────────────────────────────
  const todayFoodLogs = allFoodLogs.filter((l) => l.date === todayDate);
  const todayWorkoutLogs = allWorkoutLogs.filter((l) => l.date === todayDate);

  // ── Profile ────────────────────────────────────────────────────────────────
  const setProfile = useCallback((p: UserProfile) => {
    setProfileState(p);
    saveProfileToStorage(p);
  }, []);

  const refreshProfile = useCallback(async () => {
    // Profile is device-local only — never pull from shared backend.
    // Just re-read from localStorage to keep state in sync.
    const local = loadProfileFromStorage();
    if (local) setProfileState(local);
  }, []);

  // ── Food Logs ──────────────────────────────────────────────────────────────
  const addFoodLog = useCallback(
    async (log: FoodLog) => {
      // Immediate localStorage + state update
      setAllFoodLogs((prev) => {
        const updated = [...prev, log];
        saveFoodLogsToStorage(updated);
        return updated;
      });
      // Async backend sync — fire and forget
      if (actor) {
        actor.addFoodLog(log).catch(() => {
          /* backend unavailable — already in localStorage */
        });
      }
    },
    [actor],
  );

  const deleteFoodLog = useCallback(
    async (id: string) => {
      setAllFoodLogs((prev) => {
        const updated = prev.filter((l) => l.id !== id);
        saveFoodLogsToStorage(updated);
        return updated;
      });
      if (actor) {
        actor.deleteFoodLog(id).catch(() => {});
      }
    },
    [actor],
  );

  const refreshFoodLogs = useCallback(async () => {
    // Device-local only — no backend pull to avoid mixing data between users.
    const local = loadFoodLogsFromStorage();
    setAllFoodLogs(local);
  }, []);

  // ── Workout Logs ───────────────────────────────────────────────────────────
  const addWorkoutLog = useCallback(
    async (log: WorkoutLog) => {
      setAllWorkoutLogs((prev) => {
        const updated = [...prev, log];
        saveWorkoutLogsToStorage(updated);
        return updated;
      });
      if (actor) {
        actor.addWorkoutLog(log).catch(() => {});
      }
    },
    [actor],
  );

  const deleteWorkoutLog = useCallback(
    async (id: string) => {
      setAllWorkoutLogs((prev) => {
        const updated = prev.filter((l) => l.id !== id);
        saveWorkoutLogsToStorage(updated);
        return updated;
      });
      if (actor) {
        actor.deleteWorkoutLog(id).catch(() => {});
      }
    },
    [actor],
  );

  const refreshWorkoutLogs = useCallback(async () => {
    // Device-local only — no backend pull to avoid mixing data between users.
    const local = loadWorkoutLogsFromStorage();
    setAllWorkoutLogs(local);
  }, []);

  // ── Weight Entries ─────────────────────────────────────────────────────────
  const addWeightEntry = useCallback(
    async (entry: WeightEntry) => {
      setWeightEntries((prev) => {
        const updated = [...prev, entry].sort((a, b) =>
          a.date.localeCompare(b.date),
        );
        saveWeightEntriesToStorage(updated);
        return updated;
      });
      if (actor) {
        actor.addWeightEntry(entry).catch(() => {});
      }
    },
    [actor],
  );

  const deleteWeightEntry = useCallback(
    async (id: string) => {
      setWeightEntries((prev) => {
        const updated = prev.filter((e) => e.id !== id);
        saveWeightEntriesToStorage(updated);
        return updated;
      });
      if (actor) {
        actor.deleteWeightEntry(id).catch(() => {});
      }
    },
    [actor],
  );

  const refreshWeightEntries = useCallback(async () => {
    // Device-local only — no backend pull to avoid mixing data between users.
    const local = loadWeightEntriesFromStorage();
    setWeightEntries(local.sort((a, b) => a.date.localeCompare(b.date)));
  }, []);

  // ── Custom Recipes ─────────────────────────────────────────────────────────
  const addCustomRecipe = useCallback((recipe: CustomRecipe) => {
    setCustomRecipesState((prev) => {
      const updated = [recipe, ...prev];
      saveRecipesToStorage(updated);
      return updated;
    });
  }, []);

  const deleteCustomRecipe = useCallback((id: string) => {
    setCustomRecipesState((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      saveRecipesToStorage(updated);
      return updated;
    });
  }, []);

  // ── NO backend sync — all data is device-local (localStorage only) ──────────
  // Syncing from the shared backend canister would cause different users'
  // data to overwrite each other. Each device manages its own data.
  // The isFetching/actor variables are kept for API calls (add/delete) but
  // we deliberately skip the initial pull from backend.
  useEffect(() => {
    // intentionally empty — no backend sync on load
  }, []);

  return (
    <AppContext.Provider
      value={{
        profile,
        setProfile,
        allFoodLogs,
        allWorkoutLogs,
        todayFoodLogs,
        todayWorkoutLogs,
        weightEntries,
        customRecipes,
        addCustomRecipe,
        deleteCustomRecipe,
        isLoading,
        addFoodLog,
        deleteFoodLog,
        addWorkoutLog,
        deleteWorkoutLog,
        addWeightEntry,
        deleteWeightEntry,
        refreshFoodLogs,
        refreshWorkoutLogs,
        refreshWeightEntries,
        refreshProfile,
        todayDate,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
