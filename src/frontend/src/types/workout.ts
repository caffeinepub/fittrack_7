export interface ExerciseSet {
  id: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  rpe?: number; // 1-10
  completed: boolean;
  isWarmup?: boolean;
}

export interface SessionExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  category: string;
  equipment: string;
  notes: string;
  sets: ExerciseSet[];
}

export interface WorkoutSession {
  id: string;
  name: string;
  date: string; // ISO date string YYYY-MM-DD
  startTime: number; // timestamp ms
  endTime: number; // timestamp ms
  durationSeconds: number;
  exercises: SessionExercise[];
  totalVolume: number; // sum of (weight * reps) for completed sets
  totalSets: number;
  notes: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  description: string;
  exercises: Array<{
    exerciseId: string;
    exerciseName: string;
    category: string;
    equipment: string;
    defaultSets: number;
    defaultReps: number;
    defaultWeightKg: number;
  }>;
  createdAt: number;
  usageCount: number;
}
