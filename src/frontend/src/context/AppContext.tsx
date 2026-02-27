import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useActor } from "../hooks/useActor";
import type { UserProfile, FoodLog, WorkoutLog, WeightEntry } from "../backend.d";

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

// ─── localStorage helpers ──────────────────────────────────────────────────────
function loadProfileFromStorage(): UserProfile | null {
  try {
    const raw = localStorage.getItem("fittrack_profile");
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

function loadRecipesFromStorage(): CustomRecipe[] {
  try {
    const raw = localStorage.getItem("fittrack_custom_recipes");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveRecipesToStorage(recipes: CustomRecipe[]) {
  try {
    localStorage.setItem("fittrack_custom_recipes", JSON.stringify(recipes));
  } catch { /* ignore */ }
}

// ─── Context Interface ─────────────────────────────────────────────────────────
interface AppContextValue {
  // Profile
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
  // Today's logs
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
  // Refresh functions
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
  todayFoodLogs: [],
  todayWorkoutLogs: [],
  weightEntries: [],
  customRecipes: [],
  addCustomRecipe: () => {},
  deleteCustomRecipe: () => {},
  isLoading: true,
  refreshFoodLogs: async () => {},
  refreshWorkoutLogs: async () => {},
  refreshWeightEntries: async () => {},
  refreshProfile: async () => {},
  todayDate: "",
});

function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { actor, isFetching } = useActor();

  // Initialize profile from localStorage immediately (avoids redirect flicker)
  const [profile, setProfileState] = useState<UserProfile | null>(loadProfileFromStorage);
  const [todayFoodLogs, setTodayFoodLogs] = useState<FoodLog[]>([]);
  const [todayWorkoutLogs, setTodayWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [customRecipes, setCustomRecipesState] = useState<CustomRecipe[]>(loadRecipesFromStorage);
  const [isLoading, setIsLoading] = useState(true);
  const todayDate = getTodayDateString();

  // ── Profile ────────────────────────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    if (!actor) return;
    try {
      const raw = await actor.getProfile();
      // Motoko optional comes as array from Candid: [UserProfile] | []
      const p = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
      if (p) {
        setProfileState(p);
        try {
          localStorage.setItem("fittrack_profile", JSON.stringify({
            ...p,
            age: Number(p.age),
            updatedAt: Number(p.updatedAt),
          }));
        } catch { /* ignore */ }
      } else {
        // Actor returned null/empty — keep whatever we have from localStorage
        const cached = loadProfileFromStorage();
        if (cached) setProfileState(cached);
      }
    } catch {
      // Network error — fall back to cached
      const cached = loadProfileFromStorage();
      if (cached) setProfileState(cached);
    }
  }, [actor]);

  const setProfile = (profile: UserProfile) => {
    setProfileState(profile);
    try {
      localStorage.setItem("fittrack_profile", JSON.stringify({
        ...profile,
        age: Number(profile.age),
        updatedAt: Number(profile.updatedAt),
      }));
    } catch { /* ignore */ }
  };

  // ── Food Logs ──────────────────────────────────────────────────────────────
  const refreshFoodLogs = useCallback(async () => {
    if (!actor) return;
    try {
      const logs = await actor.getFoodLogs(todayDate);
      setTodayFoodLogs(logs);
    } catch {
      setTodayFoodLogs([]);
    }
  }, [actor, todayDate]);

  // ── Workout Logs ───────────────────────────────────────────────────────────
  const refreshWorkoutLogs = useCallback(async () => {
    if (!actor) return;
    try {
      const logs = await actor.getWorkoutLogs(todayDate);
      setTodayWorkoutLogs(logs);
    } catch {
      setTodayWorkoutLogs([]);
    }
  }, [actor, todayDate]);

  // ── Weight Entries ─────────────────────────────────────────────────────────
  const refreshWeightEntries = useCallback(async () => {
    if (!actor) return;
    try {
      const entries = await actor.getWeightEntries();
      setWeightEntries(entries.sort((a, b) => a.date.localeCompare(b.date)));
    } catch {
      setWeightEntries([]);
    }
  }, [actor]);

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

  // ── Boot load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isFetching || !actor) return;

    const loadAll = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          refreshProfile(),
          refreshFoodLogs(),
          refreshWorkoutLogs(),
          refreshWeightEntries(),
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    loadAll();
  }, [actor, isFetching, refreshProfile, refreshFoodLogs, refreshWorkoutLogs, refreshWeightEntries]);

  return (
    <AppContext.Provider
      value={{
        profile,
        setProfile,
        todayFoodLogs,
        todayWorkoutLogs,
        weightEntries,
        customRecipes,
        addCustomRecipe,
        deleteCustomRecipe,
        isLoading,
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
