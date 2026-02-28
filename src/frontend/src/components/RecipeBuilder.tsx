import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ChefHat,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { type CustomRecipe, useAppContext } from "../context/AppContext";
import { searchLocalFood } from "../data/foodDatabase";
import { searchFoodUSDA } from "../services/foodApiService";

interface IngredientRow {
  name: string;
  grams: number;
  caloriesPer100g: number;
  calories: number;
}

interface SearchResult {
  name: string;
  caloriesPer100g: number;
  category?: string;
  source: "local" | "usda";
}

interface RecipeBuilderProps {
  open: boolean;
  onClose: () => void;
}

function ManualIngredientForm({
  onAdd,
}: {
  onAdd: (ingredient: IngredientRow) => void;
}) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [grams, setGrams] = useState("100");

  const handleAdd = () => {
    const n = name.trim();
    const k = Number.parseFloat(kcal);
    const g = Number.parseFloat(grams);
    if (!n || Number.isNaN(k) || k <= 0 || Number.isNaN(g) || g <= 0) return;
    onAdd({
      name: n,
      caloriesPer100g: k,
      grams: g,
      calories: Math.round((k / 100) * g),
    });
    setName("");
    setKcal("");
    setGrams("100");
  };

  return (
    <div className="rounded-xl bg-secondary/40 border border-border p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Add manually
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="col-span-3 h-9 text-sm bg-background border-border rounded-lg"
        />
        <Input
          type="number"
          placeholder="kcal/100g"
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          className="h-9 text-sm bg-background border-border rounded-lg"
          min={1}
        />
        <Input
          type="number"
          placeholder="grams"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          className="h-9 text-sm bg-background border-border rounded-lg"
          min={1}
        />
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          className="h-9 bg-primary text-primary-foreground rounded-lg"
        >
          <Plus size={14} className="mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}

export default function RecipeBuilder({ open, onClose }: RecipeBuilderProps) {
  const { addCustomRecipe } = useAppContext();

  const [recipeName, setRecipeName] = useState("");
  const [servings, setServings] = useState("1");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchingAPI, setSearchingAPI] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      setRecipeName("");
      setServings("1");
      setIngredients([]);
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const local = searchLocalFood(q);
    if (local.length > 0) {
      setResults(local.map((f) => ({ ...f, source: "local" as const })));
      setSearching(false);
      return;
    }
    setSearchingAPI(true);
    try {
      const apiResults = await searchFoodUSDA(q);
      setResults(apiResults.map((f) => ({ ...f, source: "usda" as const })));
    } catch {
      setResults([]);
    } finally {
      setSearchingAPI(false);
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const handleSelectFood = (food: SearchResult) => {
    const grams = 100;
    const calories = Math.round((food.caloriesPer100g / 100) * grams);
    setIngredients((prev) => [
      ...prev,
      {
        name: food.name,
        caloriesPer100g: food.caloriesPer100g,
        grams,
        calories,
      },
    ]);
    setQuery("");
    setResults([]);
    toast.success(`${food.name} added`);
  };

  const handleAddManual = (row: IngredientRow) => {
    setIngredients((prev) => [...prev, row]);
  };

  const handleUpdateGrams = (idx: number, newGrams: string) => {
    const g = Number.parseFloat(newGrams) || 0;
    setIngredients((prev) =>
      prev.map((ing, i) =>
        i === idx
          ? {
              ...ing,
              grams: g,
              calories: Math.round((ing.caloriesPer100g / 100) * g),
            }
          : ing,
      ),
    );
  };

  const handleRemove = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  // Totals
  const totalWeightG = ingredients.reduce((s, i) => s + i.grams, 0);
  const totalCalories = ingredients.reduce((s, i) => s + i.calories, 0);
  const numServings = Number.parseFloat(servings) || 1;
  const calPerServing = Math.round(totalCalories / numServings);
  const calPer100g =
    totalWeightG > 0 ? Math.round((totalCalories / totalWeightG) * 100) : 0;

  const handleSave = () => {
    if (!recipeName.trim()) {
      toast.error("Please enter a recipe name");
      return;
    }
    if (ingredients.length === 0) {
      toast.error("Add at least one ingredient");
      return;
    }
    if (totalWeightG === 0) {
      toast.error("Total weight must be greater than 0");
      return;
    }

    const recipe: CustomRecipe = {
      id: `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: recipeName.trim(),
      servings: numServings,
      totalWeightG,
      totalCalories,
      caloriesPer100g: calPer100g,
      ingredients: ingredients.map((i) => ({ ...i })),
      createdAt: Date.now(),
    };

    addCustomRecipe(recipe);
    toast.success(`"${recipe.name}" saved to My Recipes!`);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="h-[92dvh] rounded-t-3xl p-0 flex flex-col bg-background border-border overflow-hidden"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                <ChefHat size={16} className="text-primary" />
              </div>
              <SheetTitle className="font-display text-lg font-bold text-foreground">
                Create Recipe
              </SheetTitle>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Recipe Name + Servings */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label
                htmlFor="recipe-name"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Recipe Name
              </label>
              <Input
                id="recipe-name"
                placeholder="e.g. Dal Fry, Chicken Rice Bowl..."
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                className="h-11 bg-secondary border-border focus:border-primary rounded-xl text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="recipe-servings"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Servings
              </label>
              <Input
                id="recipe-servings"
                type="number"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="h-11 bg-secondary border-border focus:border-primary rounded-xl text-sm text-center font-bold"
                min={1}
                max={50}
              />
            </div>
          </div>

          {/* Ingredient Search */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Search Ingredients
            </p>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search food (Idli, Egg, Chicken...)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 pr-9 h-11 rounded-xl bg-secondary border-border focus:border-primary text-sm"
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
                  <X size={13} />
                </button>
              )}
            </div>

            <AnimatePresence>
              {(results.length > 0 || searching || searchingAPI) && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="rounded-xl bg-card border border-border overflow-hidden"
                >
                  {searchingAPI && (
                    <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-muted-foreground border-b border-border">
                      <Loader2 size={11} className="animate-spin" />
                      Searching food database...
                    </div>
                  )}
                  {results.map((food, i) => (
                    <button
                      key={`${food.name}-${i}`}
                      type="button"
                      onClick={() => handleSelectFood(food)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/50 transition-colors border-b border-border last:border-0 text-left"
                    >
                      <div>
                        <p className="font-medium text-sm text-foreground">
                          {food.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {food.category || "General"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">
                          {food.caloriesPer100g}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          kcal/100g
                        </span>
                        <Plus size={13} className="text-primary ml-1" />
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Manual entry */}
          <ManualIngredientForm onAdd={handleAddManual} />

          {/* Ingredient list */}
          {ingredients.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Ingredients ({ingredients.length})
              </p>
              <div className="rounded-xl bg-card border border-border overflow-hidden">
                {ingredients.map((ing, idx) => (
                  <motion.div
                    key={`${ing.name}-${idx}`}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {ing.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ing.caloriesPer100g} kcal/100g
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={ing.grams}
                          onChange={(e) =>
                            handleUpdateGrams(idx, e.target.value)
                          }
                          className="w-16 h-8 text-center text-sm font-bold bg-secondary border-border rounded-lg p-1"
                          min={1}
                        />
                        <span className="text-xs text-muted-foreground">g</span>
                      </div>
                      <span className="text-sm font-semibold text-foreground w-14 text-right">
                        {ing.calories} kcal
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemove(idx)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        aria-label={`Remove ${ing.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {ingredients.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/8 flex items-center justify-center mb-3">
                <UtensilsCrossed size={24} className="text-primary/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                No ingredients yet
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Search above or enter manually
              </p>
            </div>
          )}
        </div>

        {/* Sticky footer: totals + save */}
        <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-sm px-5 py-4 space-y-3">
          {/* Totals row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Total Weight", value: `${totalWeightG}g` },
              { label: "Total Calories", value: `${totalCalories} kcal` },
              { label: "Per Serving", value: `${calPerServing} kcal` },
              { label: "Per 100g", value: `${calPer100g} kcal` },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="text-center bg-secondary/60 rounded-xl py-2 px-1"
              >
                <p className="font-display text-base font-bold text-primary leading-tight">
                  {value}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Save button */}
          <Button
            type="button"
            onClick={handleSave}
            disabled={!recipeName.trim() || ingredients.length === 0}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-40"
          >
            <Save size={16} className="mr-2" />
            Save Recipe
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
