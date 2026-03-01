import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Dumbbell,
  Edit2,
  FileText,
  Flame,
  LayoutTemplate,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Search,
  Timer,
  Trash2,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { WorkoutLog } from "../backend.d";
import { useAppContext } from "../context/AppContext";
import type { Exercise } from "../data/exercises";
import {
  EXERCISES,
  EXERCISE_CATEGORIES,
  searchExercises,
} from "../data/exercises";
import {
  getLastSessionDataForExercise,
  usePRs,
  useRecentExercises,
  useSessions,
  useTemplates,
} from "../hooks/useWorkoutStorage";
import type {
  ExerciseSet,
  SessionExercise,
  WorkoutSession,
  WorkoutTemplate,
} from "../types/workout";

// ─── Utility Functions ────────────────────────────────────────────────────────

function genId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Calorie Estimation (MET-based) ──────────────────────────────────────────
// MET values per exercise category (metabolic equivalents)
const CATEGORY_MET: Record<string, number> = {
  Cardio: 8.0,
  "Full Body": 6.0,
  Legs: 5.5,
  Glutes: 5.0,
  Back: 4.5,
  Chest: 4.5,
  Shoulders: 4.0,
  Biceps: 3.5,
  Triceps: 3.5,
  Core: 4.0,
  Forearms: 3.0,
  Calves: 3.5,
};

/**
 * Estimate calories burned using MET formula:
 *   kcal = MET × weight_kg × duration_hours
 *
 * Uses a blended MET across all exercises in the session,
 * weighted by completed set count per category.
 *
 * @param exercises  Active session exercises
 * @param durationSeconds  Elapsed time in seconds
 * @param bodyWeightKg  User's body weight (default 70 kg if unknown)
 */
function estimateCaloriesBurned(
  exercises: SessionExercise[],
  durationSeconds: number,
  bodyWeightKg = 70,
): number {
  if (durationSeconds <= 0 || exercises.length === 0) return 0;

  // Count completed sets per category
  const setsByCategory: Record<string, number> = {};
  let totalSets = 0;
  for (const ex of exercises) {
    const completedSets = ex.sets.filter(
      (s) => s.completed && !s.isWarmup,
    ).length;
    if (completedSets > 0) {
      setsByCategory[ex.category] =
        (setsByCategory[ex.category] ?? 0) + completedSets;
      totalSets += completedSets;
    }
  }

  // Weighted average MET
  let avgMet = 4.0; // default if no sets completed yet
  if (totalSets > 0) {
    let weightedSum = 0;
    for (const [cat, count] of Object.entries(setsByCategory)) {
      weightedSum += (CATEGORY_MET[cat] ?? 4.0) * count;
    }
    avgMet = weightedSum / totalSets;
  }

  const hours = durationSeconds / 3600;
  return Math.round(avgMet * bodyWeightKg * hours);
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getTimeBasedName(): string {
  const h = new Date().getHours();
  if (h < 12) return "Morning Workout";
  if (h < 17) return "Afternoon Workout";
  return "Evening Workout";
}

function calcVolume(exercises: SessionExercise[]): number {
  return exercises.reduce(
    (total, ex) =>
      total +
      ex.sets.reduce(
        (s, set) => (set.completed ? s + set.weightKg * set.reps : s),
        0,
      ),
    0,
  );
}

// ─── Web Audio beep ───────────────────────────────────────────────────────────
function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    /* ignore if AudioContext unavailable */
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type View = "HOME" | "PLAN_SESSION" | "ACTIVE_SESSION" | "HISTORY_DETAIL";

interface RestTimerState {
  active: boolean;
  total: number;
  remaining: number;
  exerciseName: string;
}

// ─── Rest Timer Overlay ───────────────────────────────────────────────────────
function RestTimerOverlay({
  timer,
  onAdjust,
  onSkip,
}: {
  timer: RestTimerState;
  onAdjust: (delta: number) => void;
  onSkip: () => void;
}) {
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const progress = timer.remaining / timer.total;
  const dashOffset = circ * (1 - progress);

  // Use dedicated portal-root element (outside overflow-hidden containers)
  // so the timer is never clipped on iOS Safari / mobile WebKit.
  // Fall back to document.body if the element hasn't mounted yet.
  const portalTarget =
    typeof document !== "undefined"
      ? (document.getElementById("portal-root") ?? document.body)
      : null;

  if (!portalTarget) return null;

  const content = (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
      style={{
        position: "fixed",
        // Sit above the nav bar (≈64px) plus safe-area inset + 8px gap
        bottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 8px)",
        // Center horizontally in the viewport, constrained to viewport width
        left: 0,
        right: 0,
        marginLeft: "auto",
        marginRight: "auto",
        width: "min(calc(100vw - 32px), 360px)",
        zIndex: 10000,
        // Prevent any accidental overflow clipping
        overflow: "visible",
      }}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl p-4"
        style={{ width: "100%" }}
      >
        {/* Top row: label + exercise name + skip */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
            REST TIMER
          </span>
          <span className="text-xs text-foreground font-medium truncate mx-2 text-center flex-1">
            {timer.exerciseName}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="flex items-center justify-center px-3 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold hover:bg-primary/25 transition-colors flex-none"
          >
            Skip
          </button>
        </div>

        {/* Centered SVG ring */}
        <div className="flex justify-center mb-3">
          <div
            className="relative flex-none"
            style={{ width: 100, height: 100 }}
          >
            <svg
              width="100"
              height="100"
              viewBox="0 0 100 100"
              role="img"
              aria-label="Rest timer progress"
            >
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="oklch(var(--muted))"
                strokeWidth="6"
              />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="oklch(var(--primary))"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 50 50)"
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-2xl font-bold text-foreground">
                {formatDuration(timer.remaining)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom row: -30s / +30s centered */}
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => onAdjust(-30)}
            className="flex items-center justify-center w-12 h-10 rounded-full bg-secondary text-muted-foreground text-xs font-bold hover:bg-secondary/70 transition-colors"
          >
            −30s
          </button>
          <div className="h-px w-10 bg-border flex-none" />
          <button
            type="button"
            onClick={() => onAdjust(30)}
            className="flex items-center justify-center w-12 h-10 rounded-full bg-secondary text-muted-foreground text-xs font-bold hover:bg-secondary/70 transition-colors"
          >
            +30s
          </button>
        </div>
      </div>
    </motion.div>
  );

  return createPortal(content, portalTarget);
}

