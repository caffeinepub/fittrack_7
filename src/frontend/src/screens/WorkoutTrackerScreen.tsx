import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  Flame,
  Loader2,
  Plus,
  Timer,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React, { useState } from "react";
import { toast } from "sonner";
import type { WorkoutLog } from "../backend.d";
import { useAppContext } from "../context/AppContext";
import { useActor } from "../hooks/useActor";

const WORKOUT_SUGGESTIONS = [
  "Running",
  "Walking",
  "Cycling",
  "Swimming",
  "Yoga",
  "Weight Training",
  "HIIT",
  "Basketball",
  "Football",
  "Jump Rope",
  "Pilates",
  "Zumba",
];

const WORKOUT_ICONS: Record<string, string> = {
  Running: "🏃",
  Walking: "🚶",
  Cycling: "🚴",
  Swimming: "🏊",
  Yoga: "🧘",
  "Weight Training": "🏋️",
  HIIT: "⚡",
  Basketball: "🏀",
  Football: "⚽",
  "Jump Rope": "🪢",
  Pilates: "🤸",
  Zumba: "💃",
};

const DEFAULT_CALORIES: Record<string, number> = {
  Running: 10,
  Walking: 5,
  Cycling: 8,
  Swimming: 9,
  Yoga: 4,
  "Weight Training": 6,
  HIIT: 12,
  Basketball: 9,
  Football: 8,
  "Jump Rope": 11,
  Pilates: 5,
  Zumba: 7,
};

function getWeekDays(): { date: string; label: string; shortDate: string }[] {
  const days: { date: string; label: string; shortDate: string }[] = [];
  const today = new Date();
  // Start from Monday of this week
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      date: d.toISOString().split("T")[0],
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      shortDate: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    });
  }
  return days;
}

