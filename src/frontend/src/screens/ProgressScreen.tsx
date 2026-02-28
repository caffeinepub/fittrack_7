import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp as ArrowUp,
  BarChart2,
  Info,
  Loader2,
  Plus,
  Scale,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { type Variants, motion } from "motion/react";
import React, { useState, useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import type { WeightEntry } from "../backend.d";
import { useAppContext } from "../context/AppContext";
import {
  calculateBMI,
  calculateCalorieGoal,
  getBMICategory,
} from "../services/bmiService";

type Period = "weekly" | "monthly";

interface ChartDataPoint {
  date: string;
  weight?: number;
  bmi?: number;
  projectedWeight?: number | null;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-card text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          style={{ color: entry.color }}
          className="font-medium"
        >
          {entry.name}:{" "}
          {typeof entry.value === "number"
            ? entry.value.toFixed(1)
            : entry.value}
          {entry.name === "Weight" || entry.name === "Projected" ? " kg" : ""}
        </p>
      ))}
    </div>
  );
}

// Format a date string as "Jan 5" for charts
function formatChartDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Add N days to a date string "YYYY-MM-DD"
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export default function ProgressScreen() {
  const {
    profile,
    weightEntries,
    addWeightEntry,
    deleteWeightEntry,
    allFoodLogs,
    allWorkoutLogs,
    todayDate,
  } = useAppContext();

  const [weightInput, setWeightInput] = useState(
    profile?.weightKg ? String(profile.weightKg) : "",
  );
  const [goalWeightInput, setGoalWeightInput] = useState(
    localStorage.getItem("fittrack_goal_weight") || "",
  );
  const [period, setPeriod] = useState<Period>("weekly");
  const [logging, setLogging] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Goal weight stored in localStorage
  const saveGoalWeight = (val: string) => {
    setGoalWeightInput(val);
    const parsed = Number.parseFloat(val);
    if (val && parsed > 0) {
      localStorage.setItem("fittrack_goal_weight", val);
    } else {
      localStorage.removeItem("fittrack_goal_weight");
    }
  };

  const storedGoalWeight =
    Number.parseFloat(localStorage.getItem("fittrack_goal_weight") || "0") || 0;

  const cutoffDate = useMemo(() => {
    const now = new Date();
    if (period === "weekly") now.setDate(now.getDate() - 7);
    else now.setMonth(now.getMonth() - 1);
    return now.toISOString().split("T")[0];
  }, [period]);

  const filteredEntries = useMemo(() => {
    return weightEntries
      .filter((e) => e.date >= cutoffDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [weightEntries, cutoffDate]);

  const latestEntry = filteredEntries.at(-1);
  const firstEntry = filteredEntries.at(0);
  const latestWeight = latestEntry?.weightKg;
  const firstWeight = firstEntry?.weightKg;
  const weightChange =
    latestWeight && firstWeight ? latestWeight - firstWeight : null;
  const latestBMI =
    latestEntry?.bmi ||
    (profile ? calculateBMI(profile.weightKg, profile.heightCm) : 0);
  const bmiCategory = getBMICategory(latestBMI);

  const todayAlreadyLogged = weightEntries.some((e) => e.date === todayDate);

  // ── Forecast calculation ──────────────────────────────────────────────────
  const calorieGoalStored =
    Number.parseInt(localStorage.getItem("fittrack_calorie_goal") || "0") || 0;
  const calorieGoalAuto = profile
    ? calculateCalorieGoal(
        profile.weightKg,
        profile.heightCm,
        Number(profile.age),
        profile.gender,
      )
    : 2000;
  const calorieGoal =
    calorieGoalStored > 0 ? calorieGoalStored : calorieGoalAuto;

  const forecast = useMemo(() => {
    // Get last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    // Group food/workout logs by date for the past 7 days
    const dateMap: Record<string, { consumed: number; burned: number }> = {};

    for (const log of allFoodLogs) {
      if (log.date >= sevenDaysAgoStr && log.date <= todayDate) {
        if (!dateMap[log.date]) dateMap[log.date] = { consumed: 0, burned: 0 };
        dateMap[log.date].consumed += log.totalCalories;
      }
    }
    for (const log of allWorkoutLogs) {
      if (log.date >= sevenDaysAgoStr && log.date <= todayDate) {
        if (!dateMap[log.date]) dateMap[log.date] = { consumed: 0, burned: 0 };
        dateMap[log.date].burned += log.caloriesBurned;
      }
    }

    const daysWithData = Object.keys(dateMap);
    if (daysWithData.length < 3) {
      return { hasData: false, daysLogged: daysWithData.length };
    }

    const totalConsumed = daysWithData.reduce(
      (s, d) => s + dateMap[d].consumed,
      0,
    );
    const totalBurned = daysWithData.reduce((s, d) => s + dateMap[d].burned, 0);
    const avgConsumed = totalConsumed / daysWithData.length;
    const avgBurned = totalBurned / daysWithData.length;
    const avgNetCalories = avgConsumed - avgBurned;
    const surplusPerDay = avgNetCalories - calorieGoal;
    // 7700 kcal ≈ 1 kg of body fat
    const weightChangePerDay = surplusPerDay / 7700;

    const currentWeight = latestWeight || profile?.weightKg || 0;
    if (!currentWeight)
      return { hasData: false, daysLogged: daysWithData.length };

    const projected30 = currentWeight + weightChangePerDay * 30;
    const projected60 = currentWeight + weightChangePerDay * 60;
    const projected90 = currentWeight + weightChangePerDay * 90;

    // Days to goal weight
    let daysToGoal: number | null = null;
    if (storedGoalWeight > 0 && weightChangePerDay !== 0) {
      const diff = storedGoalWeight - currentWeight;
      // Only calculate if trending in the right direction
      if (
        (diff < 0 && weightChangePerDay < 0) ||
        (diff > 0 && weightChangePerDay > 0)
      ) {
        daysToGoal = Math.ceil(Math.abs(diff / weightChangePerDay));
      }
    }

    // Color: green if losing/maintaining toward normal BMI, orange if surplus, blue if deficit
    const trend =
      surplusPerDay > 100
        ? "surplus"
        : surplusPerDay < -100
          ? "deficit"
          : "maintain";

    return {
      hasData: true,
      daysLogged: daysWithData.length,
      avgConsumed: Math.round(avgConsumed),
      avgBurned: Math.round(avgBurned),
      avgNetCalories: Math.round(avgNetCalories),
      surplusPerDay: Math.round(surplusPerDay),
      weightChangePerDay,
      currentWeight,
      projected30,
      projected60,
      projected90,
      daysToGoal,
      trend,
    };
  }, [
    allFoodLogs,
    allWorkoutLogs,
    todayDate,
    calorieGoal,
    latestWeight,
    profile,
    storedGoalWeight,
  ]);

  // ── Chart data with projection ────────────────────────────────────────────
  const chartData: ChartDataPoint[] = useMemo(() => {
    const actual: ChartDataPoint[] = filteredEntries.map((e) => ({
      date: formatChartDate(e.date),
      weight: e.weightKg,
      bmi: e.bmi,
      projectedWeight: null,
    }));

    // Add 30-day projection as dashed line if we have forecast data and at least 2 real entries
    if (
      forecast.hasData &&
      filteredEntries.length >= 2 &&
      "weightChangePerDay" in forecast &&
      forecast.weightChangePerDay !== undefined
    ) {
      const lastDate = filteredEntries.at(-1)!.date;
      const lastWeight = filteredEntries.at(-1)!.weightKg;
      // Project 30 days out in weekly increments
      const projectionPoints: ChartDataPoint[] = [];
      for (let d = 7; d <= 30; d += 7) {
        projectionPoints.push({
          date: formatChartDate(addDays(lastDate, d)),
          weight: undefined,
          bmi: undefined,
          projectedWeight: Number.parseFloat(
            (lastWeight + forecast.weightChangePerDay * d).toFixed(1),
          ),
        });
      }
      // Add the current point as bridge
      if (actual.length > 0) {
        actual[actual.length - 1] = {
          ...actual[actual.length - 1],
          projectedWeight: lastWeight,
        };
      }
      return [...actual, ...projectionPoints];
    }
    return actual;
  }, [filteredEntries, forecast]);

  const bmiChartData = filteredEntries.map((e) => ({
    date: formatChartDate(e.date),
    bmi: e.bmi,
  }));

  const handleLogWeight = async () => {
    if (!weightInput || Number.parseFloat(weightInput) <= 0) {
      toast.error("Please enter a valid weight");
      return;
    }
    if (!profile) {
      toast.error("Please set up your profile first");
      return;
    }

    setLogging(true);
    try {
      const wkg = Number.parseFloat(weightInput);
      const bmi = calculateBMI(wkg, profile.heightCm);
      const entry: WeightEntry = {
        id: `weight_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: todayDate,
        weightKg: wkg,
        bmi,
      };
      await addWeightEntry(entry);
      toast.success(`Weight logged: ${wkg} kg · BMI ${bmi.toFixed(1)}`);
      setWeightInput("");
    } finally {
      setLogging(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteWeightEntry(id);
      toast.success("Entry removed");
    } finally {
      setDeleting(null);
    }
  };

  // Goal weight display
  const goalWeightDiff =
    storedGoalWeight > 0 && latestWeight
      ? (latestWeight - storedGoalWeight).toFixed(1)
      : null;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  // Forecast card accent color
  const forecastColor = !forecast.hasData
    ? "border-border bg-card"
    : forecast.trend === "surplus"
      ? "border-orange-500/30 bg-orange-500/5"
      : forecast.trend === "deficit"
        ? "border-blue-500/30 bg-blue-500/5"
        : "border-green-500/30 bg-green-500/5";

  const forecastTextColor = !forecast.hasData
    ? "text-muted-foreground"
    : forecast.trend === "surplus"
      ? "text-orange-500"
      : forecast.trend === "deficit"
        ? "text-blue-500"
        : "text-green-500";

  return (
    <div className="min-h-screen bg-background scroll-area-content overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <h1 className="font-display text-xl font-bold text-foreground">
          Progress
        </h1>
        <p className="text-xs text-muted-foreground">
          Track your weight & BMI over time
        </p>
      </div>

      <motion.div
        className="px-4 py-4 space-y-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Log weight + goal weight row */}
        <motion.div variants={itemVariants}>
          <div
            className={`rounded-2xl p-4 border ${todayAlreadyLogged ? "border-primary/30 bg-primary/8" : "border-border bg-card"}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <Scale size={14} className="text-primary" />
              </div>
              <h2 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider">
                {todayAlreadyLogged
                  ? "Update Today's Weight"
                  : "Log Today's Weight"}
              </h2>
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1 relative">
                <Input
                  type="number"
                  placeholder={
                    profile?.weightKg ? String(profile.weightKg) : "70.5"
                  }
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  className="h-12 bg-secondary/50 border-border focus:border-primary rounded-xl pr-12 font-bold text-lg"
                  min={10}
                  max={500}
                  step={0.1}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                  kg
                </span>
              </div>
              <Button
                onClick={handleLogWeight}
                disabled={logging}
                className="h-12 px-5 rounded-2xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-glow"
              >
                {logging ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Plus size={18} />
                )}
              </Button>
            </div>
            {weightInput && profile && (
              <p className="text-xs text-muted-foreground mb-3">
                BMI will be:{" "}
                <span className="font-semibold text-foreground">
                  {calculateBMI(
                    Number.parseFloat(weightInput),
                    profile.heightCm,
                  ).toFixed(1)}
                </span>
                {" · "}
                <span
                  className={
                    getBMICategory(
                      calculateBMI(
                        Number.parseFloat(weightInput),
                        profile.heightCm,
                      ),
                    ).colorClass
                  }
                >
                  {
                    getBMICategory(
                      calculateBMI(
                        Number.parseFloat(weightInput),
                        profile.heightCm,
                      ),
                    ).label
                  }
                </span>
              </p>
            )}
            {/* Goal weight input */}
            <div className="border-t border-border/50 pt-3">
              <label
                htmlFor="goal-weight"
                className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5"
              >
                <Target size={11} className="text-green-500" />
                Goal Weight (kg)
              </label>
              <div className="relative">
                <Input
                  id="goal-weight"
                  type="number"
                  placeholder="e.g. 65"
                  value={goalWeightInput}
                  onChange={(e) => saveGoalWeight(e.target.value)}
                  className="h-10 bg-secondary/50 border-border focus:border-green-500 rounded-xl pr-12 text-sm"
                  min={30}
                  max={300}
                  step={0.1}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  kg
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats row */}
        {latestBMI > 0 && (
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-3 gap-3"
          >
            <div className="rounded-2xl bg-card border border-border p-3 text-center">
              <p className="font-display text-xl font-bold text-foreground">
                {latestBMI.toFixed(1)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Current BMI
              </p>
              <span
                className={`text-[10px] font-medium ${bmiCategory.colorClass}`}
              >
                {bmiCategory.label}
              </span>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 text-center">
              <p className="font-display text-xl font-bold text-foreground">
                {latestWeight ? `${latestWeight}` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Weight (kg)
              </p>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 text-center">
              {storedGoalWeight > 0 && latestWeight ? (
                <>
                  <p
                    className={`font-display text-xl font-bold ${Number.parseFloat(goalWeightDiff!) <= 0 ? "text-green-500" : "text-orange-500"}`}
                  >
                    {Math.abs(Number.parseFloat(goalWeightDiff!)).toFixed(1)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {Number.parseFloat(goalWeightDiff!) <= 0
                      ? "Goal reached! 🎉"
                      : "kg to goal"}
                  </p>
                </>
              ) : weightChange !== null ? (
                <>
                  <div
                    className={`flex items-center justify-center gap-0.5 font-display text-xl font-bold ${weightChange < 0 ? "text-green-500" : weightChange > 0 ? "text-orange-500" : "text-foreground"}`}
                  >
                    {weightChange < 0 ? (
                      <TrendingDown size={16} />
                    ) : weightChange > 0 ? (
                      <TrendingUp size={16} />
                    ) : null}
                    {Math.abs(weightChange).toFixed(1)}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    kg change
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-xl font-bold text-foreground">
                    —
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    No change yet
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Period tabs */}
        <motion.div variants={itemVariants}>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className="grid grid-cols-2 w-full h-10 rounded-xl bg-secondary">
              <TabsTrigger
                value="weekly"
                className="rounded-lg text-sm font-medium"
              >
                Weekly
              </TabsTrigger>
              <TabsTrigger
                value="monthly"
                className="rounded-lg text-sm font-medium"
              >
                Monthly
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </motion.div>

        {chartData.filter((d) => d.weight !== undefined).length > 1 ? (
          <>
            {/* Weight Chart with projection */}
            <motion.div
              variants={itemVariants}
              className="rounded-2xl bg-card border border-border p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                  Weight (kg)
                </p>
                {forecast.hasData && (
                  <p className="text-[10px] text-muted-foreground">
                    — — projected
                  </p>
                )}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="opacity-10"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{
                      fontSize: 10,
                      fill: "currentColor",
                      className: "text-muted-foreground",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{
                      fontSize: 10,
                      fill: "currentColor",
                      className: "text-muted-foreground",
                    }}
                    axisLine={false}
                    tickLine={false}
                    domain={["dataMin - 2", "dataMax + 2"]}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    name="Weight"
                    stroke="oklch(0.72 0.21 155)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "oklch(0.72 0.21 155)", strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                    connectNulls={false}
                  />
                  {forecast.hasData && (
                    <Line
                      type="monotone"
                      dataKey="projectedWeight"
                      name="Projected"
                      stroke="oklch(0.72 0.21 155)"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={{
                        r: 3,
                        fill: "oklch(0.72 0.21 155)",
                        strokeWidth: 0,
                        opacity: 0.6,
                      }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  )}
                  {storedGoalWeight > 0 && (
                    <ReferenceLine
                      y={storedGoalWeight}
                      stroke="oklch(0.62 0.19 155 / 0.7)"
                      strokeDasharray="4 2"
                      label={{
                        value: `Goal: ${storedGoalWeight}kg`,
                        fontSize: 9,
                        fill: "oklch(0.62 0.19 155)",
                      }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </motion.div>

            {/* BMI Chart */}
            <motion.div
              variants={itemVariants}
              className="rounded-2xl bg-card border border-border p-4"
            >
              <p className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-4">
                BMI Trend
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={bmiChartData}
                  margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="opacity-10"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{
                      fontSize: 10,
                      fill: "currentColor",
                      className: "text-muted-foreground",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{
                      fontSize: 10,
                      fill: "currentColor",
                      className: "text-muted-foreground",
                    }}
                    axisLine={false}
                    tickLine={false}
                    domain={["dataMin - 1", "dataMax + 1"]}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine
                    y={18.5}
                    stroke="oklch(0.55 0.18 240 / 0.5)"
                    strokeDasharray="4 2"
                    label={{
                      value: "18.5",
                      fontSize: 9,
                      fill: "oklch(0.55 0.18 240)",
                    }}
                  />
                  <ReferenceLine
                    y={25}
                    stroke="oklch(0.62 0.19 155 / 0.5)"
                    strokeDasharray="4 2"
                    label={{
                      value: "25",
                      fontSize: 9,
                      fill: "oklch(0.62 0.19 155)",
                    }}
                  />
                  <ReferenceLine
                    y={30}
                    stroke="oklch(0.75 0.18 72 / 0.5)"
                    strokeDasharray="4 2"
                    label={{
                      value: "30",
                      fontSize: 9,
                      fill: "oklch(0.75 0.18 72)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="bmi"
                    name="BMI"
                    stroke="oklch(0.65 0.22 320)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "oklch(0.65 0.22 320)", strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          </>
        ) : (
          <motion.div
            variants={itemVariants}
            className="flex flex-col items-center justify-center py-10 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <BarChart2 size={28} className="text-primary/60" />
            </div>
            <p className="font-display font-semibold text-foreground mb-1">
              Not enough data
            </p>
            <p className="text-sm text-muted-foreground">
              Log your weight for at least 2 days to see a chart
            </p>
          </motion.div>
        )}

        {/* ── Weight Forecast Card ──────────────────────────────────────────── */}
        <motion.div variants={itemVariants}>
          <div className={`rounded-2xl p-4 border ${forecastColor}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <ArrowUp size={14} className="text-primary" />
              </div>
              <h2 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider">
                Weight Forecast
              </h2>
            </div>

            {!forecast.hasData ? (
              <div className="flex items-start gap-3 py-2">
                <Info
                  size={16}
                  className="text-muted-foreground shrink-0 mt-0.5"
                />
                <p className="text-sm text-muted-foreground">
                  Log food for at least{" "}
                  <span className="font-semibold text-foreground">3 days</span>{" "}
                  to see your forecast.
                  {forecast.daysLogged > 0 && (
                    <span className="text-primary font-medium">
                      {" "}
                      ({forecast.daysLogged}/3 days logged)
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Stats row */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-background/50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">
                      Avg daily calories
                    </p>
                    <p className="font-bold text-foreground">
                      {forecast.avgConsumed?.toLocaleString()} kcal
                    </p>
                  </div>
                  <div className="bg-background/50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">Goal</p>
                    <p className="font-bold text-foreground">
                      {calorieGoal.toLocaleString()} kcal
                    </p>
                  </div>
                  <div className="bg-background/50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">
                      Avg burned
                    </p>
                    <p className="font-bold text-foreground">
                      {forecast.avgBurned?.toLocaleString()} kcal
                    </p>
                  </div>
                  <div className="bg-background/50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">
                      Daily{" "}
                      {(forecast.surplusPerDay ?? 0) >= 0
                        ? "surplus"
                        : "deficit"}
                    </p>
                    <p className={`font-bold ${forecastTextColor}`}>
                      {(forecast.surplusPerDay ?? 0) >= 0 ? "+" : ""}
                      {forecast.surplusPerDay} kcal
                    </p>
                  </div>
                </div>

                {/* Projections */}
                <div className="border-t border-border/50 pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Projected Weight
                  </p>
                  {[
                    {
                      label: "30 days",
                      proj: forecast.projected30,
                      weight: 30,
                    },
                    {
                      label: "60 days",
                      proj: forecast.projected60,
                      weight: 60,
                    },
                    {
                      label: "90 days",
                      proj: forecast.projected90,
                      weight: 90,
                    },
                  ].map(({ label, proj }) => {
                    if (
                      proj === undefined ||
                      forecast.currentWeight === undefined
                    )
                      return null;
                    const diff = proj - forecast.currentWeight;
                    const isGain = diff > 0;
                    return (
                      <div
                        key={label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm text-muted-foreground">
                          {label}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">
                            {proj.toFixed(1)} kg
                          </span>
                          <span
                            className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${isGain ? "bg-orange-500/15 text-orange-500" : "bg-green-500/15 text-green-500"}`}
                          >
                            {isGain ? "+" : ""}
                            {diff.toFixed(1)} kg
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Days to goal */}
                {forecast.daysToGoal !== null &&
                  forecast.daysToGoal !== undefined && (
                    <div className="border-t border-border/50 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <Target size={12} className="text-green-500" />
                          Days to reach {storedGoalWeight} kg
                        </span>
                        <span className="font-bold text-sm text-green-500">
                          {forecast.daysToGoal} days
                        </span>
                      </div>
                    </div>
                  )}

                {/* Summary message */}
                <div className="border-t border-border/50 pt-3">
                  <p className={`text-xs ${forecastTextColor} font-medium`}>
                    {forecast.trend === "surplus" && (
                      <>
                        At this rate, you'll gain ~
                        {Math.abs(
                          forecast.projected90! - forecast.currentWeight!,
                        ).toFixed(1)}{" "}
                        kg in 90 days. Log more workouts or reduce intake to
                        reach your goal.
                      </>
                    )}
                    {forecast.trend === "deficit" && (
                      <>
                        At this rate, you'll lose ~
                        {Math.abs(
                          forecast.projected90! - forecast.currentWeight!,
                        ).toFixed(1)}{" "}
                        kg in 90 days. Great work staying in a deficit!
                      </>
                    )}
                    {forecast.trend === "maintain" &&
                      "You're roughly maintaining your weight. Your intake and output are well balanced!"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* History Table */}
        {filteredEntries.length > 0 && (
          <motion.div
            variants={itemVariants}
            className="rounded-2xl bg-card border border-border overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-border">
              <p className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                History
              </p>
            </div>
            <div className="divide-y divide-border">
              {[...filteredEntries].reverse().map((entry) => {
                const cat = getBMICategory(entry.bmi);
                const isToday = entry.date === todayDate;
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between px-4 py-3 ${isToday ? "bg-primary/5" : "hover:bg-secondary/30"} transition-colors`}
                  >
                    <div>
                      <p
                        className={`font-medium text-sm ${isToday ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {new Date(`${entry.date}T00:00:00`).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                        {isToday && (
                          <span className="ml-2 text-xs text-primary font-semibold">
                            Today
                          </span>
                        )}
                      </p>
                      <p
                        className={`text-xs font-medium mt-0.5 ${cat.colorClass}`}
                      >
                        BMI {entry.bmi.toFixed(1)} · {cat.label}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-display font-bold text-foreground">
                        {entry.weightKg} kg
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleting === entry.id}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        aria-label="Delete weight entry"
                      >
                        {deleting === entry.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
