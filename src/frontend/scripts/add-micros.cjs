#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CATEGORY_MICROS = {
  "South Indian": { vitaminC: 0, vitaminA: 5, vitaminD: 0, vitaminE: 0.2, vitaminB12: 0, folate: 15, thiamine: 0.06, riboflavin: 0.03, niacin: 0.8, calcium: 20, iron: 0.8, magnesium: 18, potassium: 90, sodium: 320, zinc: 0.5, phosphorus: 65 },
  "North Indian": { vitaminC: 2, vitaminA: 20, vitaminD: 0, vitaminE: 0.3, vitaminB12: 0, folate: 18, thiamine: 0.08, riboflavin: 0.04, niacin: 1.0, calcium: 25, iron: 1.0, magnesium: 20, potassium: 120, sodium: 380, zinc: 0.6, phosphorus: 75 },
  "Rice": { vitaminC: 0, vitaminA: 0, vitaminD: 0, vitaminE: 0.1, vitaminB12: 0, folate: 5, thiamine: 0.03, riboflavin: 0.01, niacin: 0.5, calcium: 5, iron: 0.3, magnesium: 15, potassium: 55, sodium: 5, zinc: 0.5, phosphorus: 50 },
  "Protein": { vitaminC: 0, vitaminA: 20, vitaminD: 0.2, vitaminE: 0.4, vitaminB12: 0.8, folate: 8, thiamine: 0.1, riboflavin: 0.15, niacin: 8.0, calcium: 20, iron: 1.5, magnesium: 30, potassium: 280, sodium: 75, zinc: 2.0, phosphorus: 200 },
  "Egg": { vitaminC: 0, vitaminA: 140, vitaminD: 1.5, vitaminE: 0.9, vitaminB12: 0.9, folate: 40, thiamine: 0.04, riboflavin: 0.4, niacin: 0.1, calcium: 50, iron: 1.5, magnesium: 11, potassium: 130, sodium: 115, zinc: 1.1, phosphorus: 185 },
  "Grill & BBQ": { vitaminC: 0, vitaminA: 15, vitaminD: 0.1, vitaminE: 0.3, vitaminB12: 0.5, folate: 5, thiamine: 0.1, riboflavin: 0.12, niacin: 10.0, calcium: 15, iron: 1.2, magnesium: 25, potassium: 300, sodium: 200, zinc: 2.5, phosphorus: 210 },
  "Fruit": { vitaminC: 30, vitaminA: 40, vitaminD: 0, vitaminE: 0.5, vitaminB12: 0, folate: 20, thiamine: 0.04, riboflavin: 0.04, niacin: 0.5, calcium: 12, iron: 0.3, magnesium: 12, potassium: 200, sodium: 2, zinc: 0.1, phosphorus: 20 },
  "Vegetable": { vitaminC: 20, vitaminA: 80, vitaminD: 0, vitaminE: 0.8, vitaminB12: 0, folate: 50, thiamine: 0.07, riboflavin: 0.07, niacin: 0.7, calcium: 40, iron: 1.0, magnesium: 20, potassium: 250, sodium: 30, zinc: 0.3, phosphorus: 45 },
  "Dairy": { vitaminC: 0.5, vitaminA: 60, vitaminD: 0.1, vitaminE: 0.1, vitaminB12: 0.5, folate: 7, thiamine: 0.04, riboflavin: 0.16, niacin: 0.1, calcium: 130, iron: 0.1, magnesium: 12, potassium: 145, sodium: 45, zinc: 0.45, phosphorus: 100 },
  "Drinks": { vitaminC: 1, vitaminA: 10, vitaminD: 0, vitaminE: 0.02, vitaminB12: 0.1, folate: 2, thiamine: 0.01, riboflavin: 0.04, niacin: 0.1, calcium: 25, iron: 0.1, magnesium: 5, potassium: 70, sodium: 20, zinc: 0.1, phosphorus: 20 },
  "Nuts": { vitaminC: 0, vitaminA: 0, vitaminD: 0, vitaminE: 12.0, vitaminB12: 0, folate: 50, thiamine: 0.3, riboflavin: 0.4, niacin: 5.0, calcium: 150, iron: 3.0, magnesium: 180, potassium: 600, sodium: 5, zinc: 2.5, phosphorus: 350 },
  "Legumes": { vitaminC: 2, vitaminA: 5, vitaminD: 0, vitaminE: 0.5, vitaminB12: 0, folate: 120, thiamine: 0.2, riboflavin: 0.08, niacin: 1.5, calcium: 50, iron: 3.5, magnesium: 50, potassium: 400, sodium: 10, zinc: 1.5, phosphorus: 150 },
  "Snacks": { vitaminC: 0, vitaminA: 5, vitaminD: 0, vitaminE: 0.4, vitaminB12: 0, folate: 8, thiamine: 0.12, riboflavin: 0.06, niacin: 1.5, calcium: 30, iron: 1.2, magnesium: 12, potassium: 80, sodium: 350, zinc: 0.4, phosphorus: 70 },
  "Street Food": { vitaminC: 3, vitaminA: 15, vitaminD: 0, vitaminE: 0.3, vitaminB12: 0, folate: 12, thiamine: 0.1, riboflavin: 0.05, niacin: 1.2, calcium: 25, iron: 1.0, magnesium: 14, potassium: 100, sodium: 400, zinc: 0.5, phosphorus: 65 },
  "Indo-Chinese": { vitaminC: 5, vitaminA: 20, vitaminD: 0, vitaminE: 0.3, vitaminB12: 0, folate: 15, thiamine: 0.08, riboflavin: 0.05, niacin: 1.5, calcium: 20, iron: 0.8, magnesium: 15, potassium: 120, sodium: 500, zinc: 0.5, phosphorus: 70 },
  "Continental": { vitaminC: 2, vitaminA: 20, vitaminD: 0.1, vitaminE: 0.5, vitaminB12: 0.2, folate: 15, thiamine: 0.1, riboflavin: 0.1, niacin: 3.0, calcium: 30, iron: 0.8, magnesium: 18, potassium: 150, sodium: 350, zinc: 0.6, phosphorus: 100 },
  "Bread": { vitaminC: 0, vitaminA: 0, vitaminD: 0, vitaminE: 0.2, vitaminB12: 0, folate: 28, thiamine: 0.2, riboflavin: 0.13, niacin: 2.5, calcium: 150, iron: 3.6, magnesium: 22, potassium: 100, sodium: 480, zinc: 0.8, phosphorus: 90 },
  "Dessert": { vitaminC: 0.5, vitaminA: 30, vitaminD: 0, vitaminE: 0.2, vitaminB12: 0.1, folate: 5, thiamine: 0.03, riboflavin: 0.08, niacin: 0.2, calcium: 80, iron: 0.3, magnesium: 8, potassium: 100, sodium: 80, zinc: 0.2, phosphorus: 60 },
};