export default function WorkoutTrackerScreen() {
  const { todayWorkoutLogs, addWorkoutLog, deleteWorkoutLog, todayDate } =
    useAppContext();
  const { actor } = useActor(); // still needed for weekly summary (past days)
  const [workoutName, setWorkoutName] = useState("");
  const [duration, setDuration] = useState("");
  const [caloriesBurned, setCaloriesBurned] = useState("");
  const [adding, setAdding] = useState(false);
  const [weeklyLogs, setWeeklyLogs] = useState<Record<string, WorkoutLog[]>>(
    {},
  );
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [showWeekly, setShowWeekly] = useState(false);

  const weekDays = getWeekDays();

  const totalDurationToday = todayWorkoutLogs.reduce(
    (s, l) => s + Number(l.durationMinutes),
    0,
  );
  const totalBurnedToday = todayWorkoutLogs.reduce(
    (s, l) => s + l.caloriesBurned,
    0,
  );

  const handleSelectSuggestion = (name: string) => {
    setWorkoutName(name);
    if (duration) {
      const cal = DEFAULT_CALORIES[name] || 7;
      setCaloriesBurned(String(Math.round(cal * Number.parseInt(duration))));
    }
  };

  const handleDurationChange = (val: string) => {
    setDuration(val);
    if (workoutName && val) {
      const cal = DEFAULT_CALORIES[workoutName] || 7;
      setCaloriesBurned(String(Math.round(cal * Number.parseInt(val))));
    }
  };

  const handleAddWorkout = async () => {
    if (!workoutName.trim()) {
      toast.error("Please enter a workout name");
      return;
    }
    if (!duration || Number.parseInt(duration) <= 0) {
      toast.error("Please enter a valid duration");
      return;
    }
    if (!caloriesBurned || Number.parseInt(caloriesBurned) < 0) {
      toast.error("Please enter calories burned");
      return;
    }

    setAdding(true);
    try {
      const log: WorkoutLog = {
        id: `workout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: todayDate,
        workoutName: workoutName.trim(),
        durationMinutes: BigInt(Number.parseInt(duration)),
        caloriesBurned: Number.parseInt(caloriesBurned),
      };
      await addWorkoutLog(log);
      toast.success(`${workoutName} logged! 💪`);
      setWorkoutName("");
      setDuration("");
      setCaloriesBurned("");
    } catch {
      toast.error("Failed to add workout log");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteWorkoutLog(id);
      toast.success(`${name} removed`);
    } catch {
      toast.error("Failed to remove workout");
    }
  };

  const loadWeeklySummary = async () => {
    if (!actor || weeklyLoading) return;
    setWeeklyLoading(true);
    try {
      const results = await Promise.all(
        weekDays.map(async (day) => {
          const logs = await actor.getWorkoutLogs(day.date);
          return { date: day.date, logs };
        }),
      );
      const logsMap: Record<string, WorkoutLog[]> = {};
      for (const { date, logs } of results) {
        logsMap[date] = logs;
      }
      setWeeklyLogs(logsMap);
    } catch {
      toast.error("Failed to load weekly summary");
    } finally {
      setWeeklyLoading(false);
    }
  };

  const handleToggleWeekly = async () => {
    if (!showWeekly && Object.keys(weeklyLogs).length === 0) {
      await loadWeeklySummary();
    }
    setShowWeekly((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-background scroll-area-content overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <h1 className="font-display text-xl font-bold text-foreground">
          Workout Tracker
        </h1>
        <div className="flex gap-4 mt-1">
          <div className="flex items-center gap-1.5">
            <Timer size={12} className="text-primary" />
            <span className="text-xs text-muted-foreground">
              {totalDurationToday} min today
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Flame size={12} className="text-orange-500" />
            <span className="text-xs text-muted-foreground">
              {totalBurnedToday} kcal burned
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Add Workout Form */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <Dumbbell size={14} className="text-orange-500" />
            </div>
            <h2 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider">
              Log Workout
            </h2>
          </div>

          {/* Suggestions */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Quick select</p>
            <div className="flex gap-2 flex-wrap">
              {WORKOUT_SUGGESTIONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelectSuggestion(name)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                    workoutName === name
                      ? "bg-orange-500/20 text-orange-500 border border-orange-500/30"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/70 border border-transparent"
                  }`}
                >
                  <span>{WORKOUT_ICONS[name] || "🏃"}</span>
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Workout name input */}
          <div>
            <label
              htmlFor="workout-name"
              className="text-xs font-medium text-muted-foreground mb-1.5 block"
            >
              Workout Name
            </label>
            <Input
              id="workout-name"
              placeholder="e.g. Morning Run"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              className="h-11 bg-secondary/50 border-border focus:border-primary rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="workout-duration"
                className="text-xs font-medium text-muted-foreground mb-1.5 block"
              >
                Duration (min)
              </label>
              <div className="relative">
                <Clock
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="workout-duration"
                  type="number"
                  placeholder="30"
                  value={duration}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="h-11 pl-9 bg-secondary/50 border-border focus:border-primary rounded-xl"
                  min={1}
                  max={600}
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="workout-calories"
                className="text-xs font-medium text-muted-foreground mb-1.5 block"
              >
                Calories Burned
              </label>
              <div className="relative">
                <Flame
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="workout-calories"
                  type="number"
                  placeholder="250"
                  value={caloriesBurned}
                  onChange={(e) => setCaloriesBurned(e.target.value)}
                  className="h-11 pl-9 bg-secondary/50 border-border focus:border-primary rounded-xl"
                  min={0}
                />
              </div>
            </div>
          </div>

          <Button
            onClick={handleAddWorkout}
            disabled={adding}
            className="w-full h-12 rounded-2xl bg-orange-500 text-white font-semibold hover:bg-orange-500/90 transition-all shadow-md"
          >
            {adding ? (
              <span className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Adding...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Plus size={18} />
                Add Workout
              </span>
            )}
          </Button>
        </div>

        {/* Today's Workouts */}
        {todayWorkoutLogs.length > 0 ? (
          <div className="space-y-2">
            <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Today
            </h3>
            {todayWorkoutLogs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-2xl bg-card border border-border p-4 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-2xl bg-orange-500/15 flex items-center justify-center text-lg flex-none">
                  {WORKOUT_ICONS[log.workoutName] || "🏃"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">
                    {log.workoutName}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock size={10} /> {String(log.durationMinutes)} min
                    </span>
                    <span className="text-xs text-orange-500 flex items-center gap-1 font-medium">
                      <Flame size={10} /> {log.caloriesBurned} kcal
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(log.id, log.workoutName)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  aria-label={`Delete ${log.workoutName}`}
                >
                  <Trash2 size={15} />
                </button>
              </motion.div>
            ))}

            {/* Today's total */}
            <div className="rounded-2xl bg-orange-500/10 border border-orange-500/20 px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-sm text-foreground">
                Today's Total
              </span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Timer size={12} className="text-primary" />{" "}
                  {totalDurationToday} min
                </span>
                <span className="font-bold text-orange-500 text-sm flex items-center gap-1">
                  <Flame size={14} /> {totalBurnedToday} kcal
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
              <Dumbbell size={28} className="text-orange-500/60" />
            </div>
            <p className="font-display font-semibold text-foreground mb-1">
              No workouts logged
            </p>
            <p className="text-sm text-muted-foreground">
              Log a workout above to get started
            </p>
          </div>
        )}

        {/* Weekly Summary */}
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <button
            type="button"
            onClick={handleToggleWeekly}
            className="w-full flex items-center justify-between px-4 py-4"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <Timer size={14} className="text-primary" />
              </div>
              <span className="font-display font-semibold text-sm text-foreground uppercase tracking-wider">
                Weekly Summary
              </span>
            </div>
            <div className="flex items-center gap-2">
              {weeklyLoading && (
                <Loader2
                  size={14}
                  className="animate-spin text-muted-foreground"
                />
              )}
              {showWeekly ? (
                <ChevronUp size={16} className="text-muted-foreground" />
              ) : (
                <ChevronDown size={16} className="text-muted-foreground" />
              )}
            </div>
          </button>

          <AnimatePresence>
            {showWeekly && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="border-t border-border"
              >
                {weekDays.map((day) => {
                  const logs =
                    weeklyLogs[day.date] ||
                    (day.date === todayDate ? todayWorkoutLogs : []);
                  const dayDuration = logs.reduce(
                    (s, l) => s + Number(l.durationMinutes),
                    0,
                  );
                  const dayBurned = logs.reduce(
                    (s, l) => s + l.caloriesBurned,
                    0,
                  );
                  const isToday = day.date === todayDate;

                  return (
                    <div
                      key={day.date}
                      className={`flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0 ${isToday ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${isToday ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                        >
                          {day.label.charAt(0)}
                        </div>
                        <div>
                          <p
                            className={`font-medium text-sm ${isToday ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {day.label}
                            {isToday ? " (Today)" : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {day.shortDate}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        {logs.length > 0 ? (
                          <>
                            <span className="text-xs text-muted-foreground">
                              {dayDuration} min
                            </span>
                            <span className="text-xs font-semibold text-orange-500">
                              {dayBurned} kcal
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">
                            Rest day
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
