# FitTrack

## Current State
- Diet Tracker shows a text-based daily macro summary (protein/carbs/fat as colored chips and a 3-column grid) at the bottom after food is logged
- Progress screen has a Weight/BMI line chart and a Weight Forecast card with 30/60/90-day text projections and a calorie stats grid
- Weekly weight forecast data is calculated (trend, projected30/60/90, surplusPerDay) but only shown as plain text rows — no visual progress bars or forecast bar chart

## Requested Changes (Diff)

### Add
- **Diet Tab — Macro Pie Chart**: A donut/pie chart (using Recharts PieChart) showing today's macro split (Protein / Carbs / Fat) in kcal, rendered below the daily total summary card when food is logged
- **Diet Tab — Nutrient Bar Chart**: A horizontal bar chart (using Recharts BarChart) showing each macro as a progress bar toward a daily goal (e.g. protein goal 150g, carbs 250g, fat 60g), styled like the workout tab's weekly volume bar chart
- **Progress Tab — Weekly Weight Forecast Progress Bar**: For each of the 30 / 60 / 90 day projections, replace the plain text row with a visual progress bar showing progress from current weight toward goal weight
- **Progress Tab — Weekly Forecast Bar Chart**: A bar chart (7 bars, one per day) showing daily net calories (consumed − burned) for the past 7 days, with a horizontal reference line at the calorie goal

### Modify
- DietTrackerScreen.tsx: Add PieChart + macro bar chart section below existing daily total grid, import Recharts Pie, Cell, BarChart, Bar components
- ProgressScreen.tsx: Enhance forecast projections with Progress bars; add 7-day net-calorie bar chart above or below the forecast card

### Remove
- Nothing removed; existing layout preserved and extended

## Implementation Plan
1. In `DietTrackerScreen.tsx`:
   - Import `PieChart`, `Pie`, `Cell`, `BarChart`, `Bar`, `LabelList` from recharts (already installed)
   - Compute macro kcal values: protein × 4, carbs × 4, fat × 9
   - Render a donut PieChart with three slices (blue=Protein, amber=Carbs, orange=Fat) with center label showing total kcal
   - Render horizontal BarChart with 3 bars showing grams vs goal for Protein/Carbs/Fat; macro goals stored in localStorage (default 150/250/60g)
   - Show both charts inside the existing daily total card when `todayFoodLogs.length > 0`

2. In `ProgressScreen.tsx`:
   - Import `Progress` from shadcn ui/progress
   - For 30/60/90 day forecast rows: replace plain text with a Progress bar showing `(currentWeight - projectedWeight) / (currentWeight - goalWeight) * 100` progress toward goal
   - Add a 7-day net calorie BarChart: compute daily net = consumed − burned for past 7 days, render as bar chart with reference line at `calorieGoal`, bars colored green (deficit) or orange (surplus)
   - Place this bar chart inside the forecast card, below the stats grid
