export function calculateBMI(weightKg: number, heightCm: number): number {
  if (!weightKg || !heightCm || heightCm === 0) return 0;
  const heightM = heightCm / 100;
  return parseFloat((weightKg / (heightM * heightM)).toFixed(1));
}

export interface BMICategory {
  label: string;
  colorClass: string;
  bgClass: string;
  range: string;
}

export function getBMICategory(bmi: number): BMICategory {
  if (bmi <= 0) return { label: "—", colorClass: "text-muted-foreground", bgClass: "bg-muted", range: "" };
  if (bmi < 18.5) return { label: "Underweight", colorClass: "text-blue-500", bgClass: "bg-blue-500/15", range: "< 18.5" };
  if (bmi < 25) return { label: "Normal", colorClass: "text-green-500", bgClass: "bg-green-500/15", range: "18.5–24.9" };
  if (bmi < 30) return { label: "Overweight", colorClass: "text-yellow-500", bgClass: "bg-yellow-500/15", range: "25–29.9" };
  return { label: "Obese", colorClass: "text-red-500", bgClass: "bg-red-500/15", range: "≥ 30" };
}

export function calculateCalorieGoal(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: string
): number {
  // Mifflin-St Jeor equation for BMR, then × 1.4 (light activity)
  if (!weightKg || !heightCm || !age) return 2000;
  let bmr: number;
  if (gender === "Female") {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }
  return Math.round(bmr * 1.4);
}
