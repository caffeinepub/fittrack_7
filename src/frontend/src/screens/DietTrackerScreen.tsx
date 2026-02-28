import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Apple,
  BookOpen,
  ChefHat,
  ChevronDown,
  ChevronUp,
  List,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import type { FoodLog } from "../backend.d";
import RecipeBuilder from "../components/RecipeBuilder";
import { useAppContext } from "../context/AppContext";
import {
  FOOD_DATABASE,
  type FoodItem,
  getAllCategories,
  getAllFoods,
  searchLocalFood,
} from "../data/foodDatabase";
import { searchFoodUSDA } from "../services/foodApiService";

// Macro colors (hex so Recharts can parse them)
const MACRO_COLORS = {
  protein: "#3b82f6",
  carbs: "#f59e0b",
  fat: "#f97316",
} as const;

// Default macro goals
const DEFAULT_MACRO_GOALS = { protein: 150, carbs: 250, fat: 60 };

function getMacroGoals(): { protein: number; carbs: number; fat: number } {
  try {
    const stored = localStorage.getItem("fittrack_macro_goals");
    if (stored) {
      const parsed = JSON.parse(stored) as {
        protein: number;
        carbs: number;
        fat: number;
      };
      if (parsed.protein && parsed.carbs && parsed.fat) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_MACRO_GOALS;
}

interface MacroPieTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>;
}
function MacroPieTooltip({ active, payload }: MacroPieTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground">
        {entry.name}:{" "}
        <span style={{ color: entry.payload.fill }}>{entry.value} kcal</span>
      </p>
    </div>
  );
}

interface MacroBarTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}
function MacroBarTooltip({ active, payload, label }: MacroBarTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground">
          {p.value}g consumed
        </p>
      ))}
    </div>
  );
}

// Build a lookup map: food name (lowercase) -> FoodItem for quick isLiquid + macro lookups
const FOOD_LOOKUP = new Map<string, FoodItem>();
for (const f of FOOD_DATABASE) FOOD_LOOKUP.set(f.name.toLowerCase(), f);

// Helper: calculate macros for a logged food (grams × nutrient/100)
function calcMacros(
  food: { protein?: number; carbs?: number; fat?: number } | undefined,
  grams: number,
): { protein: number; carbs: number; fat: number } {
  if (!food) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: Math.round(((food.protein ?? 0) / 100) * grams * 10) / 10,
    carbs: Math.round(((food.carbs ?? 0) / 100) * grams * 10) / 10,
    fat: Math.round(((food.fat ?? 0) / 100) * grams * 10) / 10,
  };
}

// ── Macro Donut Chart Component ────────────────────────────────────────────
function MacroDonutCard({
  dailyMacros,
}: {
  dailyMacros: { protein: number; carbs: number; fat: number };
}) {
  const proteinKcal = Math.round(dailyMacros.protein * 4);
  const carbsKcal = Math.round(dailyMacros.carbs * 4);
  const fatKcal = Math.round(dailyMacros.fat * 9);
  const totalKcal = proteinKcal + carbsKcal + fatKcal;

  const pieData = [
    { name: "Protein", value: proteinKcal, fill: MACRO_COLORS.protein },
    { name: "Carbs", value: carbsKcal, fill: MACRO_COLORS.carbs },
    { name: "Fat", value: fatKcal, fill: MACRO_COLORS.fat },
  ].filter((d) => d.value > 0);

  if (totalKcal === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-card border border-border p-4"
    >
      <p className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
        Macro Split (kcal)
      </p>
      <div className="relative flex justify-center">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              dataKey="value"
              paddingAngle={3}
              strokeWidth={0}
            >
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<MacroPieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="font-display text-xl font-bold text-foreground">
            {totalKcal}
          </p>
          <p className="text-[10px] text-muted-foreground">kcal</p>
        </div>
      </div>
      {/* Legend */}
      <div className="flex justify-center gap-4 mt-1">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: MACRO_COLORS.protein }}
          />
          <span className="text-xs text-muted-foreground">
            Protein{" "}
            <strong className="text-foreground">{proteinKcal} kcal</strong>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: MACRO_COLORS.carbs }}
          />
          <span className="text-xs text-muted-foreground">
            Carbs <strong className="text-foreground">{carbsKcal} kcal</strong>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: MACRO_COLORS.fat }}
          />
          <span className="text-xs text-muted-foreground">
            Fat <strong className="text-foreground">{fatKcal} kcal</strong>
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Macro Bar Chart vs Goal Component ──────────────────────────────────────
interface MacroBarEntry {
  name: string;
  actual: number;
  remaining: number;
  goal: number;
  fill: string;
}

