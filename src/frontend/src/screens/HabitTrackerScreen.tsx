import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Check, Droplets, Flame, Plus, RotateCcw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "../context/AppContext";
import type { Habit } from "../hooks/useHabitStorage";
import {
  useHabitLogs,
  useHabits,
  useWaterLogs,
} from "../hooks/useHabitStorage";

// ─── Constants ────────────────────────────────────────────────────────────────
const PRESET_HABITS = [
  { name: "Sleep 8hrs", icon: "😴" },
  { name: "Meditate", icon: "🧘" },
  { name: "Morning Walk", icon: "🚶" },
  { name: "No Junk Food", icon: "🥗" },
  { name: "Read 30min", icon: "📚" },
  { name: "Stretch", icon: "🤸" },
  { name: "Exercise", icon: "💪" },
  { name: "No Phone 1hr", icon: "📵" },
  { name: "Journaling", icon: "📓" },
  { name: "Vitamins", icon: "💊" },
  { name: "Cold Shower", icon: "🚿" },
  { name: "Gratitude", icon: "🙏" },
];

const EMOJI_PICKER = [
  "😴",
  "🧘",
  "🚶",
  "🥗",
  "📚",
  "🤸",
  "💪",
  "📵",
  "📓",
  "💊",
  "🚿",
  "🙏",
  "🏃",
  "🎯",
  "⭐",
  "🌟",
  "🔥",
  "💧",
  "🥦",
  "🍎",
  "☕",
  "🧘‍♀️",
  "🌞",
  "🌙",
  "❤️",
  "✨",
  "🏋️",
  "🧠",
  "💚",
  "🎵",
];

const QUICK_ADD_ML = [250, 500, 750, 1000];

// ─── Water Goal Calculation ───────────────────────────────────────────────────
function calcWaterGoalMl(
  weightKg: number,
  heightCm: number,
): { goalMl: number; bmi: number } {
  const heightM = heightCm / 100;
  const bmi = heightM > 0 ? weightKg / (heightM * heightM) : 22;
  let goal = weightKg * 35; // base: 35ml per kg
  if (bmi > 25)
    goal *= 1.1; // overweight
  else if (bmi < 18.5) goal *= 0.95; // underweight
  const goalMl = Math.round(Math.max(1500, Math.min(4000, goal)));
  return { goalMl, bmi };
}

// ─── Wave Progress Visual ─────────────────────────────────────────────────────
function WaterRing({
  consumed,
  goal,
}: {
  consumed: number;
  goal: number;
}) {
  const pct = Math.min(1, consumed / goal);
  const radius = 56;
  const circ = 2 * Math.PI * radius;
  const dash = circ * pct;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="136" height="136" viewBox="0 0 136 136" aria-hidden="true">
        {/* Track */}
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          stroke="oklch(var(--secondary))"
          strokeWidth="10"
        />
        {/* Progress */}
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          stroke="oklch(var(--info))"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 68 68)"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Droplets size={20} className="text-info mb-0.5" />
        <span className="font-display font-bold text-2xl text-foreground leading-none">
          {Math.round(pct * 100)}%
        </span>
        <span className="text-[10px] text-muted-foreground font-medium mt-0.5">
          {(consumed / 1000).toFixed(2)}L
        </span>
      </div>
    </div>
  );
}

