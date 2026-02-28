# FitTrack

## Current State
Full-stack fitness app (Motoko backend + React frontend) with:
- Profile setup (localStorage) with BMI calc
- Dashboard with calorie ring
- Diet tracker with 600+ foods, macro tracking, recipe builder
- Workout tracker (Hevy-style) with exercise library, set logging, rest timer, templates, history
- Progress screen with charts and weight forecast
- All data stored in localStorage (device-local)

## Requested Changes (Diff)

### Add
1. **Habit Tracker tab** -- new screen for daily habits. Features:
   - Create custom habits with icon, name, frequency (daily/weekly), and optional goal count
   - Pre-built habit suggestions: Water, Sleep, Meditation, Walk, No Sugar, Read, Stretch, etc.
   - Tap to mark habits complete for the day
   - Streak counter per habit
   - Weekly completion grid (7-day dots)
   - Progress ring showing today's completion %
   - All data stored in localStorage

2. **Water Intake Tracker** (as part of Habit Tracker screen or dedicated section):
   - Smart daily water goal calculation based on profile weight/height/BMI using formula: weight(kg) × 35ml (adjusted for BMI: overweight +10%, underweight -5%), minimum 1.5L, max 4L
   - Show recommended amount with explanation (e.g. "Based on your 72kg weight")
   - Log water intake in glasses (250ml) or custom ml
   - Visual progress bar showing intake vs goal
   - Quick-add buttons: +250ml, +500ml, +1L
   - Reminder logic: show in-app banner/toast if water target not met by midday / evening

3. **Template preview before starting**: When user taps a saved template in the workout HOME view, instead of immediately starting the workout, show a preview sheet/modal that lists all exercises in the template. The modal has a "Start Workout" button that begins the session.

### Modify
4. **Rest timer placement fix on mobile**: The rest timer overlay currently sits at `bottom-20` which may overlap with the nav bar or "Add Exercise" FAB on mobile. Fix:
   - Move rest timer to appear ABOVE the fixed bottom nav (use `bottom-20` consistently but ensure it doesn't clash with the Add Exercise button by hiding the FAB when rest timer is active -- this already exists but verify the z-index stacking)
   - On mobile, ensure the rest timer card has proper safe-area padding and does not overlap the nav bar
   - Change `bottom-20` to `bottom-[72px]` to sit just above the nav bar
   - Give the rest timer a higher z-index (z-50) than the FAB (z-30)

### Remove
- Nothing removed

## Implementation Plan
1. Create `src/frontend/src/hooks/useHabitStorage.ts` -- localStorage CRUD for habits and habit logs
2. Create `src/frontend/src/screens/HabitTrackerScreen.tsx` -- full habit + water tracker UI
3. Update `App.tsx` -- add Habits tab to nav (replace or add alongside existing 5 tabs, use a 6th tab or replace Progress with Habits -- keep Progress, add Habits with a water drop or checklist icon)
4. Update `WorkoutTrackerScreen.tsx`:
   - Add template preview modal (TemplatePreviewSheet) that shows exercises list and "Start Workout" button
   - Fix rest timer z-index and bottom positioning to not clash with FAB or nav bar
5. Water intake data persisted in localStorage under `fittrack_water_logs` key
6. Habit data persisted under `fittrack_habits` and `fittrack_habit_logs` keys
