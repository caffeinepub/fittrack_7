import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Bell,
  BellRing,
  Calendar,
  CheckCircle,
  ChevronRight,
  Droplets,
  Moon,
  Ruler,
  Sun,
  Target,
  User,
  Utensils,
  Weight,
} from "lucide-react";
import { AnimatePresence, type Variants, motion } from "motion/react";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { UserProfile } from "../backend.d";
import { useAppContext } from "../context/AppContext";
import { useTheme } from "../context/ThemeContext";
import { useActor } from "../hooks/useActor";
import { useHabits, useReminderSettings } from "../hooks/useHabitStorage";
import {
  calculateBMI,
  calculateCalorieGoal,
  getBMICategory,
} from "../services/bmiService";
import {
  type MealReminder,
  getReminders,
  requestNotificationPermission,
  saveReminders,
  scheduleMealReminder,
} from "../services/notificationService";
import {
  cancelHabitReminder,
  cancelWaterReminders,
  scheduleHabitReminder,
  scheduleWaterReminders,
} from "../utils/swNotifications";

// ─── Constants ────────────────────────────────────────────────────────────────
const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am–10pm
const INTERVAL_OPTIONS = [1, 1.5, 2, 3];

// ─── Water Reminder Panel (inline for Profile) ────────────────────────────────
function WaterReminderProfilePanel({ goalMl }: { goalMl: number }) {
  const { settings, updateWaterReminder } = useReminderSettings();
  const water = settings.water;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [nextReminderStr, setNextReminderStr] = useState<string>("");

  const calcNextReminder = useCallback(() => {
    const now = new Date();
    const nowHour = now.getHours();
    const nowMin = now.getMinutes();
    const intervalMin = water.intervalHours * 60;
    if (!water.enabled) return "";
    if (nowHour >= water.endHour) return "Resumes tomorrow";
    if (nowHour < water.startHour)
      return `Starts at ${String(water.startHour).padStart(2, "0")}:00`;
    const totalMinutes = nowHour * 60 + nowMin;
    const startMinutes = water.startHour * 60;
    const elapsed = totalMinutes - startMinutes;
    const nextOffset = intervalMin - (elapsed % intervalMin);
    const nextTotal = totalMinutes + nextOffset;
    const nextH = Math.floor(nextTotal / 60);
    const nextM = nextTotal % 60;
    if (nextH >= water.endHour) return "No more reminders today";
    return `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
  }, [water]);

  useEffect(() => {
    setNextReminderStr(calcNextReminder());
    const tick = setInterval(
      () => setNextReminderStr(calcNextReminder()),
      30000,
    );
    return () => clearInterval(tick);
  }, [calcNextReminder]);

  // Sync SW reminders whenever settings change
  useEffect(() => {
    if (
      water.enabled &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      scheduleWaterReminders({
        intervalHours: water.intervalHours,
        startHour: water.startHour,
        endHour: water.endHour,
        goalL: Number.parseFloat((goalMl / 1000).toFixed(1)),
      });
    } else {
      cancelWaterReminders();
    }
  }, [
    water.enabled,
    water.intervalHours,
    water.startHour,
    water.endHour,
    goalMl,
  ]);

  // In-page fallback interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!water.enabled) return;
    const fireNotification = () => {
      const h = new Date().getHours();
      if (h < water.startHour || h >= water.endHour) return;
      toast("💧 Time to drink water!", {
        description: `Daily goal: ${(goalMl / 1000).toFixed(1)}L`,
        duration: 5000,
      });
    };
    intervalRef.current = setInterval(
      fireNotification,
      water.intervalHours * 60 * 60 * 1000,
    );
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [
    water.enabled,
    water.intervalHours,
    water.startHour,
    water.endHour,
    goalMl,
  ]);

  const handleToggle = async (on: boolean) => {
    if (on && "Notification" in window) {
      const perm = await Notification.requestPermission();
      if (perm === "denied") {
        toast.error("Notifications blocked — enable them in browser settings");
        return;
      }
    }
    updateWaterReminder({ enabled: on });
    if (on) {
      toast.success(
        "Water reminders enabled — works even when browser is closed",
      );
    } else {
      cancelWaterReminders();
      toast.success("Water reminders disabled");
    }
  };

  const notifBlocked =
    "Notification" in window && Notification.permission === "denied";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold text-foreground">
          Water Reminders
        </Label>
        <Switch checked={water.enabled} onCheckedChange={handleToggle} />
      </div>

      <AnimatePresence>
        {water.enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            {/* Interval */}
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5 block">
                Remind Every
              </Label>
              <div className="flex gap-1.5">
                {INTERVAL_OPTIONS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => updateWaterReminder({ intervalHours: h })}
                    className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-all ${
                      water.intervalHours === h
                        ? "bg-blue-500 text-white"
                        : "bg-secondary border border-border text-muted-foreground hover:border-blue-500/50"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* Start / End hours */}
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-[10px] text-muted-foreground uppercase font-semibold mb-1 block">
                  From
                </Label>
                <select
                  value={water.startHour}
                  onChange={(e) =>
                    updateWaterReminder({ startHour: Number(e.target.value) })
                  }
                  className="w-full h-8 rounded-lg bg-secondary/50 border border-border text-sm px-2 text-foreground"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <Label className="text-[10px] text-muted-foreground uppercase font-semibold mb-1 block">
                  Until
                </Label>
                <select
                  value={water.endHour}
                  onChange={(e) =>
                    updateWaterReminder({ endHour: Number(e.target.value) })
                  }
                  className="w-full h-8 rounded-lg bg-secondary/50 border border-border text-sm px-2 text-foreground"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Status badge */}
            <div
              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                notifBlocked
                  ? "bg-destructive/10 text-destructive border border-destructive/20"
                  : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
              }`}
            >
              {notifBlocked
                ? "🔕 Notifications blocked — enable in browser settings"
                : nextReminderStr
                  ? `⏰ Next reminder at ${nextReminderStr} — works when browser is closed`
                  : "Active — reminders scheduled (works when browser is closed)"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Habit Reminders Panel (inline for Profile) ───────────────────────────────
function HabitRemindersProfilePanel() {
  const { habits } = useHabits();
  const { settings, setHabitReminder, getHabitReminder } =
    useReminderSettings();

  const handleToggle = async (habitId: string, on: boolean) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;

    if (on && "Notification" in window) {
      const perm = await Notification.requestPermission();
      if (perm === "denied") {
        toast.error("Notifications blocked — enable them in browser settings");
        return;
      }
    }

    const existing = getHabitReminder(habitId);
    const time = existing?.time ?? "08:00";

    setHabitReminder(habitId, { enabled: on, time });

    if (on) {
      scheduleHabitReminder({
        habitId,
        habitName: habit.name,
        habitEmoji: habit.icon,
        reminderTime: time,
      });
      toast.success(`"${habit.name}" reminder set for ${time}`);
    } else {
      cancelHabitReminder(habitId);
      toast.info(`"${habit.name}" reminder disabled`);
    }
  };

  const handleTimeChange = (habitId: string, time: string) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;

    const existing = getHabitReminder(habitId);
    const isEnabled = existing?.enabled ?? false;

    setHabitReminder(habitId, { enabled: isEnabled, time });

    if (isEnabled) {
      scheduleHabitReminder({
        habitId,
        habitName: habit.name,
        habitEmoji: habit.icon,
        reminderTime: time,
      });
    }
  };

  if (habits.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1">
        Add habits in the Habits tab to set reminders here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {habits.map((habit) => {
        const reminder = settings.habits.find((r) => r.habitId === habit.id);
        const isEnabled = reminder?.enabled ?? false;
        const time = reminder?.time ?? "08:00";

        return (
          <div
            key={habit.id}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-lg flex-shrink-0">{habit.icon}</span>
              <span className="text-sm font-medium text-foreground truncate">
                {habit.name}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                type="time"
                value={time}
                onChange={(e) => handleTimeChange(habit.id, e.target.value)}
                disabled={!isEnabled}
                className="h-8 rounded-lg bg-secondary/50 border border-border text-xs px-2 text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <Switch
                checked={isEnabled}
                onCheckedChange={(on) => handleToggle(habit.id, on)}
                aria-label={`Toggle reminder for ${habit.name}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getStoredMacroGoals() {
  try {
    const stored = localStorage.getItem("fittrack_macro_goals");
    if (stored) {
      const p = JSON.parse(stored) as {
        protein: number;
        carbs: number;
        fat: number;
      };
      if (p.protein && p.carbs && p.fat) return p;
    }
  } catch {}
  return { protein: 150, carbs: 250, fat: 60 };
}

export default function ProfileScreen() {
  const { profile, setProfile } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const { actor } = useActor();

  const [name, setName] = useState(profile?.name || "");
  const [age, setAge] = useState(profile ? String(profile.age) : "");
  const [gender, setGender] = useState(profile?.gender || "");
  const [heightCm, setHeightCm] = useState(
    profile ? String(profile.heightCm) : "",
  );
  const [weightKg, setWeightKg] = useState(
    profile ? String(profile.weightKg) : "",
  );
  const [saving, setSaving] = useState(false);
  const [reminders, setReminders] = useState<MealReminder[]>(getReminders());
  const [notifGranted, setNotifGranted] = useState(
    "Notification" in window && Notification.permission === "granted",
  );
  // Daily calorie goal override
  const [calorieGoalOverride, setCalorieGoalOverride] = useState(
    localStorage.getItem("fittrack_calorie_goal") || "",
  );

  // Macro goals
  const [proteinGoal, setProteinGoal] = useState(
    String(getStoredMacroGoals().protein),
  );
  const [carbsGoal, setCarbsGoal] = useState(
    String(getStoredMacroGoals().carbs),
  );
  const [fatGoal, setFatGoal] = useState(String(getStoredMacroGoals().fat));

  // Sync form when profile changes
  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setAge(String(profile.age));
      setGender(profile.gender);
      setHeightCm(String(profile.heightCm));
      setWeightKg(String(profile.weightKg));
    }
  }, [profile]);

  const bmi = calculateBMI(
    Number.parseFloat(weightKg) || 0,
    Number.parseFloat(heightCm) || 0,
  );
  const bmiCategory = getBMICategory(bmi);
  const calorieGoal = calculateCalorieGoal(
    Number.parseFloat(weightKg) || 0,
    Number.parseFloat(heightCm) || 0,
    Number.parseInt(age) || 0,
    gender,
  );

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!age || Number.parseInt(age) < 1 || Number.parseInt(age) > 120) {
      toast.error("Please enter a valid age");
      return;
    }
    if (!gender) {
      toast.error("Please select your gender");
      return;
    }
    if (
      !heightCm ||
      Number.parseFloat(heightCm) < 50 ||
      Number.parseFloat(heightCm) > 300
    ) {
      toast.error("Please enter a valid height (50–300 cm)");
      return;
    }
    if (
      !weightKg ||
      Number.parseFloat(weightKg) < 10 ||
      Number.parseFloat(weightKg) > 500
    ) {
      toast.error("Please enter a valid weight (10–500 kg)");
      return;
    }

    setSaving(true);
    try {
      const profileData: UserProfile = {
        name: name.trim(),
        age: BigInt(Number.parseInt(age)),
        gender,
        heightCm: Number.parseFloat(heightCm),
        weightKg: Number.parseFloat(weightKg),
        updatedAt: BigInt(Date.now()),
      };

      // Save to localStorage immediately (non-blocking)
      setProfile(profileData);

      // Save calorie goal override
      const goalVal = Number.parseInt(calorieGoalOverride);
      if (calorieGoalOverride && goalVal > 0) {
        localStorage.setItem("fittrack_calorie_goal", String(goalVal));
      } else {
        localStorage.removeItem("fittrack_calorie_goal");
      }

      // Save macro goals
      const pGoal = Number.parseInt(proteinGoal) || 150;
      const cGoal = Number.parseInt(carbsGoal) || 250;
      const fGoal = Number.parseInt(fatGoal) || 60;
      localStorage.setItem(
        "fittrack_macro_goals",
        JSON.stringify({ protein: pGoal, carbs: cGoal, fat: fGoal }),
      );

      // Try backend async (fire and forget — don't block UI)
      if (actor) {
        actor.setProfile(profileData).catch(() => {
          /* backend unavailable */
        });
      }

      toast.success("Profile saved!");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReminder = async (index: number) => {
    if (!notifGranted) {
      const granted = await requestNotificationPermission();
      setNotifGranted(granted);
      if (!granted) {
        toast.error("Please allow notifications in your browser settings");
        return;
      }
    }

    const updated = reminders.map((r, i) =>
      i === index ? { ...r, enabled: !r.enabled } : r,
    );
    setReminders(updated);
    saveReminders(updated);

    const reminder = updated[index];
    if (reminder.enabled) {
      scheduleMealReminder(reminder.hour, reminder.minute, reminder.meal);
      toast.success(
        `${reminder.meal} reminder enabled at ${String(reminder.hour).padStart(2, "0")}:${String(reminder.minute).padStart(2, "0")}`,
      );
    } else {
      toast.info(`${reminder.meal} reminder disabled`);
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
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Profile
            </h1>
            <p className="text-xs text-muted-foreground">
              Your personal fitness settings
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      <motion.div
        className="px-4 py-4 space-y-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* BMI Preview Card */}
        {bmi > 0 && (
          <motion.div variants={itemVariants}>
            <div className="rounded-2xl p-4 bg-primary/10 border border-primary/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-primary/5 -translate-y-4 translate-x-4" />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                    Current BMI
                  </p>
                  <p className="font-display text-4xl font-bold text-foreground">
                    {bmi.toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Daily calorie goal: ~{calorieGoal} kcal
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${bmiCategory.bgClass} ${bmiCategory.colorClass}`}
                  >
                    {bmiCategory.label}
                  </span>
                  <p className="text-xs text-muted-foreground mt-2">
                    BMI {bmiCategory.range}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Personal Info */}
        <motion.div
          variants={itemVariants}
          className="rounded-2xl bg-card border border-border p-4 space-y-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <User size={14} className="text-primary" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">
              Personal Info
            </h2>
          </div>

          <div className="space-y-3">
            <div>
              <Label
                htmlFor="name"
                className="text-xs font-medium text-muted-foreground mb-1.5 block"
              >
                Full Name
              </Label>
              <Input
                id="name"
                placeholder="e.g. Arjun Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 bg-secondary/50 border-border focus:border-primary rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label
                  htmlFor="age"
                  className="text-xs font-medium text-muted-foreground mb-1.5 block"
                >
                  Age
                </Label>
                <div className="relative">
                  <Calendar
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="age"
                    type="number"
                    placeholder="25"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="h-11 pl-9 bg-secondary/50 border-border focus:border-primary rounded-xl"
                    min={1}
                    max={120}
                  />
                </div>
              </div>
              <div>
                <Label
                  htmlFor="gender"
                  className="text-xs font-medium text-muted-foreground mb-1.5 block"
                >
                  Gender
                </Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger
                    id="gender"
                    className="h-11 bg-secondary/50 border-border focus:border-primary rounded-xl"
                  >
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Body Measurements */}
        <motion.div
          variants={itemVariants}
          className="rounded-2xl bg-card border border-border p-4 space-y-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Ruler size={14} className="text-blue-500" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">
              Body Measurements
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label
                htmlFor="height"
                className="text-xs font-medium text-muted-foreground mb-1.5 block"
              >
                Height (cm)
              </Label>
              <div className="relative">
                <Ruler
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="height"
                  type="number"
                  placeholder="175"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="h-11 pl-9 bg-secondary/50 border-border focus:border-primary rounded-xl"
                  min={50}
                  max={300}
                />
              </div>
            </div>
            <div>
              <Label
                htmlFor="weight"
                className="text-xs font-medium text-muted-foreground mb-1.5 block"
              >
                Weight (kg)
              </Label>
              <div className="relative">
                <Weight
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="weight"
                  type="number"
                  placeholder="70"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="h-11 pl-9 bg-secondary/50 border-border focus:border-primary rounded-xl"
                  min={10}
                  max={500}
                />
              </div>
            </div>
          </div>

          {/* BMI Scale visualization */}
          {bmi > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Underweight</span>
                <span>Normal</span>
                <span>Overweight</span>
                <span>Obese</span>
              </div>
              <div className="h-2 rounded-full bg-secondary relative overflow-hidden">
                <div className="absolute inset-0 flex">
                  <div className="flex-1 bg-blue-500/50 rounded-l-full" />
                  <div className="flex-1 bg-green-500/50" />
                  <div className="flex-1 bg-yellow-500/50" />
                  <div className="flex-1 bg-red-500/50 rounded-r-full" />
                </div>
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground border-2 border-background shadow-md transition-all duration-500"
                  style={{
                    left: `${Math.min(Math.max(((bmi - 10) / 30) * 100, 2), 97)}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              </div>
            </div>
          )}
        </motion.div>

        {/* Daily Calorie Goal Override */}
        <motion.div
          variants={itemVariants}
          className="rounded-2xl bg-card border border-border p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-green-500/15 flex items-center justify-center">
              <Target size={14} className="text-green-500" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">
              Calorie Goal
            </h2>
          </div>
          <div>
            <Label
              htmlFor="calorie-goal"
              className="text-xs font-medium text-muted-foreground mb-1.5 block"
            >
              Daily Calorie Goal (optional)
            </Label>
            <div className="relative">
              <Input
                id="calorie-goal"
                type="number"
                placeholder={`Auto: ~${calorieGoal} kcal`}
                value={calorieGoalOverride}
                onChange={(e) => setCalorieGoalOverride(e.target.value)}
                className="h-11 bg-secondary/50 border-border focus:border-primary rounded-xl pr-14"
                min={500}
                max={9999}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                kcal
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Leave blank to use auto-calculated goal (~{calorieGoal} kcal based
              on your stats)
            </p>
          </div>
        </motion.div>

        {/* Macro Goals */}
        <motion.div
          variants={itemVariants}
          className="rounded-2xl bg-card border border-border p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <Utensils size={14} className="text-violet-500" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">
              Macro Goals
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {/* Protein */}
            <div>
              <Label
                htmlFor="protein-goal"
                className="text-xs font-medium text-muted-foreground mb-1.5 block"
              >
                Protein
              </Label>
              <div className="relative">
                <Input
                  id="protein-goal"
                  type="number"
                  placeholder="150"
                  value={proteinGoal}
                  onChange={(e) => setProteinGoal(e.target.value)}
                  className="h-11 bg-secondary/50 border-border focus:border-primary rounded-xl pr-8"
                  min={0}
                  max={500}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  g
                </span>
              </div>
            </div>
            {/* Carbs */}
            <div>
              <Label
                htmlFor="carbs-goal"
                className="text-xs font-medium text-muted-foreground mb-1.5 block"
              >
                Carbs
              </Label>
              <div className="relative">
                <Input
                  id="carbs-goal"
                  type="number"
                  placeholder="250"
                  value={carbsGoal}
                  onChange={(e) => setCarbsGoal(e.target.value)}
                  className="h-11 bg-secondary/50 border-border focus:border-primary rounded-xl pr-8"
                  min={0}
                  max={1000}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  g
                </span>
              </div>
            </div>
            {/* Fat */}
            <div>
              <Label
                htmlFor="fat-goal"
                className="text-xs font-medium text-muted-foreground mb-1.5 block"
              >
                Fat
              </Label>
              <div className="relative">
                <Input
                  id="fat-goal"
                  type="number"
                  placeholder="60"
                  value={fatGoal}
                  onChange={(e) => setFatGoal(e.target.value)}
                  className="h-11 bg-secondary/50 border-border focus:border-primary rounded-xl pr-8"
                  min={0}
                  max={300}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  g
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Used in Diet Tracker macro progress bars
          </p>
        </motion.div>

        {/* Water Reminders */}
        <motion.div
          variants={itemVariants}
          className="rounded-2xl bg-card border border-border p-4 space-y-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Droplets size={14} className="text-blue-500" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">
              Water Reminders
            </h2>
          </div>
          <WaterReminderProfilePanel
            goalMl={Math.round(
              Math.max(
                1500,
                Math.min(
                  4000,
                  (() => {
                    const w = Number.parseFloat(weightKg) || 70;
                    const h = Number.parseFloat(heightCm) || 170;
                    const bmiVal = h > 0 ? w / ((h / 100) * (h / 100)) : 22;
                    let g = w * 35;
                    if (bmiVal > 25) g *= 1.1;
                    else if (bmiVal < 18.5) g *= 0.95;
                    return g;
                  })(),
                ),
              ),
            )}
          />
        </motion.div>

        {/* Habit Reminders */}
        <motion.div
          variants={itemVariants}
          className="rounded-2xl bg-card border border-border p-4 space-y-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <BellRing size={14} className="text-primary" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">
              Habit Reminders
            </h2>
          </div>
          <HabitRemindersProfilePanel />
        </motion.div>

        {/* Meal Reminders */}
        <motion.div
          variants={itemVariants}
          className="rounded-2xl bg-card border border-border p-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-yellow-500/15 flex items-center justify-center">
              <Bell size={14} className="text-yellow-500" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">
              Meal Reminders
            </h2>
          </div>
          <div className="space-y-3">
            {reminders.map((reminder, i) => (
              <div
                key={reminder.meal}
                className="flex items-center justify-between py-0.5"
              >
                <div>
                  <p className="font-medium text-sm text-foreground">
                    {reminder.meal}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {String(reminder.hour).padStart(2, "0")}:
                    {String(reminder.minute).padStart(2, "0")}
                  </p>
                </div>
                <Switch
                  checked={reminder.enabled}
                  onCheckedChange={() => handleToggleReminder(i)}
                  aria-label={`Toggle ${reminder.meal} reminder`}
                />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.div variants={itemVariants}>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 rounded-2xl font-semibold text-base bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-glow"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle size={18} />
                {profile ? "Update Profile" : "Save Profile"}
              </span>
            )}
          </Button>
        </motion.div>

        {/* Profile completion indicator */}
        {profile && (
          <motion.div
            variants={itemVariants}
            className="flex items-center gap-2 text-xs text-muted-foreground pb-2"
          >
            <CheckCircle size={12} className="text-primary" />
            <span>
              Profile set up · Last updated{" "}
              {new Date(Number(profile.updatedAt)).toLocaleDateString()}
            </span>
            <ChevronRight size={12} />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
