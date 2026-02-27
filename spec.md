# FitTrack

## Current State
- Food database has ~149 items across South Indian, Drinks, Fruit, Grains, Protein, Dairy, Vegetables, Nuts, Snacks categories
- All items use `caloriesPer100g` and display "grams" as the unit everywhere
- Drinks category items are also shown in grams which is incorrect for liquids
- Limited coverage of world cuisines, Indian BBQ/grill/tikka foods, egg preparations

## Requested Changes (Diff)

### Add
- `isLiquid` flag on FoodItem interface -- drinks and liquid items use ml instead of grams
- 300+ new food items covering:
  - Tamil Nadu / South Indian expanded (more street foods, rice varieties, curries, snacks, sweets)
  - Egg preparations: scrambled, boiled, omelette, fried, egg bhurji, egg curry, etc.
  - Grilled / BBQ: chicken tikka, seekh kebab, tandoori chicken, fish tikka, paneer tikka, etc.
  - North Indian: butter chicken, dal makhani, naan, puri, aloo paratha, etc.
  - Mughlai / restaurant: biryani varieties, korma, nihari
  - Chinese-Indian: fried rice, hakka noodles, manchurian, chilli chicken
  - Fast food / street: burger, pizza, pav bhaji, vada pav, rolls, wraps
  - Continental: pasta variations, sandwiches, salads
  - Dairy & beverages extended
  - Nuts, seeds, oils expanded
  - More fruits and vegetables

### Modify
- `FoodItem` interface: add optional `isLiquid?: boolean` field
- All Drinks entries: set `isLiquid: true`; rename `caloriesPer100g` semantics to per 100ml for liquids (value stays same, just unit label changes)
- `DietTrackerScreen`: show "ml" label instead of "g" when `selectedFood.isLiquid === true`
  - Input label: "ml" vs "g"
  - Preview text: "kcal / 100ml" vs "kcal / 100g"
  - Logged item display: show ml vs g
  - Default amount for liquids: 200ml (a standard cup/glass)
- `RecipeBuilder`: respect isLiquid for ingredient unit display

### Remove
- Nothing removed

## Implementation Plan
1. Update `FoodItem` interface to add `isLiquid?: boolean`
2. Rewrite `foodDatabase.ts` with 400+ items, marking all liquid items with `isLiquid: true`
3. Update `DietTrackerScreen` to show ml/g based on `isLiquid` flag, fix all label/hint text
4. Update `RecipeBuilder` to show ml vs g per ingredient
5. Update `searchLocalFood` return to pass through `isLiquid`
6. Update `SearchResult` interface in DietTrackerScreen to include `isLiquid?: boolean`
