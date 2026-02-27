import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface WorkoutLog {
    id: string;
    date: string;
    durationMinutes: bigint;
    caloriesBurned: number;
    workoutName: string;
}
export interface FoodLog {
    id: string;
    date: string;
    totalCalories: number;
    grams: number;
    caloriesPer100g: number;
    mealType: string;
    foodName: string;
}
export interface WeightEntry {
    id: string;
    bmi: number;
    date: string;
    weightKg: number;
}
export interface UserProfile {
    age: bigint;
    heightCm: number;
    name: string;
    updatedAt: bigint;
    weightKg: number;
    gender: string;
}
export interface backendInterface {
    addFoodLog(log: FoodLog): Promise<void>;
    addWeightEntry(entry: WeightEntry): Promise<void>;
    addWorkoutLog(log: WorkoutLog): Promise<void>;
    deleteFoodLog(id: string): Promise<void>;
    deleteWeightEntry(id: string): Promise<void>;
    deleteWorkoutLog(id: string): Promise<void>;
    getAllFoodLogs(): Promise<Array<FoodLog>>;
    getAllWorkoutLogs(): Promise<Array<WorkoutLog>>;
    getFoodLogs(date: string): Promise<Array<FoodLog>>;
    getProfile(): Promise<UserProfile | null>;
    getWeightEntries(): Promise<Array<WeightEntry>>;
    getWorkoutLogs(date: string): Promise<Array<WorkoutLog>>;
    setProfile(profile: UserProfile): Promise<void>;
}
