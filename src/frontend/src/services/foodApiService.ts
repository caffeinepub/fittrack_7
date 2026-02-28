const CACHE_KEY = "food_api_cache";

export interface USDAFood {
  name: string;
  caloriesPer100g: number;
  category?: string;
}

function getCache(): Record<string, USDAFood[]> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, USDAFood[]>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage might be full — ignore
  }
}

/**
 * Search Open Food Facts API (free, no key required, CORS-enabled).
 * Falls back gracefully on any error.
 */
export async function searchFoodUSDA(query: string): Promise<USDAFood[]> {
  const key = query.toLowerCase().trim();
  if (!key) return [];

  const cache = getCache();
  if (cache[key]) return cache[key];

  try {
    // Open Food Facts search endpoint — returns products with nutriments
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&fields=product_name,nutriments,categories_tags`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];

    const data = await res.json();
    const foods: USDAFood[] = [];

    for (const product of data.products || []) {
      const name = product.product_name?.trim();
      const kcal =
        product.nutriments?.["energy-kcal_100g"] ??
        product.nutriments?.["energy-kcal"];
      if (!name || !kcal || kcal <= 0) continue;

      const rawCategory = (product.categories_tags || [])[0] || "";
      const category =
        rawCategory.replace(/^(en:|fr:)/, "").replace(/-/g, " ") || "General";

      foods.push({
        name,
        caloriesPer100g: Math.round(kcal),
        category: category.charAt(0).toUpperCase() + category.slice(1),
      });
    }

    const result = foods.slice(0, 6);
    if (result.length > 0) {
      cache[key] = result;
      saveCache(cache);
    }
    return result;
  } catch {
    return [];
  }
}
