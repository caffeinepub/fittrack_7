import React, { useState, useEffect } from "react";
import { motion, type Variants } from "motion/react";
import { User, Ruler, Weight, Calendar, ChevronRight, CheckCircle, Moon, Sun, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAppContext } from "../context/AppContext";
import { useTheme } from "../context/ThemeContext";
import { useActor } from "../hooks/useActor";
import { calculateBMI, getBMICategory, calculateCalorieGoal } from "../services/bmiService";
import {
  requestNotificationPermission,
  scheduleMealReminder,
  getReminders,
  saveReminders,
  type MealReminder,
} from "../services/notificationService";
import { toast } from "sonner";
import type { UserProfile } from "../backend.d";

export default function ProfileScreen() {
  const { profile, setProfile, refreshProfile } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const { actor } = useActor();

  const [name, setName] = useState(profile?.name || "");
  const [age, setAge] = useState(profile ? String(profile.age) : "");
  const [gender, setGender] = useState(profile?.gender || "");
  const [heightCm, setHeightCm] = useState(profile ? String(profile.heightCm) : "");
  const [weightKg, setWeightKg] = useState(profile ? String(profile.weightKg) : "");
  const [saving, setSaving] = useState(false);
  const [reminders, setReminders] = useState<MealReminder[]>(getReminders());
  const [notifGranted, setNotifGranted] = useState(
    "Notification" in window && Notification.permission === "granted"
  );

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

  const bmi = calculateBMI(parseFloat(weightKg) || 0, parseFloat(heightCm) || 0);
  const bmiCategory = getBMICategory(bmi);
  const calorieGoal = calculateCalorieGoal(
    parseFloat(weightKg) || 0,
    parseFloat(heightCm) || 0,
    parseInt(age) || 0,
    gender
  );

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Please enter your name"); return; }
    if (!age || parseInt(age) < 1 || parseInt(age) > 120) { toast.error("Please enter a valid age"); return; }
    if (!gender) { toast.error("Please select your gender"); return; }
    if (!heightCm || parseFloat(heightCm) < 50 || parseFloat(heightCm) > 300) {
      toast.error("Please enter a valid height (50–300 cm)"); return;
    }
    if (!weightKg || parseFloat(weightKg) < 10 || parseFloat(weightKg) > 500) {
      toast.error("Please enter a valid weight (10–500 kg)"); return;
    }

    setSaving(true);
    try {
      const profileData: UserProfile = {
        name: name.trim(),
        age: BigInt(parseInt(age)),
        gender,
        heightCm: parseFloat(heightCm),
        weightKg: parseFloat(weightKg),
        updatedAt: BigInt(Date.now()),
      };

      if (actor) {
        await actor.setProfile(profileData);
      }
      setProfile(profileData);
      await refreshProfile();
      toast.success("Profile saved successfully!");
    } catch (err) {
      toast.error("Failed to save profile. Please try again.");
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
      i === index ? { ...r, enabled: !r.enabled } : r
    );
    setReminders(updated);
    saveReminders(updated);

    const reminder = updated[index];
    if (reminder.enabled) {
      scheduleMealReminder(reminder.hour, reminder.minute, reminder.meal);
      toast.success(`${reminder.meal} reminder enabled at ${String(reminder.hour).padStart(2, "0")}:${String(reminder.minute).padStart(2, "0")}`);
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
            <h1 className="font-display text-xl font-bold text-foreground">Profile</h1>
            <p className="text-xs text-muted-foreground">Your personal fitness settings</p>
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
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Current BMI</p>
                  <p className="font-display text-4xl font-bold text-foreground">{bmi.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Daily calorie goal: ~{calorieGoal} kcal</p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${bmiCategory.bgClass} ${bmiCategory.colorClass}`}>
                    {bmiCategory.label}
                  </span>
                  <p className="text-xs text-muted-foreground mt-2">BMI {bmiCategory.range}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Personal Info */}
        <motion.div variants={itemVariants} className="rounded-2xl bg-card border border-border p-4 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <User size={14} className="text-primary" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">Personal Info</h2>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="name" className="text-xs font-medium text-muted-foreground mb-1.5 block">Full Name</Label>
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
                <Label htmlFor="age" className="text-xs font-medium text-muted-foreground mb-1.5 block">Age</Label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
                <Label htmlFor="gender" className="text-xs font-medium text-muted-foreground mb-1.5 block">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger id="gender" className="h-11 bg-secondary/50 border-border focus:border-primary rounded-xl">
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
        <motion.div variants={itemVariants} className="rounded-2xl bg-card border border-border p-4 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Ruler size={14} className="text-blue-500" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">Body Measurements</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="height" className="text-xs font-medium text-muted-foreground mb-1.5 block">Height (cm)</Label>
              <div className="relative">
                <Ruler size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
              <Label htmlFor="weight" className="text-xs font-medium text-muted-foreground mb-1.5 block">Weight (kg)</Label>
              <div className="relative">
                <Weight size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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

        {/* Meal Reminders */}
        <motion.div variants={itemVariants} className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-yellow-500/15 flex items-center justify-center">
              <Bell size={14} className="text-yellow-500" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">Meal Reminders</h2>
          </div>
          <div className="space-y-3">
            {reminders.map((reminder, i) => (
              <div key={reminder.meal} className="flex items-center justify-between py-0.5">
                <div>
                  <p className="font-medium text-sm text-foreground">{reminder.meal}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(reminder.hour).padStart(2, "0")}:{String(reminder.minute).padStart(2, "0")}
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
          <motion.div variants={itemVariants} className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
            <CheckCircle size={12} className="text-primary" />
            <span>Profile set up · Last updated {new Date(Number(profile.updatedAt)).toLocaleDateString()}</span>
            <ChevronRight size={12} />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