const DEFAULT_MICROS = { vitaminC: 1, vitaminA: 5, vitaminD: 0, vitaminE: 0.2, vitaminB12: 0, folate: 8, thiamine: 0.05, riboflavin: 0.04, niacin: 0.8, calcium: 20, iron: 0.5, magnesium: 12, potassium: 100, sodium: 100, zinc: 0.3, phosphorus: 50 };

function formatMicros(m) {
  return `    micros: {
      vitaminC: ${m.vitaminC},
      vitaminA: ${m.vitaminA},
      vitaminD: ${m.vitaminD},
      vitaminE: ${m.vitaminE},
      vitaminB12: ${m.vitaminB12},
      folate: ${m.folate},
      thiamine: ${m.thiamine},
      riboflavin: ${m.riboflavin},
      niacin: ${m.niacin},
      calcium: ${m.calcium},
      iron: ${m.iron},
      magnesium: ${m.magnesium},
      potassium: ${m.potassium},
      sodium: ${m.sodium},
      zinc: ${m.zinc},
      phosphorus: ${m.phosphorus},
    }`;
}

const filePath = path.resolve(__dirname, '../src/data/foodDatabase.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Find the array content between FOOD_DATABASE: FoodItem[] = [ and the closing ];
// We'll process each object entry

// Use a robust approach: find each entry by locating the pattern
// We'll process the file by finding each { ... } block that represents a FoodItem

// Strategy: split on entry boundaries and inject micros
// Each entry starts with a line like "  {\n" and ends with "  },"  or "  };" 

let count = 0;
let modified = content;

// Replace each entry that has category: "..." but no micros:
// We'll use a regex that matches each object entry in the array
const entryPattern = /(\{[^{}]*?category:\s*"([^"]+)"[^{}]*?)\n(\s*\})/gs;

modified = content.replace(entryPattern, (match, body, category, closing) => {
  // Skip if already has micros
  if (body.includes('micros:')) return match;
  
  const micros = CATEGORY_MICROS[category] || DEFAULT_MICROS;
  count++;
  return `${body},\n${formatMicros(micros)}\n${closing}`;
});

if (count === 0) {
  console.log('No entries modified - check pattern');
} else {
  fs.writeFileSync(filePath, modified, 'utf8');
  console.log(`Successfully added micros to ${count} food entries.`);
}