interface MacroBarCustomLabelProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  index?: number;
  barData?: MacroBarEntry[];
}

function MacroBarCustomLabel({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  index = 0,
  barData = [],
}: MacroBarCustomLabelProps) {
  if (!value) return null;
  const entry = barData[index];
  if (!entry) return null;
  return (
    <text
      x={x + width + 6}
      y={y + height / 2 + 1}
      fill="#9ca3af"
      fontSize={10}
      dominantBaseline="middle"
    >
      {entry.actual}g / {entry.goal}g
    </text>
  );
}

function MacroBarCard({
  dailyMacros,
}: {
  dailyMacros: { protein: number; carbs: number; fat: number };
}) {
  const goals = getMacroGoals();

  const barData: MacroBarEntry[] = [
    {
      name: "Protein",
      actual: Math.round(dailyMacros.protein),
      remaining: Math.max(0, goals.protein - Math.round(dailyMacros.protein)),
      goal: goals.protein,
      fill: MACRO_COLORS.protein,
    },
    {
      name: "Carbs",
      actual: Math.round(dailyMacros.carbs),
      remaining: Math.max(0, goals.carbs - Math.round(dailyMacros.carbs)),
      goal: goals.carbs,
      fill: MACRO_COLORS.carbs,
    },
    {
      name: "Fat",
      actual: Math.round(dailyMacros.fat),
      remaining: Math.max(0, goals.fat - Math.round(dailyMacros.fat)),
      goal: goals.fat,
      fill: MACRO_COLORS.fat,
    },
  ];

  const maxGoal = Math.max(...barData.map((d) => d.goal)) * 1.1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 }}
      className="rounded-2xl bg-card border border-border p-4"
    >
      <p className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
        Daily Macros vs Goal
      </p>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart
          data={barData}
          layout="vertical"
          margin={{ top: 4, right: 80, left: 8, bottom: 4 }}
          barSize={18}
        >
          <XAxis
            type="number"
            domain={[0, maxGoal]}
            tick={false}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            content={<MacroBarTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
          {/* Background bar showing goal */}
          <Bar
            dataKey="goal"
            stackId="a"
            fill="rgba(156,163,175,0.12)"
            radius={[0, 6, 6, 0]}
          >
            {barData.map((entry) => (
              <Cell key={entry.name} fill="rgba(156,163,175,0.12)" />
            ))}
          </Bar>
          {/* Actual consumed bar (stacked on top of ghost) */}
          <Bar
            dataKey="actual"
            stackId="b"
            radius={[0, 6, 6, 0]}
            label={<MacroBarCustomLabel barData={barData} />}
          >
            {barData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

const MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

const MEAL_COLORS: Record<MealType, { bg: string; text: string; dot: string }> =
  {
    Breakfast: {
      bg: "bg-yellow-500/15",
      text: "text-yellow-600 dark:text-yellow-400",
      dot: "bg-yellow-500",
    },
    Lunch: {
      bg: "bg-green-500/15",
      text: "text-green-600 dark:text-green-400",
      dot: "bg-green-500",
    },
    Dinner: {
      bg: "bg-blue-500/15",
      text: "text-blue-600 dark:text-blue-400",
      dot: "bg-blue-500",
    },
    Snack: {
      bg: "bg-purple-500/15",
      text: "text-purple-600 dark:text-purple-400",
      dot: "bg-purple-500",
    },
  };

interface SearchResult {
  name: string;
  caloriesPer100g: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  category?: string;
  source: "local" | "usda" | "recipe";
  defaultGrams?: number;
  isLiquid?: boolean;
}

const BASE_CATEGORIES = ["All", ...getAllCategories()];
const ALL_CATEGORIES_WITH_RECIPES = [...BASE_CATEGORIES, "My Recipes"];

export default function DietTrackerScreen() {
  const {
    todayFoodLogs,
    addFoodLog,
    deleteFoodLog,
    todayDate,
    customRecipes,
    deleteCustomRecipe,
  } = useAppContext();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchingUSDA, setSearchingUSDA] = useState(false);
  const [selectedFood, setSelectedFood] = useState<SearchResult | null>(null);
  const [grams, setGrams] = useState("100");
  const [mealType, setMealType] = useState<MealType>("Breakfast");
  const [adding, setAdding] = useState(false);
  const [expandedMeal, setExpandedMeal] = useState<MealType | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Browse All Foods state
  const [showBrowse, setShowBrowse] = useState(false);
  const [browseCategory, setBrowseCategory] = useState("All");

  // Recipe builder
  const [showRecipeBuilder, setShowRecipeBuilder] = useState(false);

  const totalCalories = todayFoodLogs.reduce(
    (sum, log) => sum + log.totalCalories,
    0,
  );

  // Daily macro totals — look up food in FOOD_LOOKUP to get per-100g macros
  const dailyMacros = todayFoodLogs.reduce(
    (acc, log) => {
      const food = FOOD_LOOKUP.get(log.foodName.toLowerCase());
      const m = calcMacros(food, log.grams);
      return {
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
      };
    },
    { protein: 0, carbs: 0, fat: 0 },
  );

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      const local = searchLocalFood(q);

      // Also search custom recipes
      const lq = q.toLowerCase();
      const recipeMatches: SearchResult[] = customRecipes
        .filter((r) => r.name.toLowerCase().includes(lq))
        .map((r) => ({
          name: r.name,
          caloriesPer100g: r.caloriesPer100g,
          category: "My Recipes",
          source: "recipe" as const,
          defaultGrams:
            r.totalWeightG > 0 ? Math.round(r.totalWeightG / r.servings) : 100,
        }));

      const localMapped = local.map((f) => ({
        ...f,
        source: "local" as const,
        isLiquid: f.isLiquid,
      }));
      const combined = [...recipeMatches, ...localMapped];

      if (combined.length > 0) {
        setResults(combined);
        setSearching(false);
        return;
      }

      // No local/recipe results — try API
      setSearchingUSDA(true);
      try {
        const apiResults = await searchFoodUSDA(q);
        setResults(apiResults.map((f) => ({ ...f, source: "usda" as const })));
      } catch {
        setResults([]);
      } finally {
        setSearchingUSDA(false);
        setSearching(false);
      }
    },
    [customRecipes],
  );

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceTimer.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, doSearch]);

  const calPreview = selectedFood
    ? Math.round(
        (selectedFood.caloriesPer100g / 100) * (Number.parseFloat(grams) || 0),
      )
    : 0;

  const macroPreview = selectedFood
    ? calcMacros(selectedFood, Number.parseFloat(grams) || 0)
    : { protein: 0, carbs: 0, fat: 0 };

  const handleSelectFood = (food: SearchResult) => {
    setSelectedFood(food);
    setQuery("");
    setResults([]);
    // Default: 200ml for liquids, else use defaultGrams or 100g
    const defaultAmt =
      food.defaultGrams != null
        ? String(food.defaultGrams)
        : food.isLiquid
          ? "200"
          : "100";
    setGrams(defaultAmt);
  };

  const handleAddFood = async () => {
    if (!selectedFood) return;
    if (!grams || Number.parseFloat(grams) <= 0) {
      toast.error(
        `Please enter a valid ${selectedFood.isLiquid ? "ml" : "gram"} amount`,
      );
      return;
    }

    setAdding(true);
    try {
      const log: FoodLog = {
        id: `food_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: todayDate,
        foodName: selectedFood.name,
        caloriesPer100g: selectedFood.caloriesPer100g,
        grams: Number.parseFloat(grams),
        totalCalories: calPreview,
        mealType,
      };
      await addFoodLog(log);
      toast.success(`${selectedFood.name} added to ${mealType}`);
      setSelectedFood(null);
      setGrams("100");
    } catch {
      toast.error("Failed to add food log");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string, foodName: string) => {
    try {
      await deleteFoodLog(id);
      toast.success(`${foodName} removed`);
    } catch {
      toast.error("Failed to remove food log");
    }
  };

  const logsByMeal = MEAL_TYPES.reduce<Record<MealType, FoodLog[]>>(
    (acc, meal) => {
      acc[meal] = todayFoodLogs.filter((l) => l.mealType === meal);
      return acc;
    },
    { Breakfast: [], Lunch: [], Dinner: [], Snack: [] },
  );

  // Auto-detect current meal time
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 10) setMealType("Breakfast");
    else if (hour < 14) setMealType("Lunch");
    else if (hour < 17) setMealType("Snack");
    else setMealType("Dinner");
  }, []);

  // Browse list — show custom recipes when "My Recipes" category selected
  const getBrowseFoods = () => {
    if (browseCategory === "My Recipes") return [];
    return getAllFoods(browseCategory);
  };

  return (
    <div className="min-h-screen bg-background scroll-area-content overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Diet Tracker
            </h1>
            <p className="text-xs text-muted-foreground">
              Today: {totalCalories.toLocaleString()} kcal logged
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Create Recipe button */}
            <button
              type="button"
              onClick={() => setShowRecipeBuilder(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-all"
            >
              <ChefHat size={13} />
              <span className="hidden sm:inline">Create Recipe</span>
              <span className="sm:hidden">Recipe</span>
            </button>
            <div className="text-right">
              <p className="font-display text-xl font-bold text-primary">
                {totalCalories.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">kcal today</p>
            </div>
          </div>
        </div>

        {/* Meal type tabs */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          {MEAL_TYPES.map((meal) => {
            const colors = MEAL_COLORS[meal];
            const count = logsByMeal[meal].length;
            return (
              <button
                key={meal}
                type="button"
                onClick={() => setMealType(meal)}
                className={`flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                  mealType === meal
                    ? `${colors.bg} ${colors.text}`
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${mealType === meal ? colors.dot : "bg-muted-foreground"}`}
                />
                {meal}
                {count > 0 && (
                  <span className="text-[10px] font-bold px-1 py-0.5 rounded-full bg-foreground/10">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search food (e.g. Idli, Chai, Mango, Dosa...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-10 h-12 rounded-2xl bg-secondary border-border focus:border-primary text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Search Results */}
        <AnimatePresence>
          {(results.length > 0 || searching || searchingUSDA) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl bg-card border border-border overflow-hidden"
            >
              {searchingUSDA && (
                <div className="px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground border-b border-border">
                  <Loader2 size={12} className="animate-spin" />
                  Searching Open Food Facts database...
                </div>
              )}
              {results.map((food, i) => (
                <button
                  key={`${food.name}-${i}`}
                  type="button"
                  onClick={() => handleSelectFood(food)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border last:border-0 text-left"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="font-medium text-sm text-foreground">
                      {food.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {food.category || "General"}
                    </p>
                    {(food.protein != null ||
                      food.carbs != null ||
                      food.fat != null) && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        <span className="text-blue-500/80">
                          P {food.protein ?? 0}g
                        </span>
                        {" · "}
                        <span className="text-amber-500/80">
                          C {food.carbs ?? 0}g
                        </span>
                        {" · "}
                        <span className="text-orange-500/80">
                          F {food.fat ?? 0}g
                        </span>
                        {" per 100"}
                        {food.isLiquid ? "ml" : "g"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-foreground">
                      {food.caloriesPer100g}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {food.isLiquid ? "kcal/100ml" : "kcal/100g"}
                    </span>
                    {food.source === "usda" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 font-medium">
                        API
                      </span>
                    )}
                    {food.source === "recipe" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                        Recipe
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick picks + Browse All (when no search active) */}
        {!query && results.length === 0 && !selectedFood && (
          <div className="space-y-3">
            {/* Toggle: Quick Picks vs Browse All */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowBrowse(false)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${!showBrowse ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}
              >
                Quick Picks
              </button>
              <button
                type="button"
                onClick={() => setShowBrowse(true)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${showBrowse ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}
              >
                <List size={12} />
                Browse All ({FOOD_DATABASE.length}+)
              </button>
            </div>

            {!showBrowse ? (
              <>
                {/* My Recipes row */}
                {customRecipes.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                      My Recipes
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {customRecipes.slice(0, 8).map((recipe) => (
                        <button
                          key={recipe.id}
                          type="button"
                          onClick={() =>
                            handleSelectFood({
                              name: recipe.name,
                              caloriesPer100g: recipe.caloriesPer100g,
                              category: "My Recipes",
                              source: "recipe",
                              defaultGrams: Math.round(
                                recipe.totalWeightG / recipe.servings,
                              ),
                            })
                          }
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-xs font-medium text-primary transition-colors"
                        >
                          <ChefHat size={10} />
                          {recipe.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* South Indian */}
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                    South Indian
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {FOOD_DATABASE.filter((f) => f.category === "South Indian")
                      .slice(0, 8)
                      .map((food) => (
                        <button
                          key={food.name}
                          type="button"
                          onClick={() =>
                            handleSelectFood({
                              ...food,
                              source: "local",
                              isLiquid: food.isLiquid,
                            })
                          }
                          className="px-3 py-1.5 rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-xs font-medium text-orange-700 dark:text-orange-300 transition-colors"
                        >
                          {food.name}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Drinks */}
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                    Tea, Coffee & Drinks
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {FOOD_DATABASE.filter((f) => f.category === "Drinks")
                      .slice(0, 8)
                      .map((food) => (
                        <button
                          key={food.name}
                          type="button"
                          onClick={() =>
                            handleSelectFood({
                              ...food,
                              source: "local",
                              isLiquid: food.isLiquid,
                            })
                          }
                          className="px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium text-amber-700 dark:text-amber-300 transition-colors"
                        >
                          {food.name}{" "}
                          <span className="opacity-60 text-[10px]">ml</span>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Fruits */}
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                    Fruits
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {FOOD_DATABASE.filter((f) => f.category === "Fruit")
                      .slice(0, 8)
                      .map((food) => (
                        <button
                          key={food.name}
                          type="button"
                          onClick={() =>
                            handleSelectFood({
                              ...food,
                              source: "local",
                              isLiquid: food.isLiquid,
                            })
                          }
                          className="px-3 py-1.5 rounded-full bg-green-500/10 hover:bg-green-500/20 text-xs font-medium text-green-700 dark:text-green-300 transition-colors"
                        >
                          {food.name}
                        </button>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              /* Browse All Foods panel */
              <div className="space-y-3">
                {/* Category filter row */}
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {ALL_CATEGORIES_WITH_RECIPES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setBrowseCategory(cat)}
                      className={`flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        browseCategory === cat
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {cat === "My Recipes" ? `🍳 ${cat}` : cat}
                    </button>
                  ))}
                </div>

                {/* Custom Recipes list */}
                {browseCategory === "My Recipes" ? (
                  customRecipes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-primary/8 flex items-center justify-center mb-3">
                        <BookOpen size={20} className="text-primary/50" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        No recipes yet
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tap "Create Recipe" to add your first
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-card border border-border overflow-hidden">
                      {customRecipes.map((recipe) => (
                        <div
                          key={recipe.id}
                          className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectFood({
                                name: recipe.name,
                                caloriesPer100g: recipe.caloriesPer100g,
                                category: "My Recipes",
                                source: "recipe",
                                defaultGrams: Math.round(
                                  recipe.totalWeightG / recipe.servings,
                                ),
                              });
                              setShowBrowse(false);
                            }}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <ChefHat
                                size={13}
                                className="text-primary shrink-0"
                              />
                              <div>
                                <p className="font-medium text-sm text-foreground">
                                  {recipe.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {recipe.ingredients.length} ingredients ·{" "}
                                  {recipe.servings} serving
                                  {recipe.servings !== 1 ? "s" : ""}
                                </p>
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-3 ml-3 shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-semibold text-foreground">
                                {recipe.caloriesPer100g}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                kcal/100g
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                deleteCustomRecipe(recipe.id);
                                toast.success(`"${recipe.name}" deleted`);
                              }}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1"
                              aria-label={`Delete ${recipe.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  /* Regular food list */
                  <div className="rounded-2xl bg-card border border-border overflow-hidden">
                    {getBrowseFoods().map((food, i) => (
                      <button
                        key={`${food.name}-${i}`}
                        type="button"
                        onClick={() => {
                          handleSelectFood({
                            ...food,
                            source: "local",
                            isLiquid: food.isLiquid,
                          });
                          setShowBrowse(false);
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border last:border-0 text-left"
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="font-medium text-sm text-foreground">
                            {food.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {food.category}
                          </p>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            <span className="text-blue-500/80">
                              P {food.protein}g
                            </span>
                            {" · "}
                            <span className="text-amber-500/80">
                              C {food.carbs}g
                            </span>
                            {" · "}
                            <span className="text-orange-500/80">
                              F {food.fat}g
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-sm font-semibold text-foreground">
                            {food.caloriesPer100g}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {food.isLiquid ? "kcal/100ml" : "kcal/100g"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Selected food + add form */}
        <AnimatePresence>
          {selectedFood && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl bg-primary/8 border border-primary/25 p-4 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    {selectedFood.source === "recipe" && (
                      <ChefHat size={14} className="text-primary shrink-0" />
                    )}
                    <h3 className="font-semibold text-foreground">
                      {selectedFood.name}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedFood.caloriesPer100g} kcal per{" "}
                    {selectedFood.isLiquid ? "100ml" : "100g"}
                    {selectedFood.source === "recipe" && (
                      <span className="ml-2 text-primary font-medium">
                        · Custom Recipe
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFood(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="food-grams"
                    className="text-xs font-medium text-muted-foreground mb-1.5 block"
                  >
                    {selectedFood.isLiquid ? "Millilitres (ml)" : "Grams (g)"}
                    {selectedFood.defaultGrams != null && (
                      <span className="text-primary/70 ml-1">
                        (1 serving = {selectedFood.defaultGrams}
                        {selectedFood.isLiquid ? "ml" : "g"})
                      </span>
                    )}
                  </label>
                  <Input
                    id="food-grams"
                    type="number"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    className="h-11 bg-background border-border focus:border-primary rounded-xl text-center font-bold"
                    min={1}
                    max={3000}
                  />
                </div>
                <div>
                  <label
                    htmlFor="food-meal-type"
                    className="text-xs font-medium text-muted-foreground mb-1.5 block"
                  >
                    Meal
                  </label>
                  <select
                    id="food-meal-type"
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value as MealType)}
                    className="w-full h-11 rounded-xl bg-background border border-border focus:border-primary px-3 text-sm text-foreground"
                  >
                    {MEAL_TYPES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live macro preview */}
              {(selectedFood.protein != null ||
                selectedFood.carbs != null ||
                selectedFood.fat != null) && (
                <div className="flex gap-2">
                  <div className="flex-1 rounded-xl bg-blue-500/10 px-3 py-2 text-center">
                    <p className="font-bold text-sm text-blue-500">
                      {macroPreview.protein}g
                    </p>
                    <p className="text-[10px] text-muted-foreground">Protein</p>
                  </div>
                  <div className="flex-1 rounded-xl bg-amber-500/10 px-3 py-2 text-center">
                    <p className="font-bold text-sm text-amber-500">
                      {macroPreview.carbs}g
                    </p>
                    <p className="text-[10px] text-muted-foreground">Carbs</p>
                  </div>
                  <div className="flex-1 rounded-xl bg-orange-500/10 px-3 py-2 text-center">
                    <p className="font-bold text-sm text-orange-500">
                      {macroPreview.fat}g
                    </p>
                    <p className="text-[10px] text-muted-foreground">Fat</p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-center">
                  <p className="font-display text-3xl font-bold text-primary">
                    {calPreview}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    kcal for {grams || 0}
                    {selectedFood.isLiquid ? "ml" : "g"}
                  </p>
                </div>
                <Button
                  onClick={handleAddFood}
                  disabled={adding || !grams || Number.parseFloat(grams) <= 0}
                  className="h-12 px-6 rounded-2xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-glow"
                >
                  {adding ? (
                    <Loader2 size={16} className="animate-spin mr-2" />
                  ) : (
                    <Plus size={16} className="mr-2" />
                  )}
                  Add to {mealType}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logged meals by type */}
        <div className="space-y-3">
          {MEAL_TYPES.map((meal) => {
            const logs = logsByMeal[meal];
            if (logs.length === 0) return null;
            const colors = MEAL_COLORS[meal];
            const mealTotal = logs.reduce((s, l) => s + l.totalCalories, 0);
            const _isExpanded = expandedMeal === meal || expandedMeal === null;

            return (
              <motion.div
                key={meal}
                layout
                className="rounded-2xl bg-card border border-border overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedMeal(expandedMeal === meal ? null : meal)
                  }
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${colors.dot}`}
                    />
                    <span className="font-semibold text-sm text-foreground">
                      {meal}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {logs.length} item{logs.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-sm ${colors.text}`}>
                      {mealTotal} kcal
                    </span>
                    {expandedMeal === meal ? (
                      <ChevronUp size={14} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown
                        size={14}
                        className="text-muted-foreground"
                      />
                    )}
                  </div>
                </button>

                <AnimatePresence>
                  {expandedMeal === meal && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="border-t border-border">
                        {logs.map((log) => {
                          const foodItem = FOOD_LOOKUP.get(
                            log.foodName.toLowerCase(),
                          );
                          const logMacros = calcMacros(foodItem, log.grams);
                          const hasMacros =
                            foodItem &&
                            (foodItem.protein > 0 ||
                              foodItem.carbs > 0 ||
                              foodItem.fat > 0);
                          return (
                            <div
                              key={log.id}
                              className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0"
                            >
                              <div className="flex-1 min-w-0 mr-3">
                                <p className="font-medium text-sm text-foreground truncate">
                                  {log.foodName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {log.grams}
                                  {foodItem?.isLiquid ? "ml" : "g"} ·{" "}
                                  {log.caloriesPer100g} kcal/100
                                  {foodItem?.isLiquid ? "ml" : "g"}
                                </p>
                                {hasMacros && (
                                  <div className="flex gap-1.5 mt-1">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
                                      P {logMacros.protein}g
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                                      C {logMacros.carbs}g
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-500 font-medium">
                                      F {logMacros.fat}g
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-semibold text-sm text-foreground">
                                  {log.totalCalories} kcal
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDelete(log.id, log.foodName)
                                  }
                                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                  aria-label={`Delete ${log.foodName}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Empty state */}
        {todayFoodLogs.length === 0 && !selectedFood && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Apple size={28} className="text-primary/60" />
            </div>
            <p className="font-display font-semibold text-foreground mb-1">
              No meals logged yet
            </p>
            <p className="text-sm text-muted-foreground">
              Search above to add your first meal of the day
            </p>
          </div>
        )}

        {/* Daily total + macro summary */}
        {todayFoodLogs.length > 0 && (
          <>
            <div className="rounded-2xl bg-secondary/50 border border-border px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground">
                  Daily Total
                </span>
                <span className="font-display font-bold text-lg text-primary">
                  {totalCalories.toLocaleString()} kcal
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-blue-500/10 px-3 py-2 text-center">
                  <p className="font-bold text-base text-blue-500">
                    {Math.round(dailyMacros.protein)}g
                  </p>
                  <p className="text-[10px] text-muted-foreground">Protein</p>
                </div>
                <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-center">
                  <p className="font-bold text-base text-amber-500">
                    {Math.round(dailyMacros.carbs)}g
                  </p>
                  <p className="text-[10px] text-muted-foreground">Carbs</p>
                </div>
                <div className="rounded-xl bg-orange-500/10 px-3 py-2 text-center">
                  <p className="font-bold text-base text-orange-500">
                    {Math.round(dailyMacros.fat)}g
                  </p>
                  <p className="text-[10px] text-muted-foreground">Fat</p>
                </div>
              </div>
            </div>

            {/* ── Macro Donut / Pie Chart ─────────────────────────────────── */}
            <MacroDonutCard dailyMacros={dailyMacros} />

            {/* ── Macro Bar Chart vs Goal ─────────────────────────────────── */}
            <MacroBarCard dailyMacros={dailyMacros} />
          </>
        )}
      </div>

      {/* Recipe Builder Sheet */}
      <RecipeBuilder
        open={showRecipeBuilder}
        onClose={() => setShowRecipeBuilder(false)}
      />
    </div>
  );
}