// ─── Exercise Library Modal ────────────────────────────────────────────────────
function ExerciseLibraryModal({
  open,
  onClose,
  onSelect,
  recentIds,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  recentIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<
    Exercise["category"] | null
  >(null);

  const recentExercises = useMemo(
    () =>
      recentIds
        .map((id) => EXERCISES.find((e) => e.id === id))
        .filter((e): e is Exercise => !!e),
    [recentIds],
  );

  const results = useMemo(() => {
    return searchExercises(query, activeCategory ?? undefined);
  }, [query, activeCategory]);

  const handleSelect = (ex: Exercise) => {
    onSelect(ex);
    onClose();
    setQuery("");
    setActiveCategory(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px] w-[95vw] max-h-[85vh] flex flex-col p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border flex-none">
          <DialogTitle className="font-display text-lg font-bold">
            Add Exercise
          </DialogTitle>
          <div className="relative mt-2">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search exercises..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-10 bg-secondary/50 border-border rounded-xl"
              autoComplete="off"
            />
          </div>
          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none -mx-1 px-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`flex-none px-3 py-1 rounded-full text-xs font-semibold transition-all ${!activeCategory ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
            >
              All
            </button>
            {EXERCISE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() =>
                  setActiveCategory((prev) => (prev === cat ? null : cat))
                }
                className={`flex-none px-3 py-1 rounded-full text-xs font-semibold transition-all ${activeCategory === cat ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Recent */}
          {!query && !activeCategory && recentExercises.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recently Used
              </p>
              {recentExercises.slice(0, 5).map((ex) => (
                <ExerciseRow
                  key={ex.id}
                  exercise={ex}
                  onSelect={handleSelect}
                />
              ))}
              <div className="h-px bg-border mx-4 my-2" />
            </div>
          )}

          {results.length === 0 ? (
            <div className="py-12 text-center">
              <Dumbbell
                size={32}
                className="text-muted-foreground/30 mx-auto mb-2"
              />
              <p className="text-sm text-muted-foreground">
                No exercises found
              </p>
            </div>
          ) : (
            results.map((ex) => (
              <ExerciseRow key={ex.id} exercise={ex} onSelect={handleSelect} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExerciseRow({
  exercise,
  onSelect,
}: {
  exercise: Exercise;
  onSelect: (e: Exercise) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(exercise)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 active:bg-secondary/80 transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-none">
        <Dumbbell size={16} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">
          {exercise.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {exercise.equipment} · {exercise.muscles.slice(0, 2).join(", ")}
        </p>
      </div>
      <Badge variant="secondary" className="text-[10px] flex-none">
        {exercise.category}
      </Badge>
    </button>
  );
}

// ─── Set Row ──────────────────────────────────────────────────────────────────
function SetRow({
  set,
  isWarmup,
  prevData,
  isPR,
  onUpdate,
  onDelete,
  onToggleComplete,
  onToggleWarmup,
  planMode = false,
}: {
  set: ExerciseSet;
  isWarmup: boolean;
  prevData?: { weightKg: number; reps: number };
  isPR: boolean;
  onUpdate: (field: "weightKg" | "reps", value: number) => void;
  onDelete: () => void;
  onToggleComplete: () => void;
  onToggleWarmup: () => void;
  planMode?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className={`grid gap-1.5 items-center px-2 py-1.5 rounded-xl transition-colors ${
        planMode
          ? "grid-cols-[32px_1fr_72px_64px_32px]"
          : "grid-cols-[32px_1fr_72px_64px_44px]"
      } ${
        set.completed
          ? "bg-green-500/10"
          : isWarmup
            ? "bg-yellow-500/5"
            : "bg-transparent"
      }`}
    >
      {/* Set label */}
      <div className="flex items-center justify-center">
        <span
          className={`text-xs font-bold ${
            isWarmup
              ? "text-yellow-500"
              : set.completed
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground"
          }`}
        >
          {isWarmup ? "W" : set.setNumber}
        </span>
      </div>

      {/* Previous */}
      <div className="flex items-center">
        {prevData ? (
          <span className="text-xs text-muted-foreground/60 truncate">
            {prevData.weightKg} × {prevData.reps}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/30">—</span>
        )}
      </div>

      {/* KG input */}
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          value={set.weightKg || ""}
          placeholder="0"
          onChange={(e) =>
            onUpdate("weightKg", Number.parseFloat(e.target.value) || 0)
          }
          className={`w-full h-9 text-center text-sm font-semibold rounded-lg border transition-colors bg-secondary/50 outline-none focus:ring-1 focus:ring-primary/50 ${
            set.completed
              ? "border-green-500/30 text-green-700 dark:text-green-400"
              : "border-border text-foreground"
          }`}
        />
      </div>

      {/* Reps input */}
      <div>
        <input
          type="number"
          inputMode="numeric"
          value={set.reps || ""}
          placeholder="0"
          onChange={(e) =>
            onUpdate("reps", Number.parseInt(e.target.value) || 0)
          }
          className={`w-full h-9 text-center text-sm font-semibold rounded-lg border transition-colors bg-secondary/50 outline-none focus:ring-1 focus:ring-primary/50 ${
            set.completed
              ? "border-green-500/30 text-green-700 dark:text-green-400"
              : "border-border text-foreground"
          }`}
        />
      </div>

      {/* Complete + PR (hidden in plan mode) / Delete button in plan mode */}
      {planMode ? (
        <div className="flex items-center justify-end">
          {/* Context menu only in plan mode */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-6 h-9 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <MoreVertical size={12} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden min-w-[140px]">
                <button
                  type="button"
                  onClick={() => {
                    onToggleWarmup();
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2.5 text-sm text-left hover:bg-secondary/50 transition-colors flex items-center gap-2"
                >
                  <span className="text-yellow-500 text-xs font-bold w-4">
                    W
                  </span>
                  {isWarmup ? "Remove Warmup" : "Mark Warmup"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2.5 text-sm text-left hover:bg-destructive/10 text-destructive transition-colors flex items-center gap-2"
                >
                  <Trash2 size={12} />
                  Delete Set
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1">
          {isPR && set.completed && (
            <Trophy size={10} className="text-yellow-500 flex-none" />
          )}
          <button
            type="button"
            onClick={onToggleComplete}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
              set.completed
                ? "bg-green-500 text-white"
                : "bg-secondary border border-border text-muted-foreground hover:border-green-500/50"
            }`}
            aria-label={set.completed ? "Mark incomplete" : "Mark complete"}
          >
            <Check size={14} />
          </button>

          {/* Context menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-6 h-9 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <MoreVertical size={12} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden min-w-[140px]">
                <button
                  type="button"
                  onClick={() => {
                    onToggleWarmup();
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2.5 text-sm text-left hover:bg-secondary/50 transition-colors flex items-center gap-2"
                >
                  <span className="text-yellow-500 text-xs font-bold w-4">
                    W
                  </span>
                  {isWarmup ? "Remove Warmup" : "Mark Warmup"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2.5 text-sm text-left hover:bg-destructive/10 text-destructive transition-colors flex items-center gap-2"
                >
                  <Trash2 size={12} />
                  Delete Set
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Exercise Card (Active Session / Plan Mode) ──────────────────────────────
function ExerciseCard({
  exercise,
  onUpdate,
  onDelete,
  onSetComplete,
  prs,
  checkAndUpdatePR,
  onRestStart,
  planMode = false,
}: {
  exercise: SessionExercise;
  onUpdate: (updated: SessionExercise) => void;
  onDelete: () => void;
  onSetComplete: (setId: string, completed: boolean) => void;
  prs: Record<
    string,
    { weightKg: number; reps: number; date: string; estimatedOneRM: number }
  >;
  checkAndUpdatePR: (id: string, w: number, r: number) => boolean;
  onRestStart: (exerciseName: string) => void;
  planMode?: boolean;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const prevSessionData = useMemo(
    () => getLastSessionDataForExercise(exercise.exerciseId),
    [exercise.exerciseId],
  );

  const addSet = (warmup = false) => {
    const regularSets = exercise.sets.filter((s) => !s.isWarmup);
    const lastSet = regularSets[regularSets.length - 1];
    const newSet: ExerciseSet = {
      id: genId(),
      setNumber: warmup ? 0 : regularSets.length + 1,
      weightKg: lastSet?.weightKg || 0,
      reps: lastSet?.reps || 10,
      completed: false,
      isWarmup: warmup,
    };
    onUpdate({ ...exercise, sets: [...exercise.sets, newSet] });
  };

  const updateSet = (
    setId: string,
    field: "weightKg" | "reps",
    value: number,
  ) => {
    onUpdate({
      ...exercise,
      sets: exercise.sets.map((s) =>
        s.id === setId ? { ...s, [field]: value } : s,
      ),
    });
  };

  const deleteSet = (setId: string) => {
    const remaining = exercise.sets.filter((s) => s.id !== setId);
    // Renumber regular sets
    let num = 1;
    const renumbered = remaining.map((s) => ({
      ...s,
      setNumber: s.isWarmup ? 0 : num++,
    }));
    onUpdate({ ...exercise, sets: renumbered });
  };

  const toggleComplete = (setId: string) => {
    const set = exercise.sets.find((s) => s.id === setId);
    if (!set) return;
    const newCompleted = !set.completed;

    // PR check on completion
    if (newCompleted && set.weightKg > 0 && set.reps > 0) {
      const isNewPR = checkAndUpdatePR(
        exercise.exerciseId,
        set.weightKg,
        set.reps,
      );
      if (isNewPR) {
        toast.success(`New PR on ${exercise.exerciseName}! 🏆`, {
          duration: 3000,
        });
      }
    }

    const updatedSets = exercise.sets.map((s) =>
      s.id === setId ? { ...s, completed: newCompleted } : s,
    );
    onUpdate({ ...exercise, sets: updatedSets });
    onSetComplete(setId, newCompleted);

    if (newCompleted && !set.isWarmup) {
      onRestStart(exercise.exerciseName);
    }
  };

  const toggleWarmup = (setId: string) => {
    const updatedSets = exercise.sets.map((s) => {
      if (s.id !== setId) return s;
      return { ...s, isWarmup: !s.isWarmup, setNumber: s.isWarmup ? 1 : 0 };
    });
    // Renumber regular sets
    let num = 1;
    const renumbered = updatedSets.map((s) => ({
      ...s,
      setNumber: s.isWarmup ? 0 : num++,
    }));
    onUpdate({ ...exercise, sets: renumbered });
  };

  const pr = prs[exercise.exerciseId];

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-3 pb-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-none mt-0.5">
          <Dumbbell size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-sm text-foreground truncate">
            {exercise.exerciseName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {exercise.category}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {exercise.equipment}
            </Badge>
            {pr && !planMode && (
              <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-semibold flex items-center gap-0.5">
                <Trophy size={9} />
                PR: {pr.weightKg}kg × {pr.reps}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setNotesOpen((v) => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/50 transition-colors"
            aria-label="Notes"
          >
            <FileText size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="Delete exercise"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Notes */}
      {notesOpen && (
        <div className="px-3 pb-2">
          <Textarea
            placeholder="Add notes for this exercise..."
            value={exercise.notes}
            onChange={(e) => onUpdate({ ...exercise, notes: e.target.value })}
            className="h-16 text-xs resize-none bg-secondary/50 border-border rounded-xl"
          />
        </div>
      )}

      {/* Column headers */}
      <div
        className={`grid gap-1.5 px-4 pb-1 ${planMode ? "grid-cols-[32px_1fr_72px_64px_32px]" : "grid-cols-[32px_1fr_72px_64px_44px]"}`}
      >
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">
          SET
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase">
          PREVIOUS
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">
          KG
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">
          REPS
        </span>
        {planMode ? (
          <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">
            •••
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">
            ✓
          </span>
        )}
      </div>

      {/* Sets */}
      <div className="px-2 space-y-0.5 pb-2">
        <AnimatePresence>
          {exercise.sets.map((set, i) => (
            <SetRow
              key={set.id}
              set={set}
              isWarmup={!!set.isWarmup}
              prevData={prevSessionData[i]}
              isPR={
                !!(
                  set.completed &&
                  set.weightKg > 0 &&
                  set.reps > 0 &&
                  pr &&
                  set.weightKg >= pr.weightKg &&
                  set.reps >= pr.reps
                )
              }
              onUpdate={(field, value) => updateSet(set.id, field, value)}
              onDelete={() => deleteSet(set.id)}
              onToggleComplete={() => toggleComplete(set.id)}
              onToggleWarmup={() => toggleWarmup(set.id)}
              planMode={planMode}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Footer buttons */}
      <div className="flex gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={() => addSet(true)}
          className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400 text-xs font-semibold hover:bg-yellow-500/15 transition-colors"
        >
          <Plus size={12} />
          Warmup Set
        </button>
        <button
          type="button"
          onClick={() => addSet(false)}
          className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/15 transition-colors"
        >
          <Plus size={12} />
          Add Set
        </button>
      </div>
    </div>
  );
}

// ─── Weekly Volume Chart (simple SVG bars) ───────────────────────────────────
function WeeklyVolumeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const days = useMemo(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const volume = sessions
        .filter((s) => s.date === dateStr)
        .reduce((t, s) => t + s.totalVolume, 0);
      return {
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        dateStr,
        volume,
      };
    });
  }, [sessions]);

  const maxVol = Math.max(...days.map((d) => d.volume), 1);
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <p className="font-display font-bold text-sm text-foreground mb-3">
        Weekly Volume
      </p>
      <div className="flex items-end gap-1.5 h-24">
        {days.map((d) => {
          const heightPct =
            d.volume > 0 ? Math.max((d.volume / maxVol) * 100, 8) : 0;
          const isToday = d.dateStr === todayStr;
          return (
            <div
              key={d.dateStr}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div
                className="w-full flex flex-col justify-end"
                style={{ height: "72px" }}
              >
                <div
                  className={`w-full rounded-t-lg transition-all duration-500 ${
                    isToday
                      ? "bg-primary"
                      : d.volume > 0
                        ? "bg-primary/40"
                        : "bg-secondary"
                  }`}
                  style={{
                    height: `${d.volume > 0 ? heightPct : 4}%`,
                    minHeight: "4px",
                  }}
                />
              </div>
              <span
                className={`text-[10px] font-semibold ${
                  isToday ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {d.label.slice(0, 1)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {days.filter((d) => d.volume > 0).length} training days this week
        </span>
        <span className="text-xs font-semibold text-primary">
          {Math.round(days.reduce((t, d) => t + d.volume, 0)).toLocaleString()}{" "}
          kg
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function WorkoutTrackerScreen() {
  const { addWorkoutLog, todayDate, profile } = useAppContext();
  const bodyWeightKg = profile?.weightKg ?? 70;
  const { sessions, addSession, deleteSession } = useSessions();
  const { templates, addTemplate, deleteTemplate, incrementUsage } =
    useTemplates();
  const { prs, checkAndUpdatePR } = usePRs();
  const { recentIds, addRecentExercise } = useRecentExercises();

  // ── View state ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<View>("HOME");
  const [historyDetailSession, setHistoryDetailSession] =
    useState<WorkoutSession | null>(null);
  const [templatePreview, setTemplatePreview] =
    useState<WorkoutTemplate | null>(null);

  // ── Plan session state ──────────────────────────────────────────────────────
  const [planExercises, setPlanExercises] = useState<SessionExercise[]>([]);
  const [planName, setPlanName] = useState("");
  const [planEditingName, setPlanEditingName] = useState(false);
  const planNameInputRef = useRef<HTMLInputElement>(null);

  // ── Active session state ────────────────────────────────────────────────────
  const [sessionName, setSessionName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Focus name input when editing starts
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [editingName]);

  // Focus plan name input when editing starts
  useEffect(() => {
    if (planEditingName && planNameInputRef.current) {
      planNameInputRef.current.focus();
    }
  }, [planEditingName]);

  // ── Rest timer ──────────────────────────────────────────────────────────────
  const [restTimer, setRestTimer] = useState<RestTimerState>({
    active: false,
    total: 90,
    remaining: 90,
    exerciseName: "",
  });
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [exerciseLibraryOpen, setExerciseLibraryOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [prAchieved, setPrAchieved] = useState<string[]>([]);
  const [caloriesOverride, setCaloriesOverride] = useState<string>("");

  // ── Timer tick ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!timerActive || isPaused) return;
    const interval = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, isPaused]);

  // ── Rest timer countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (!restTimer.active || isPaused) return;
    restIntervalRef.current = setInterval(() => {
      setRestTimer((prev) => {
        if (prev.remaining <= 1) {
          playBeep();
          if (restIntervalRef.current) clearInterval(restIntervalRef.current);
          return { ...prev, active: false, remaining: 0 };
        }
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    };
  }, [restTimer.active, isPaused]);

  // ── Start workout (from plan or fresh) ─────────────────────────────────────
  const startWorkout = useCallback(
    (preloadExercises?: SessionExercise[], name?: string) => {
      const now = Date.now();
      setSessionName(name || getTimeBasedName());
      setExercises(preloadExercises || []);
      setSessionStartTime(now);
      setElapsed(0);
      setTimerActive(true);
      setIsPaused(false);
      setPrAchieved([]);
      setSessionNotes("");
      setView("ACTIVE_SESSION");
    },
    [],
  );

  // ── Go to plan session (pre-fill from template or empty) ───────────────────
  const goToPlanning = useCallback(
    (preloadExercises: SessionExercise[], name: string) => {
      setPlanName(name);
      setPlanExercises(preloadExercises);
      setView("PLAN_SESSION");
    },
    [],
  );

  // ── Start from template → go to plan ───────────────────────────────────────
  const startFromTemplate = useCallback(
    (templateId: string) => {
      const template = templates.find((t) => t.id === templateId);
      if (!template) return;
      incrementUsage(templateId);
      const preloadExercises: SessionExercise[] = template.exercises.map(
        (te) => ({
          id: genId(),
          exerciseId: te.exerciseId,
          exerciseName: te.exerciseName,
          category: te.category,
          equipment: te.equipment,
          notes: "",
          sets: Array.from({ length: te.defaultSets }, (_, i) => ({
            id: genId(),
            setNumber: i + 1,
            weightKg: te.defaultWeightKg,
            reps: te.defaultReps,
            completed: false,
          })),
        }),
      );
      goToPlanning(preloadExercises, template.name);
    },
    [templates, incrementUsage, goToPlanning],
  );

  // ── Add exercise (works for both plan and active session) ──────────────────
  const addExercise = useCallback(
    (ex: Exercise) => {
      addRecentExercise(ex.id);
      const newEx: SessionExercise = {
        id: genId(),
        exerciseId: ex.id,
        exerciseName: ex.name,
        category: ex.category,
        equipment: ex.equipment,
        notes: "",
        sets: [
          {
            id: genId(),
            setNumber: 1,
            weightKg: 0,
            reps: 10,
            completed: false,
          },
        ],
      };
      if (view === "PLAN_SESSION") {
        setPlanExercises((prev) => [...prev, newEx]);
      } else {
        setExercises((prev) => [...prev, newEx]);
      }
    },
    [addRecentExercise, view],
  );

  // ── Update exercise (works for both plan and active session) ───────────────
  const updateExercise = useCallback(
    (updated: SessionExercise) => {
      if (view === "PLAN_SESSION") {
        setPlanExercises((prev) =>
          prev.map((e) => (e.id === updated.id ? updated : e)),
        );
      } else {
        setExercises((prev) =>
          prev.map((e) => (e.id === updated.id ? updated : e)),
        );
      }
    },
    [view],
  );

  // ── Delete exercise (works for both plan and active session) ───────────────
  const deleteExercise = useCallback(
    (id: string) => {
      if (view === "PLAN_SESSION") {
        setPlanExercises((prev) => prev.filter((e) => e.id !== id));
      } else {
        setExercises((prev) => prev.filter((e) => e.id !== id));
      }
    },
    [view],
  );

  // ── Handle cancel ───────────────────────────────────────────────────────────
  const handleCancelWorkout = () => {
    if (exercises.length > 0) {
      setCancelConfirmOpen(true);
    } else {
      confirmCancel();
    }
  };

  const confirmCancel = () => {
    setTimerActive(false);
    setView("HOME");
    setExercises([]);
    setCancelConfirmOpen(false);
    setRestTimer((r) => ({ ...r, active: false }));
  };

  // ── Handle finish ───────────────────────────────────────────────────────────
  const handleFinishWorkout = () => {
    setFinishModalOpen(true);
  };

  const saveWorkout = async () => {
    const endTime = Date.now();
    const totalVolume = calcVolume(exercises);
    const completedSets = exercises.reduce(
      (t, ex) => t + ex.sets.filter((s) => s.completed).length,
      0,
    );
    const finalCalories =
      caloriesOverride !== "" && !Number.isNaN(Number(caloriesOverride))
        ? Math.max(0, Number(caloriesOverride))
        : estimateCaloriesBurned(exercises, elapsed, bodyWeightKg);

    const session: WorkoutSession = {
      id: genId(),
      name: sessionName,
      date: todayDate,
      startTime: sessionStartTime,
      endTime,
      durationSeconds: elapsed,
      exercises,
      totalVolume,
      totalSets: completedSets,
      notes: sessionNotes,
      caloriesBurned: finalCalories,
    };

    addSession(session);

    // AppContext workout log (used by Dashboard for calories burned today)
    const workoutLog: WorkoutLog = {
      id: session.id,
      date: todayDate,
      workoutName: sessionName,
      durationMinutes: BigInt(Math.max(1, Math.round(elapsed / 60))),
      caloriesBurned: finalCalories,
    };
    await addWorkoutLog(workoutLog);

    toast.success(`Workout saved! ${finalCalories} kcal burned 🔥`, {
      duration: 3000,
    });
    setFinishModalOpen(false);
    setTimerActive(false);
    setView("HOME");
    setExercises([]);
    setCaloriesOverride("");
    setRestTimer((r) => ({ ...r, active: false }));
  };

  // ── Save as template ────────────────────────────────────────────────────────
  const saveAsTemplate = () => {
    if (!templateName.trim()) {
      toast.error("Enter a template name");
      return;
    }
    addTemplate({
      id: genId(),
      name: templateName.trim(),
      description: `${exercises.length} exercises`,
      exercises: exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        category: ex.category,
        equipment: ex.equipment,
        defaultSets: ex.sets.filter((s) => !s.isWarmup).length || 3,
        defaultReps: ex.sets.filter((s) => !s.isWarmup)[0]?.reps || 10,
        defaultWeightKg: ex.sets.filter((s) => !s.isWarmup)[0]?.weightKg || 0,
      })),
      createdAt: Date.now(),
      usageCount: 0,
    });
    toast.success(`Template "${templateName}" saved!`);
    setSaveTemplateOpen(false);
    setTemplateName("");
  };

  // ── Rest timer controls ─────────────────────────────────────────────────────
  const startRestTimer = useCallback((exerciseName: string) => {
    setRestTimer({
      active: true,
      total: 90,
      remaining: 90,
      exerciseName,
    });
  }, []);

  const adjustRestTimer = useCallback((delta: number) => {
    setRestTimer((prev) => {
      const newTotal = Math.max(10, prev.total + delta);
      const newRemaining = Math.max(1, prev.remaining + delta);
      return { ...prev, total: newTotal, remaining: newRemaining };
    });
  }, []);

  const skipRestTimer = useCallback(() => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestTimer((r) => ({ ...r, active: false }));
  }, []);

  // ── Derived stats for finish modal ──────────────────────────────────────────
  const totalVolume = calcVolume(exercises);
  const completedSets = exercises.reduce(
    (t, ex) => t + ex.sets.filter((s) => s.completed).length,
    0,
  );

  // Live calorie estimate (updates every second via `elapsed`)
  const estimatedCalories = estimateCaloriesBurned(
    exercises,
    elapsed,
    bodyWeightKg,
  );
  // Resolved calories: user override takes precedence, else auto-estimate
  const resolvedCalories =
    caloriesOverride !== "" && !Number.isNaN(Number(caloriesOverride))
      ? Math.max(0, Number(caloriesOverride))
      : estimatedCalories;

  // ── History items ───────────────────────────────────────────────────────────
  const visibleSessions = showAllHistory ? sessions : sessions.slice(0, 5);

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background scroll-area-content overflow-y-auto relative">
      <AnimatePresence mode="wait" initial={false}>
        {/* ─── HOME VIEW ────────────────────────────────────────────────────── */}
        {view === "HOME" && (
          <motion.div
            key="home"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-xl font-bold text-foreground">
                    Workout
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {new Date().toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">This week</p>
                    <p className="font-display font-bold text-sm text-primary">
                      {
                        sessions.filter((s) => {
                          const d = new Date(s.date);
                          const today = new Date();
                          const dayOfWeek = today.getDay();
                          const monday = new Date(today);
                          monday.setDate(
                            today.getDate() -
                              (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
                          );
                          return d >= monday;
                        }).length
                      }{" "}
                      sessions
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-4 space-y-5">
              {/* Start Workout CTA */}
              <motion.button
                type="button"
                onClick={() => {
                  goToPlanning([], getTimeBasedName());
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full rounded-2xl bg-primary text-primary-foreground py-4 flex items-center justify-center gap-3 font-display font-bold text-base shadow-glow"
              >
                <div className="w-8 h-8 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                  <Zap size={18} fill="currentColor" />
                </div>
                Start Empty Workout
              </motion.button>

              {/* Templates */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <LayoutTemplate size={14} className="text-primary" />
                    <h2 className="font-display font-bold text-sm text-foreground uppercase tracking-wider">
                      My Templates
                    </h2>
                  </div>
                </div>

                {templates.length === 0 ? (
                  <div className="rounded-2xl bg-card border border-dashed border-border p-6 text-center">
                    <LayoutTemplate
                      size={24}
                      className="text-muted-foreground/30 mx-auto mb-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      Save a workout as template to reuse it
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
                    {templates.map((t) => (
                      <div
                        key={t.id}
                        className="flex-none w-44 rounded-2xl bg-card border border-border p-3"
                      >
                        <p className="font-display font-bold text-sm text-foreground truncate">
                          {t.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t.exercises.length} exercises · {t.usageCount}× used
                        </p>
                        <div className="flex gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => setTemplatePreview(t)}
                            className="flex-1 h-8 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTemplate(t.id)}
                            className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Weekly Volume Chart */}
              <WeeklyVolumeChart sessions={sessions} />

              {/* Recent History */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity size={14} className="text-primary" />
                    <h2 className="font-display font-bold text-sm text-foreground uppercase tracking-wider">
                      History
                    </h2>
                  </div>
                  {sessions.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllHistory((v) => !v)}
                      className="text-xs text-primary font-semibold flex items-center gap-0.5"
                    >
                      {showAllHistory ? "Show Less" : "View All"}
                      <ChevronRight size={12} />
                    </button>
                  )}
                </div>

                {sessions.length === 0 ? (
                  <div className="rounded-2xl bg-card border border-dashed border-border p-8 text-center">
                    <Dumbbell
                      size={28}
                      className="text-muted-foreground/30 mx-auto mb-2"
                    />
                    <p className="font-semibold text-sm text-foreground">
                      No workouts yet
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Complete your first workout to see it here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {visibleSessions.map((session) => (
                        <motion.div
                          key={session.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryDetailSession(session);
                              setView("HISTORY_DETAIL");
                            }}
                            className="w-full rounded-2xl bg-card border border-border p-3 text-left hover:border-primary/30 transition-colors active:scale-[0.99]"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-none">
                                <Dumbbell size={16} className="text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p className="font-display font-bold text-sm text-foreground truncate">
                                    {session.name}
                                  </p>
                                  <ChevronRight
                                    size={14}
                                    className="text-muted-foreground flex-none ml-1"
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {formatDate(session.date)}
                                </p>
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock size={10} />
                                    {formatDuration(session.durationSeconds)}
                                  </span>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Dumbbell size={10} />
                                    {session.totalSets} sets
                                  </span>
                                  <span className="text-xs font-semibold text-primary flex items-center gap-1">
                                    <Zap size={10} />
                                    {Math.round(
                                      session.totalVolume,
                                    ).toLocaleString()}{" "}
                                    kg
                                  </span>
                                  {session.caloriesBurned != null &&
                                    session.caloriesBurned > 0 && (
                                      <span className="text-xs font-semibold text-orange-500 flex items-center gap-1">
                                        <Flame size={10} />
                                        {session.caloriesBurned} kcal
                                      </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                  {session.exercises
                                    .map((e) => e.exerciseName)
                                    .slice(0, 3)
                                    .join(", ")}
                                  {session.exercises.length > 3 &&
                                    ` +${session.exercises.length - 3} more`}
                                </p>
                              </div>
                            </div>
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── PLAN SESSION VIEW ────────────────────────────────────────── */}
        {view === "PLAN_SESSION" && (
          <motion.div
            key="plan"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="min-h-screen flex flex-col"
          >
            {/* Plan header */}
            <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3 flex-none">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setView("HOME")}
                  className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-none"
                  aria-label="Back to home"
                >
                  <ArrowLeft size={18} />
                </button>

                <div className="flex-1 min-w-0">
                  {planEditingName ? (
                    <input
                      ref={planNameInputRef}
                      type="text"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      onBlur={() => setPlanEditingName(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setPlanEditingName(false);
                      }}
                      className="w-full font-display font-bold text-base text-foreground bg-transparent border-b-2 border-primary outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlanEditingName(true)}
                      className="flex items-center gap-1.5 group"
                    >
                      <span className="font-display font-bold text-base text-foreground truncate">
                        {planName}
                      </span>
                      <Edit2
                        size={12}
                        className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex-none"
                      />
                    </button>
                  )}
                </div>

                {planExercises.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-primary/10 rounded-xl px-2.5 py-1.5 flex-none">
                    <Dumbbell size={12} className="text-primary" />
                    <span className="font-display font-bold text-xs text-primary tabular-nums">
                      {planExercises.length}
                    </span>
                  </div>
                )}
              </div>

              {/* Plan mode info banner */}
              <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-primary/5 border border-primary/15 px-3 py-1.5">
                <FileText size={12} className="text-primary flex-none" />
                <p className="text-xs text-muted-foreground">
                  Plan your workout, then tap{" "}
                  <span className="text-primary font-semibold">
                    Start Workout
                  </span>{" "}
                  when ready.
                </p>
              </div>
            </div>

            {/* Exercise list */}
            <div className="flex-1 px-4 py-4 space-y-3 pb-28">
              {planExercises.length === 0 && (
                <div className="rounded-2xl bg-card border border-dashed border-border p-10 text-center">
                  <Dumbbell
                    size={36}
                    className="text-muted-foreground/25 mx-auto mb-3"
                  />
                  <p className="font-display font-bold text-foreground mb-1">
                    No exercises yet
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Add exercises to plan your workout
                  </p>
                </div>
              )}

              <AnimatePresence>
                {planExercises.map((ex) => (
                  <motion.div
                    key={ex.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -8 }}
                  >
                    <ExerciseCard
                      exercise={ex}
                      onUpdate={updateExercise}
                      onDelete={() => deleteExercise(ex.id)}
                      onSetComplete={() => {}}
                      prs={prs}
                      checkAndUpdatePR={checkAndUpdatePR}
                      onRestStart={() => {}}
                      planMode={true}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Inline Add Exercise button */}
              <motion.button
                type="button"
                onClick={() => setExerciseLibraryOpen(true)}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 text-primary font-semibold text-sm transition-all"
              >
                <Plus size={16} />
                Add Exercise
              </motion.button>
            </div>

            {/* Start Workout sticky button */}
            <div className="fixed bottom-[76px] left-0 right-0 px-4 z-30 pb-2">
              <motion.button
                type="button"
                onClick={() => startWorkout(planExercises, planName)}
                whileTap={{ scale: 0.98 }}
                className="w-full max-w-[480px] mx-auto block rounded-2xl bg-green-500 text-white py-4 flex items-center justify-center gap-3 font-display font-bold text-base shadow-lg hover:bg-green-600 transition-colors"
              >
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Play size={18} fill="currentColor" />
                </div>
                Start Workout
                {planExercises.length > 0 && (
                  <span className="ml-1 text-white/70 font-normal text-sm">
                    · {planExercises.length}{" "}
                    {planExercises.length === 1 ? "exercise" : "exercises"}
                  </span>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ─── ACTIVE SESSION VIEW ───────────────────────────────────────── */}
        {view === "ACTIVE_SESSION" && (
          <motion.div
            key="session"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="min-h-screen flex flex-col"
          >
            {/* Session header */}
            <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3 flex-none">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelWorkout}
                  className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-none"
                  aria-label="Cancel workout"
                >
                  <X size={18} />
                </button>

                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                      onBlur={() => setEditingName(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setEditingName(false);
                      }}
                      className="w-full font-display font-bold text-base text-foreground bg-transparent border-b-2 border-primary outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingName(true)}
                      className="flex items-center gap-1.5 group"
                    >
                      <span className="font-display font-bold text-base text-foreground truncate">
                        {sessionName}
                      </span>
                      <Edit2
                        size={12}
                        className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex-none"
                      />
                    </button>
                  )}
                </div>

                {/* Pause/Resume button */}
                <button
                  type="button"
                  onClick={() => setIsPaused((p) => !p)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-none ${
                    isPaused
                      ? "bg-green-500/15 text-green-600 dark:text-green-400 ring-1 ring-green-500/30"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label={isPaused ? "Resume workout" : "Pause workout"}
                >
                  {isPaused ? <Play size={16} /> : <Pause size={16} />}
                </button>

                {/* Timer */}
                <div
                  className={`flex flex-col items-center bg-secondary rounded-xl px-2.5 py-1 flex-none transition-opacity ${isPaused ? "opacity-50" : "opacity-100"}`}
                >
                  <div className="flex items-center gap-1">
                    <Timer size={11} className="text-primary" />
                    <span className="font-display font-bold text-sm text-foreground tabular-nums">
                      {formatDuration(elapsed)}
                    </span>
                  </div>
                  {isPaused && (
                    <span className="text-[9px] font-bold text-yellow-500 uppercase tracking-widest leading-none">
                      PAUSED
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleFinishWorkout}
                  className="h-9 px-3 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 transition-colors flex-none"
                >
                  Finish
                </button>
              </div>

              {/* Quick stats bar */}
              {(completedSets > 0 || totalVolume > 0 || elapsed > 0) && (
                <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">
                      {exercises.length}
                    </span>{" "}
                    exercises
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">
                      {completedSets}
                    </span>{" "}
                    sets
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-bold text-primary">
                      {Math.round(totalVolume).toLocaleString()}kg
                    </span>{" "}
                    volume
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Flame size={10} className="text-orange-500" />
                    <span className="font-bold text-orange-500">
                      {resolvedCalories}
                    </span>{" "}
                    kcal
                  </span>
                </div>
              )}
            </div>

            {/* Exercise list */}
            <div className="flex-1 px-4 py-4 space-y-3 pb-32">
              {exercises.length === 0 && (
                <div className="rounded-2xl bg-card border border-dashed border-border p-10 text-center">
                  <Dumbbell
                    size={36}
                    className="text-muted-foreground/25 mx-auto mb-3"
                  />
                  <p className="font-display font-bold text-foreground mb-1">
                    No exercises yet
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Tap the button below to add exercises
                  </p>
                </div>
              )}

              <AnimatePresence>
                {exercises.map((ex) => (
                  <motion.div
                    key={ex.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -8 }}
                  >
                    <ExerciseCard
                      exercise={ex}
                      onUpdate={updateExercise}
                      onDelete={() => deleteExercise(ex.id)}
                      onSetComplete={() => {}}
                      prs={prs}
                      checkAndUpdatePR={checkAndUpdatePR}
                      onRestStart={startRestTimer}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Save as Template button */}
              {exercises.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSaveTemplateOpen(true)}
                  className="w-full rounded-2xl border border-border bg-card py-3 flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                >
                  <LayoutTemplate size={14} />
                  Save as Template
                </button>
              )}

              {/* Notes */}
              <div className="rounded-2xl bg-card border border-border p-3">
                <label
                  htmlFor="session-notes"
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2"
                >
                  Workout Notes
                </label>
                <Textarea
                  id="session-notes"
                  placeholder="How did the workout go? Any PRs or observations..."
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  className="h-20 text-sm resize-none bg-secondary/50 border-border rounded-xl"
                />
              </div>
            </div>

            {/* Add Exercise FAB */}
            <div className="fixed bottom-[76px] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[440px] z-30 pointer-events-none">
              <div className="flex justify-center pointer-events-auto">
                {!restTimer.active && (
                  <motion.button
                    type="button"
                    onClick={() => setExerciseLibraryOpen(true)}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 h-12 px-6 rounded-full bg-primary text-primary-foreground font-bold text-sm shadow-glow"
                  >
                    <Plus size={18} />
                    Add Exercise
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── HISTORY DETAIL VIEW ────────────────────────────────────────── */}
        {view === "HISTORY_DETAIL" && historyDetailSession && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setView("HOME")}
                  className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="flex-1 min-w-0">
                  <h1 className="font-display text-base font-bold text-foreground truncate">
                    {historyDetailSession.name}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(historyDetailSession.date)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    deleteSession(historyDetailSession.id);
                    setView("HOME");
                    toast.success("Workout deleted");
                  }}
                  className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* Stats row */}
              <div
                className={`grid gap-2 ${historyDetailSession.caloriesBurned != null && historyDetailSession.caloriesBurned > 0 ? "grid-cols-2" : "grid-cols-3"}`}
              >
                {[
                  {
                    label: "Duration",
                    value: formatDuration(historyDetailSession.durationSeconds),
                    icon: <Clock size={14} className="text-primary" />,
                  },
                  {
                    label: "Sets",
                    value: String(historyDetailSession.totalSets),
                    icon: <Dumbbell size={14} className="text-primary" />,
                  },
                  {
                    label: "Volume",
                    value: `${Math.round(historyDetailSession.totalVolume).toLocaleString()}kg`,
                    icon: <Zap size={14} className="text-primary" />,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl bg-card border border-border p-3 flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-1">
                      {stat.icon}
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {stat.label}
                      </span>
                    </div>
                    <span className="font-display font-bold text-sm text-foreground">
                      {stat.value}
                    </span>
                  </div>
                ))}

                {/* Calories burned card — shown when data exists */}
                {historyDetailSession.caloriesBurned != null &&
                  historyDetailSession.caloriesBurned > 0 && (
                    <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-3 flex flex-col gap-1 col-span-2">
                      <div className="flex items-center gap-1">
                        <Flame size={14} className="text-orange-500" />
                        <span className="text-[10px] text-orange-500 uppercase font-semibold">
                          Calories Burned
                        </span>
                      </div>
                      <span className="font-display font-bold text-xl text-orange-600 dark:text-orange-400">
                        {historyDetailSession.caloriesBurned} kcal
                      </span>
                    </div>
                  )}
              </div>

              {/* Notes */}
              {historyDetailSession.notes && (
                <div className="rounded-xl bg-card border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                    Notes
                  </p>
                  <p className="text-sm text-foreground">
                    {historyDetailSession.notes}
                  </p>
                </div>
              )}

              {/* Exercise breakdown */}
              <div className="space-y-3">
                {historyDetailSession.exercises.map((ex) => {
                  const vol = ex.sets
                    .filter((s) => s.completed)
                    .reduce((t, s) => t + s.weightKg * s.reps, 0);
                  return (
                    <div
                      key={ex.id}
                      className="rounded-2xl bg-card border border-border overflow-hidden"
                    >
                      <div className="flex items-center gap-3 p-3 pb-2">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-none">
                          <Dumbbell size={14} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-display font-bold text-sm text-foreground truncate">
                            {ex.exerciseName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {ex.sets.filter((s) => s.completed).length} sets ·{" "}
                            {Math.round(vol)}kg volume
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {ex.category}
                        </Badge>
                      </div>

                      {/* Set details */}
                      <div className="px-3 pb-3 space-y-1">
                        <div className="grid grid-cols-[24px_1fr_72px_60px] gap-2 px-1">
                          {["Set", "", "Weight", "Reps"].map((h) => (
                            <span
                              key={h}
                              className="text-[10px] font-semibold text-muted-foreground uppercase"
                            >
                              {h}
                            </span>
                          ))}
                        </div>
                        {ex.sets.map((set) => (
                          <div
                            key={set.id}
                            className={`grid grid-cols-[24px_1fr_72px_60px] gap-2 px-1 py-1 rounded-lg ${
                              set.completed ? "bg-green-500/8" : "opacity-40"
                            }`}
                          >
                            <span className="text-xs font-bold text-muted-foreground">
                              {set.isWarmup ? "W" : set.setNumber}
                            </span>
                            <span />
                            <span className="text-xs font-semibold text-foreground">
                              {set.weightKg} kg
                            </span>
                            <span className="text-xs font-semibold text-foreground">
                              {set.reps}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Exercise Library Modal ──────────────────────────────────────────── */}
      <ExerciseLibraryModal
        open={exerciseLibraryOpen}
        onClose={() => setExerciseLibraryOpen(false)}
        onSelect={addExercise}
        recentIds={recentIds}
      />

      {/* ─── Cancel Confirm Dialog ───────────────────────────────────────────── */}
      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={18} className="text-destructive" />
              <DialogTitle>Cancel Workout?</DialogTitle>
            </div>
            <DialogDescription>
              Your progress will be lost. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setCancelConfirmOpen(false)}
              className="flex-1 rounded-xl"
            >
              Keep Going
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              className="flex-1 rounded-xl"
            >
              Cancel Workout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Finish Workout Modal ────────────────────────────────────────────── */}
      <Dialog open={finishModalOpen} onOpenChange={setFinishModalOpen}>
        <DialogContent className="max-w-[380px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              Finish Workout 💪
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: "Duration",
                  value: formatDuration(elapsed),
                  icon: <Timer size={14} className="text-primary" />,
                },
                {
                  label: "Exercises",
                  value: String(exercises.length),
                  icon: <Dumbbell size={14} className="text-primary" />,
                },
                {
                  label: "Sets Done",
                  value: String(completedSets),
                  icon: <Activity size={14} className="text-primary" />,
                },
                {
                  label: "Total Volume",
                  value: `${Math.round(totalVolume).toLocaleString()}kg`,
                  icon: <Flame size={14} className="text-orange-500" />,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl bg-secondary/50 p-3 flex items-center gap-2"
                >
                  {s.icon}
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                      {s.label}
                    </p>
                    <p className="font-display font-bold text-sm text-foreground">
                      {s.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Calories burned card */}
            <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <Flame size={16} className="text-orange-500" />
                  </div>
                  <div>
                    <p className="text-[10px] text-orange-600 dark:text-orange-400 uppercase font-bold tracking-wide">
                      Calories Burned
                    </p>
                    <p className="font-display font-bold text-lg text-orange-600 dark:text-orange-400 leading-tight">
                      {resolvedCalories} kcal
                    </p>
                  </div>
                </div>
                <div className="text-right flex-none">
                  <p className="text-[10px] text-muted-foreground mb-1">
                    Override
                  </p>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder={String(estimatedCalories)}
                    value={caloriesOverride}
                    onChange={(e) => setCaloriesOverride(e.target.value)}
                    className="w-20 h-8 text-sm text-center rounded-lg bg-background border-border"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Auto-calculated from exercise type, duration &amp; body weight (
                {bodyWeightKg} kg). Edit to override.
              </p>
            </div>

            {prAchieved.length > 0 && (
              <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3">
                <p className="text-xs font-bold text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5 mb-1">
                  <Trophy size={12} />
                  New PRs This Session!
                </p>
                <div className="space-y-0.5">
                  {prAchieved.map((ex) => (
                    <p key={ex} className="text-xs text-foreground">
                      {ex}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setFinishModalOpen(false)}
              className="flex-1 rounded-xl"
            >
              Back
            </Button>
            <Button
              onClick={saveWorkout}
              className="flex-1 rounded-xl bg-green-500 text-white hover:bg-green-600"
            >
              Save Workout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Save Template Dialog ────────────────────────────────────────────── */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Give your template a name to reuse this workout later.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. Push Day A"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveAsTemplate()}
            className="rounded-xl"
          />
          <DialogFooter>
            <Button onClick={saveAsTemplate} className="w-full rounded-xl">
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Template Preview Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={!!templatePreview}
        onOpenChange={(o) => {
          if (!o) setTemplatePreview(null);
        }}
      >
        <DialogContent className="max-w-[420px] w-[95vw] max-h-[85vh] flex flex-col p-0 gap-0 rounded-2xl overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-border flex-none">
            <DialogTitle className="font-display text-lg font-bold flex items-center gap-2">
              <LayoutTemplate size={18} className="text-primary" />
              {templatePreview?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {templatePreview?.exercises.length} exercises ·{" "}
              {templatePreview?.usageCount}× used
            </DialogDescription>
          </DialogHeader>

          {/* Exercise list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {templatePreview?.exercises.map((ex, idx) => (
              <div
                key={`${ex.exerciseId}-${idx}`}
                className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-secondary/50"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-none text-xs font-bold text-primary">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">
                    {ex.exerciseName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ex.defaultSets} sets × {ex.defaultReps} reps
                    {ex.defaultWeightKg > 0 ? ` · ${ex.defaultWeightKg}kg` : ""}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] flex-none">
                  {ex.category}
                </Badge>
              </div>
            ))}
          </div>

          <DialogFooter className="px-4 pb-4 pt-3 border-t border-border flex gap-2 flex-none">
            <Button
              variant="outline"
              onClick={() => setTemplatePreview(null)}
              className="flex-1 rounded-xl"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                if (templatePreview) {
                  startFromTemplate(templatePreview.id);
                  setTemplatePreview(null);
                }
              }}
              className="flex-1 rounded-xl bg-primary text-primary-foreground font-bold"
            >
              <Zap size={14} className="mr-1.5" />
              Plan Workout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Rest Timer Overlay ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {restTimer.active && (
          <RestTimerOverlay
            timer={restTimer}
            onAdjust={adjustRestTimer}
            onSkip={skipRestTimer}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
