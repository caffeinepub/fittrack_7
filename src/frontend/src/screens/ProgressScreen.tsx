import React, { useState, useMemo } from "react";
import { motion, type Variants } from "motion/react";
import { TrendingDown, TrendingUp, Scale, Plus, Trash2, Loader2, BarChart2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppContext } from "../context/AppContext";
import { useActor } from "../hooks/useActor";
import { calculateBMI, getBMICategory } from "../services/bmiService";
import { toast } from "sonner";
import type { WeightEntry } from "../backend.d";

type Period = "weekly" | "monthly";

interface ChartDataPoint {
  date: string;
  weight: number;
  bmi: number;
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
        <p key={entry.name} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {entry.value.toFixed(1)} {entry.name === "Weight" ? "kg" : ""}
        </p>
      ))}
    </div>
  );
}

export default function ProgressScreen() {
  const { profile, weightEntries, refreshWeightEntries, todayDate } = useAppContext();
  const { actor } = useActor();
  const [weightInput, setWeightInput] = useState(profile?.weightKg ? String(profile.weightKg) : "");
  const [period, setPeriod] = useState<Period>("weekly");
  const [logging, setLogging] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const today = new Date();
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

  const chartData: ChartDataPoint[] = filteredEntries.map((e) => ({
    date: new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    weight: e.weightKg,
    bmi: e.bmi,
  }));

  const latestWeight = filteredEntries.at(-1)?.weightKg;
  const firstWeight = filteredEntries.at(0)?.weightKg;
  const weightChange = latestWeight && firstWeight ? latestWeight - firstWeight : null;
  const latestBMI = filteredEntries.at(-1)?.bmi || (profile ? calculateBMI(profile.weightKg, profile.heightCm) : 0);
  const bmiCategory = getBMICategory(latestBMI);

  const todayAlreadyLogged = weightEntries.some((e) => e.date === todayDate);

  const handleLogWeight = async () => {
    if (!weightInput || parseFloat(weightInput) <= 0) {
      toast.error("Please enter a valid weight");
      return;
    }
    if (!actor) { toast.error("Not connected to backend"); return; }
    if (!profile) { toast.error("Please set up your profile first"); return; }

    setLogging(true);
    try {
      const wkg = parseFloat(weightInput);
      const bmi = calculateBMI(wkg, profile.heightCm);
      const entry: WeightEntry = {
        id: `weight_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: todayDate,
        weightKg: wkg,
        bmi,
      };
      await actor.addWeightEntry(entry);
      await refreshWeightEntries();
      toast.success(`Weight logged: ${wkg} kg · BMI ${bmi.toFixed(1)}`);
      setWeightInput("");
    } catch {
      toast.error("Failed to log weight");
    } finally {
      setLogging(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!actor) return;
    setDeleting(id);
    try {
      await actor.deleteWeightEntry(id);
      await refreshWeightEntries();
      toast.success("Entry removed");
    } catch {
      toast.error("Failed to remove entry");
    } finally {
      setDeleting(null);
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  return (
    <div className="min-h-screen bg-background scroll-area-content overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <h1 className="font-display text-xl font-bold text-foreground">Progress</h1>
        <p className="text-xs text-muted-foreground">Track your weight & BMI over time</p>
      </div>

      <motion.div
        className="px-4 py-4 space-y-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Log weight card */}
        <motion.div variants={itemVariants}>
          <div className={`rounded-2xl p-4 border ${todayAlreadyLogged ? "border-primary/30 bg-primary/8" : "border-border bg-card"}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <Scale size={14} className="text-primary" />
              </div>
              <h2 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider">
                {todayAlreadyLogged ? "Update Today's Weight" : "Log Today's Weight"}
              </h2>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Input
                  type="number"
                  placeholder={profile?.weightKg ? String(profile.weightKg) : "70.5"}
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  className="h-12 bg-secondary/50 border-border focus:border-primary rounded-xl pr-12 font-bold text-lg"
                  min={10}
                  max={500}
                  step={0.1}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">kg</span>
              </div>
              <Button
                onClick={handleLogWeight}
                disabled={logging}
                className="h-12 px-5 rounded-2xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-glow"
              >
                {logging ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />}
              </Button>
            </div>
            {weightInput && profile && (
              <p className="text-xs text-muted-foreground mt-2">
                BMI will be: <span className="font-semibold text-foreground">{calculateBMI(parseFloat(weightInput), profile.heightCm).toFixed(1)}</span>
                {" · "}
                <span className={getBMICategory(calculateBMI(parseFloat(weightInput), profile.heightCm)).colorClass}>
                  {getBMICategory(calculateBMI(parseFloat(weightInput), profile.heightCm)).label}
                </span>
              </p>
            )}
          </div>
        </motion.div>

        {/* Stats row */}
        {latestBMI > 0 && (
          <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-card border border-border p-3 text-center">
              <p className="font-display text-xl font-bold text-foreground">{latestBMI.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Current BMI</p>
              <span className={`text-[10px] font-medium ${bmiCategory.colorClass}`}>{bmiCategory.label}</span>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 text-center">
              <p className="font-display text-xl font-bold text-foreground">{latestWeight ? `${latestWeight}` : "—"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Weight (kg)</p>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 text-center">
              {weightChange !== null ? (
                <>
                  <div className={`flex items-center justify-center gap-0.5 font-display text-xl font-bold ${weightChange < 0 ? "text-green-500" : weightChange > 0 ? "text-orange-500" : "text-foreground"}`}>
                    {weightChange < 0 ? <TrendingDown size={16} /> : weightChange > 0 ? <TrendingUp size={16} /> : null}
                    {Math.abs(weightChange).toFixed(1)}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">kg change</p>
                </>
              ) : (
                <>
                  <p className="font-display text-xl font-bold text-foreground">—</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">No change yet</p>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Period tabs */}
        <motion.div variants={itemVariants}>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className="grid grid-cols-2 w-full h-10 rounded-xl bg-secondary">
              <TabsTrigger value="weekly" className="rounded-lg text-sm font-medium">Weekly</TabsTrigger>
              <TabsTrigger value="monthly" className="rounded-lg text-sm font-medium">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
        </motion.div>

        {chartData.length > 1 ? (
          <>
            {/* Weight Chart */}
            <motion.div variants={itemVariants} className="rounded-2xl bg-card border border-border p-4">
              <p className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-4">Weight (kg)</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "currentColor", className: "text-muted-foreground" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "currentColor", className: "text-muted-foreground" }}
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
                  />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>

            {/* BMI Chart */}
            <motion.div variants={itemVariants} className="rounded-2xl bg-card border border-border p-4">
              <p className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-4">BMI Trend</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "currentColor", className: "text-muted-foreground" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "currentColor", className: "text-muted-foreground" }}
                    axisLine={false}
                    tickLine={false}
                    domain={["dataMin - 1", "dataMax + 1"]}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={18.5} stroke="oklch(0.55 0.18 240 / 0.5)" strokeDasharray="4 2" label={{ value: "18.5", fontSize: 9, fill: "oklch(0.55 0.18 240)" }} />
                  <ReferenceLine y={25} stroke="oklch(0.62 0.19 155 / 0.5)" strokeDasharray="4 2" label={{ value: "25", fontSize: 9, fill: "oklch(0.62 0.19 155)" }} />
                  <ReferenceLine y={30} stroke="oklch(0.75 0.18 72 / 0.5)" strokeDasharray="4 2" label={{ value: "30", fontSize: 9, fill: "oklch(0.75 0.18 72)" }} />
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
          <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <BarChart2 size={28} className="text-primary/60" />
            </div>
            <p className="font-display font-semibold text-foreground mb-1">Not enough data</p>
            <p className="text-sm text-muted-foreground">Log your weight for at least 2 days to see a chart</p>
          </motion.div>
        )}

        {/* History Table */}
        {filteredEntries.length > 0 && (
          <motion.div variants={itemVariants} className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">History</p>
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
                      <p className={`font-medium text-sm ${isToday ? "text-foreground" : "text-muted-foreground"}`}>
                        {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {isToday && <span className="ml-2 text-xs text-primary font-semibold">Today</span>}
                      </p>
                      <p className={`text-xs font-medium mt-0.5 ${cat.colorClass}`}>BMI {entry.bmi.toFixed(1)} · {cat.label}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-display font-bold text-foreground">{entry.weightKg} kg</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleting === entry.id}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        aria-label="Delete weight entry"
                      >
                        {deleting === entry.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
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
