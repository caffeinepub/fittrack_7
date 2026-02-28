import {
  Apple,
  ChevronRight,
  Dumbbell,
  Flame,
  Scale,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { type Variants, motion } from "motion/react";
import React from "react";
import { useAppContext } from "../context/AppContext";
import {
  calculateBMI,
  calculateCalorieGoal,
  getBMICategory,
} from "../services/bmiService";

interface DashboardScreenProps {
  onNavigate: (tab: string) => void;
}

export default function DashboardScreen({ onNavigate }: DashboardScreenProps) {
  const { profile, todayFoodLogs, todayWorkoutLogs, isLoading } =
    useAppContext();

  const bmi = profile ? calculateBMI(profile.weightKg, profile.heightCm) : 0;
  const bmiCategory = getBMICategory(bmi);
  const storedGoalOverride =
    Number.parseInt(localStorage.getItem("fittrack_calorie_goal") || "0") || 0;
  const calorieGoal =
    storedGoalOverride > 0
      ? storedGoalOverride
      : profile
        ? calculateCalorieGoal(
            profile.weightKg,
            profile.heightCm,
            Number(profile.age),
            profile.gender,
          )
        : 2000;

  const caloriesConsumed = todayFoodLogs.reduce(
    (sum, log) => sum + log.totalCalories,
    0,
  );
  const caloriesBurned = todayWorkoutLogs.reduce(
    (sum, log) => sum + log.caloriesBurned,
    0,
  );
  const netCalories = caloriesConsumed - caloriesBurned;
  const isDeficit = netCalories < calorieGoal;
  const calorieProgress = Math.min((caloriesConsumed / calorieGoal) * 100, 100);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 20, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4 } },
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background px-4 py-6 space-y-4 scroll-area-content">
        <div className="h-20 rounded-2xl bg-secondary/50 animate-pulse" />
        <div className="h-40 rounded-2xl bg-secondary/50 animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-secondary/50 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background scroll-area-content overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <p className="text-sm text-muted-foreground">{today}</p>
          <h1 className="font-display text-2xl font-bold text-foreground mt-0.5">
            {greeting()}
            {profile ? `, ${profile.name.split(" ")[0]}` : ""}! 👋
          </h1>
        </motion.div>
      </div>

      <motion.div
        className="px-4 space-y-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Calorie Ring Card */}
        <motion.div variants={cardVariants}>
          <div className="rounded-2xl bg-card border border-border p-5 relative overflow-hidden">
            <div className="absolute inset-0 gradient-card-calories opacity-80" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Daily Goal
                  </p>
                  <p className="font-display text-3xl font-bold text-foreground mt-0.5">
                    {caloriesConsumed.toLocaleString()}
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}
                      / {calorieGoal.toLocaleString()} kcal
                    </span>
                  </p>
                </div>
                <div className="relative w-16 h-16">
                  <svg
                    className="w-16 h-16 -rotate-90"
                    viewBox="0 0 64 64"
                    aria-label="Calorie progress ring"
                    role="img"
                  >
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      className="text-secondary"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      strokeDasharray={`${2 * Math.PI * 26}`}
                      strokeDashoffset={`${2 * Math.PI * 26 * (1 - calorieProgress / 100)}`}
                      strokeLinecap="round"
                      className="text-primary transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Flame size={16} className="text-primary" />
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${calorieProgress}%` }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                <span>{Math.round(calorieProgress)}% of goal</span>
                <span>
                  {Math.max(0, calorieGoal - caloriesConsumed).toLocaleString()}{" "}
                  kcal left
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stat Cards Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* BMI Card */}
          <motion.div variants={cardVariants}>
            <div className="rounded-2xl bg-card border border-border p-4 relative overflow-hidden gradient-card-bmi">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Scale size={16} className="text-purple-500" />
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${bmiCategory.bgClass} ${bmiCategory.colorClass}`}
                >
                  {bmiCategory.label || "—"}
                </span>
              </div>
              <p className="font-display text-2xl font-bold text-foreground">
                {bmi > 0 ? bmi.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">BMI Score</p>
            </div>
          </motion.div>

          {/* Weight Card */}
          <motion.div variants={cardVariants}>
            <div className="rounded-2xl bg-card border border-border p-4 relative overflow-hidden gradient-card-weight">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <TrendingDown size={16} className="text-blue-500" />
                </div>
              </div>
              <p className="font-display text-2xl font-bold text-foreground">
                {profile?.weightKg ? `${profile.weightKg} kg` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current Weight
              </p>
            </div>
          </motion.div>

          {/* Calories Consumed */}
          <motion.div variants={cardVariants}>
            <div className="rounded-2xl bg-card border border-border p-4 relative overflow-hidden gradient-card-calories">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Apple size={16} className="text-primary" />
                </div>
              </div>
              <p className="font-display text-2xl font-bold text-foreground">
                {caloriesConsumed > 0 ? caloriesConsumed.toLocaleString() : "0"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                kcal Consumed
              </p>
            </div>
          </motion.div>

          {/* Calories Burned */}
          <motion.div variants={cardVariants}>
            <div className="rounded-2xl bg-card border border-border p-4 relative overflow-hidden gradient-card-burned">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
                  <Flame size={16} className="text-orange-500" />
                </div>
              </div>
              <p className="font-display text-2xl font-bold text-foreground">
                {caloriesBurned > 0 ? caloriesBurned.toLocaleString() : "0"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                kcal Burned
              </p>
            </div>
          </motion.div>
        </div>

        {/* Net Calories Card */}
        <motion.div variants={cardVariants}>
          <div
            className={`rounded-2xl p-4 border ${isDeficit ? "border-primary/30 bg-primary/8" : "border-orange-500/30 bg-orange-500/8"}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isDeficit ? "bg-primary/20" : "bg-orange-500/20"}`}
                >
                  <Zap
                    size={18}
                    className={isDeficit ? "text-primary" : "text-orange-500"}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Net Calories
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Consumed – Burned
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`font-display text-xl font-bold ${isDeficit ? "text-primary" : "text-orange-500"}`}
                >
                  {netCalories.toLocaleString()} kcal
                </p>
                <div
                  className={`flex items-center gap-1 justify-end text-xs font-medium mt-0.5 ${isDeficit ? "text-primary" : "text-orange-500"}`}
                >
                  {isDeficit ? (
                    <TrendingDown size={12} />
                  ) : (
                    <TrendingUp size={12} />
                  )}
                  {isDeficit ? "Calorie Deficit" : "Calorie Surplus"}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={cardVariants}>
          <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigate("diet")}
              className="rounded-2xl bg-card border border-border p-4 flex items-center gap-3 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 text-left group"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                <Apple size={18} className="text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">Log Food</p>
                <p className="text-xs text-muted-foreground">
                  {todayFoodLogs.length} logged
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate("workout")}
              className="rounded-2xl bg-card border border-border p-4 flex items-center gap-3 hover:border-orange-500/40 hover:bg-orange-500/5 transition-all duration-200 text-left group"
            >
              <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center group-hover:bg-orange-500/25 transition-colors">
                <Dumbbell size={18} className="text-orange-500" />
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">
                  Log Workout
                </p>
                <p className="text-xs text-muted-foreground">
                  {todayWorkoutLogs.length} logged
                </p>
              </div>
            </button>
          </div>
        </motion.div>

        {/* Today's activity summary */}
        {(todayFoodLogs.length > 0 || todayWorkoutLogs.length > 0) && (
          <motion.div
            variants={cardVariants}
            className="rounded-2xl bg-card border border-border p-4 space-y-3"
          >
            <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Today's Activity
            </h3>
            {todayFoodLogs.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate("diet")}
                className="w-full flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <Apple size={14} className="text-primary" />
                  <span className="text-sm text-foreground">
                    {todayFoodLogs.length} meal
                    {todayFoodLogs.length !== 1 ? "s" : ""} logged
                  </span>
                </div>
                <ChevronRight
                  size={14}
                  className="text-muted-foreground group-hover:text-foreground transition-colors"
                />
              </button>
            )}
            {todayWorkoutLogs.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate("workout")}
                className="w-full flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <Dumbbell size={14} className="text-orange-500" />
                  <span className="text-sm text-foreground">
                    {todayWorkoutLogs.reduce(
                      (s, l) => s + Number(l.durationMinutes),
                      0,
                    )}{" "}
                    min workout
                  </span>
                </div>
                <ChevronRight
                  size={14}
                  className="text-muted-foreground group-hover:text-foreground transition-colors"
                />
              </button>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