// ─── Habit Card ───────────────────────────────────────────────────────────────
function HabitCard({
  habit,
  isComplete,
  streak,
  last7,
  onToggle,
  onDelete,
}: {
  habit: Habit;
  isComplete: boolean;
  streak: number;
  last7: boolean[];
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`rounded-2xl border p-3 transition-all duration-200 ${
        isComplete ? "bg-success/8 border-success/20" : "bg-card border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Emoji Icon */}
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-none transition-all ${
            isComplete ? "bg-success/15" : "bg-secondary"
          }`}
        >
          {habit.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={`font-semibold text-sm truncate ${
                isComplete
                  ? "text-success line-through opacity-70"
                  : "text-foreground"
              }`}
            >
              {habit.name}
            </p>
            {streak > 0 && (
              <span className="flex items-center gap-0.5 text-orange-500 text-xs font-bold flex-none">
                <Flame size={10} />
                {streak}
              </span>
            )}
          </div>
          {/* 7-day dots */}
          <div className="flex items-center gap-1 mt-1.5">
            {last7.map((done, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: stable positional list
                key={i}
                className={`w-4 h-4 rounded-full transition-all ${
                  done
                    ? "bg-success"
                    : i === 6
                      ? "bg-border border-2 border-success/40"
                      : "bg-secondary"
                }`}
              />
            ))}
            <span className="text-[10px] text-muted-foreground ml-1">7d</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-none">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-secondary"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  setConfirmDelete(false);
                }}
                className="text-xs text-destructive px-2 py-1 rounded-lg bg-destructive/10"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Delete habit"
              >
                <Trash2 size={12} />
              </button>
              <button
                type="button"
                onClick={onToggle}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  isComplete
                    ? "bg-success text-white"
                    : "bg-secondary border border-border text-muted-foreground hover:border-success/50 hover:text-success"
                }`}
                aria-label={isComplete ? "Mark incomplete" : "Mark complete"}
              >
                <Check size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Add Habit Modal ──────────────────────────────────────────────────────────
function AddHabitModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (habit: Omit<Habit, "id" | "createdAt">) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("⭐");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handlePreset = (preset: { name: string; icon: string }) => {
    setName(preset.name);
    setIcon(preset.icon);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Enter a habit name");
      return;
    }
    onAdd({ name: name.trim(), icon, frequency });
    setName("");
    setIcon("⭐");
    setFrequency("daily");
    setShowEmojiPicker(false);
    onClose();
    toast.success(`"${name.trim()}" habit added!`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-[400px] w-[95vw] rounded-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="font-display text-lg font-bold">
            New Habit
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          {/* Presets */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-2 block">
              Quick Pick
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_HABITS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    name === p.name
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground hover:bg-primary/10"
                  }`}
                >
                  {p.icon} {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Name + Icon */}
          <div className="space-y-2">
            <Label
              htmlFor="habit-name"
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            >
              Habit Name
            </Label>
            <div className="flex gap-2">
              {/* Emoji picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center text-xl border border-border hover:border-primary/40 transition-colors"
                >
                  {icon}
                </button>
                {showEmojiPicker && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 w-56 grid grid-cols-6 gap-1">
                    {EMOJI_PICKER.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => {
                          setIcon(e);
                          setShowEmojiPicker(false);
                        }}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg hover:bg-secondary transition-colors ${
                          icon === e ? "bg-primary/10" : ""
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                id="habit-name"
                placeholder="e.g. Morning meditation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="flex-1 rounded-xl"
              />
            </div>
          </div>

          {/* Frequency */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Frequency
            </Label>
            <div className="flex gap-2">
              {(["daily", "weekly"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold capitalize transition-all ${
                    frequency === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 pb-5 flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 rounded-xl"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="flex-1 rounded-xl">
            Add Habit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HabitTrackerScreen() {
  const { profile } = useAppContext();
  const { habits, addHabit, deleteHabit } = useHabits();
  const { isCompletedToday, getLast7Days, getStreak, toggleHabit } =
    useHabitLogs();
  const { getTodayTotal, addWater, resetTodayWater } = useWaterLogs();

  const [customMl, setCustomMl] = useState("");
  const [addHabitOpen, setAddHabitOpen] = useState(false);

  // ── Water Goal ──────────────────────────────────────────────────────────────
  const { goalMl, bmi } = useMemo(() => {
    if (profile?.weightKg && profile?.heightCm) {
      return calcWaterGoalMl(
        Number(profile.weightKg),
        Number(profile.heightCm),
      );
    }
    return { goalMl: 2000, bmi: 22 };
  }, [profile]);

  const todayTotal = getTodayTotal();
  const pct = Math.min(1, todayTotal / goalMl);

  // ── Time-based reminders ────────────────────────────────────────────────────
  const reminder = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 12 && hour < 18 && pct < 0.5) {
      return {
        type: "amber",
        msg: "Halfway through the day — drink more water!",
      };
    }
    if (hour >= 18 && pct < 0.8) {
      const remaining = Math.round(goalMl - todayTotal);
      return {
        type: "orange",
        msg: `Evening reminder: you still need ${remaining}ml to reach your goal.`,
      };
    }
    return null;
  }, [pct, goalMl, todayTotal]);

  // ── Habit stats ─────────────────────────────────────────────────────────────
  const todayDone = habits.filter((h) => isCompletedToday(h.id)).length;
  const todayPct = habits.length > 0 ? (todayDone / habits.length) * 100 : 0;

  const handleAddWater = useCallback(
    (ml: number) => {
      addWater(ml);
      toast.success(`+${ml}ml added! 💧`, { duration: 1500 });
    },
    [addWater],
  );

  const handleCustomWater = useCallback(() => {
    const ml = Number.parseInt(customMl);
    if (!ml || ml <= 0 || ml > 5000) {
      toast.error("Enter a valid amount (1–5000ml)");
      return;
    }
    handleAddWater(ml);
    setCustomMl("");
  }, [customMl, handleAddWater]);

  const bmiCategory =
    bmi < 18.5
      ? "Underweight"
      : bmi < 25
        ? "Normal"
        : bmi < 30
          ? "Overweight"
          : "Obese";

  return (
    <div className="min-h-screen bg-background pb-[76px]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Habits & Hydration
            </h1>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display font-bold text-sm text-primary">
              {todayDone}/{habits.length}
            </p>
            <p className="text-[10px] text-muted-foreground">habits done</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* ── Water Intake Section ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl bg-card border border-border overflow-hidden"
        >
          {/* Water header */}
          <div className="px-4 pt-4 pb-3 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-info/15 flex items-center justify-center">
                <Droplets size={16} className="text-info" />
              </div>
              <div>
                <p className="font-display font-bold text-sm text-foreground">
                  Water Intake
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Goal: {(goalMl / 1000).toFixed(1)}L · BMI {bmi.toFixed(1)} (
                  {bmiCategory})
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                resetTodayWater();
                toast.success("Water log reset");
              }}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Reset today's water log"
            >
              <RotateCcw size={13} />
            </button>
          </div>

          <div className="px-4 py-4">
            {/* Ring + numbers */}
            <div className="flex items-center gap-5">
              <WaterRing consumed={todayTotal} goal={goalMl} />
              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <p className="font-display font-bold text-2xl text-foreground leading-none">
                    {todayTotal}
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      / {goalMl} ml
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {todayTotal >= goalMl
                      ? "🎉 Goal reached!"
                      : `${goalMl - todayTotal}ml remaining`}
                  </p>
                </div>
                <Progress value={pct * 100} className="h-2 rounded-full" />
                <p className="text-[10px] text-muted-foreground">
                  Based on{" "}
                  {profile?.weightKg
                    ? `${profile.weightKg}kg weight`
                    : "default estimate"}
                </p>
              </div>
            </div>

            {/* Reminder banner */}
            <AnimatePresence>
              {reminder && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`mt-3 rounded-xl px-3 py-2.5 text-xs font-medium flex items-center gap-2 ${
                    reminder.type === "amber"
                      ? "bg-warning/10 text-warning border border-warning/20"
                      : "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                  }`}
                >
                  <span className="text-base">💧</span>
                  {reminder.msg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Quick add buttons */}
            <div className="grid grid-cols-4 gap-2 mt-4">
              {QUICK_ADD_ML.map((ml) => (
                <motion.button
                  key={ml}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleAddWater(ml)}
                  className="h-12 rounded-xl bg-info/10 text-info font-bold text-sm hover:bg-info/20 transition-colors flex flex-col items-center justify-center gap-0.5"
                >
                  <Droplets size={12} />
                  <span className="text-[10px]">+{ml}ml</span>
                </motion.button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="flex gap-2 mt-2">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Custom ml..."
                value={customMl}
                onChange={(e) => setCustomMl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomWater()}
                className="flex-1 h-10 rounded-xl bg-secondary/50 text-sm"
              />
              <Button
                onClick={handleCustomWater}
                className="h-10 px-4 rounded-xl text-sm"
                variant="outline"
              >
                Add
              </Button>
            </div>
          </div>
        </motion.div>

        {/* ── Daily Habits Section ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display font-bold text-base text-foreground">
                Daily Habits
              </h2>
              {habits.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {todayDone} of {habits.length} completed today
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAddHabitOpen(true)}
              className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
              aria-label="Add habit"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Progress ring for today */}
          {habits.length > 0 && (
            <div className="rounded-2xl bg-card border border-border p-4 mb-3">
              <div className="flex items-center gap-4">
                {/* Circular progress (SVG) */}
                <div className="relative flex-none">
                  <svg
                    width="72"
                    height="72"
                    viewBox="0 0 72 72"
                    aria-hidden="true"
                  >
                    <circle
                      cx="36"
                      cy="36"
                      r="30"
                      fill="none"
                      stroke="oklch(var(--secondary))"
                      strokeWidth="7"
                    />
                    <circle
                      cx="36"
                      cy="36"
                      r="30"
                      fill="none"
                      stroke="oklch(var(--success))"
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={`${(todayPct / 100) * 2 * Math.PI * 30} ${2 * Math.PI * 30}`}
                      transform="rotate(-90 36 36)"
                      style={{ transition: "stroke-dasharray 0.5s ease" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display font-bold text-sm text-foreground">
                      {Math.round(todayPct)}%
                    </span>
                  </div>
                </div>
                <div>
                  <p className="font-display font-bold text-lg text-foreground">
                    {todayDone}/{habits.length}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    habits done today
                  </p>
                  {todayDone === habits.length && habits.length > 0 && (
                    <Badge className="mt-1 text-[10px] bg-success/15 text-success border-success/20">
                      🎉 All done!
                    </Badge>
                  )}
                </div>
              </div>
              <Progress value={todayPct} className="h-2 rounded-full mt-3" />
            </div>
          )}

          {/* Habit list */}
          {habits.length === 0 ? (
            <div className="rounded-2xl bg-card border border-dashed border-border p-8 text-center">
              <div className="text-4xl mb-3">🌱</div>
              <p className="font-semibold text-sm text-foreground">
                No habits yet
              </p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Start building healthy habits that stick
              </p>
              <Button
                onClick={() => setAddHabitOpen(true)}
                className="rounded-xl text-sm"
              >
                <Plus size={14} className="mr-1" />
                Add First Habit
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {habits.map((habit) => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    isComplete={isCompletedToday(habit.id)}
                    streak={getStreak(habit.id)}
                    last7={getLast7Days(habit.id)}
                    onToggle={() => toggleHabit(habit.id)}
                    onDelete={() => {
                      deleteHabit(habit.id);
                      toast.success(`"${habit.name}" removed`);
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Footer */}
        <div className="text-center pb-2">
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()}.{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Built with ❤️ using caffeine.ai
            </a>
          </p>
        </div>
      </div>

      {/* Add Habit Modal */}
      <AddHabitModal
        open={addHabitOpen}
        onClose={() => setAddHabitOpen(false)}
        onAdd={addHabit}
      />
    </div>
  );
}
