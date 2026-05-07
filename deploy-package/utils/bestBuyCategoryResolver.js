import fs from "fs";
import path from "path";

const CATEGORY_SEARCH_TIMEOUT_MS = 4000;
const CATEGORY_RESULT_LIMIT = 5;
const CATEGORY_PAGE_SIZE = 10;
const CATEGORY_FIELDS = [
  "id",
  "name",
  "path.id",
  "path.name"
];
const GENERIC_CATEGORY_TERMS = new Set([
  "apple",
  "best",
  "buy",
  "for",
  "new",
  "plus",
  "pro",
  "the",
  "ultra",
  "with"
]);
const FALLBACK_CATEGORY_RULES = [
  {
    terms: ["ipad", "pro"],
    categoryIds: ["pcmcat1478822288810"]
  },
  {
    terms: ["ipad", "air"],
    categoryIds: ["pcmcat361600050004"]
  },
  {
    terms: ["ipad"],
    categoryIds: ["pcmcat209000050007"]
  },
  {
    terms: ["samsung", "galaxy", "tab"],
    categoryIds: [
      "pcmcat1690376289838",
      "pcmcat1695996756617",
      "pcmcat1704730259866",
      "pcmcat1727276093026",
      "pcmcat1727276478095"
    ]
  },
  {
    terms: ["tablet", "tablets"],
    categoryIds: ["pcmcat209000050008"]
  }
];

const categoryCache = new Map();
let localCategoryData = null;

function getLocalCategoryPaths() {
  return [
    process.env.BESTBUY_CATEGORY_CACHE,
    path.resolve(process.cwd(), "data", "bestbuy-categories.json"),
    path.resolve(process.cwd(), "backend", "data", "bestbuy-categories.json")
  ].filter(Boolean);
}

function loadLocalCategories() {
  if (String(process.env.BESTBUY_DISABLE_CATEGORY_CACHE || "").toLowerCase() === "true") {
    return [];
  }

  if (localCategoryData) {
    return localCategoryData;
  }

  for (const categoryPath of getLocalCategoryPaths()) {
    try {
      if (!fs.existsSync(categoryPath)) {
        continue;
      }

      const parsed = JSON.parse(fs.readFileSync(categoryPath, "utf8"));
      localCategoryData = Array.isArray(parsed?.categories) ? parsed.categories : [];
      return localCategoryData;
    } catch (err) {
      console.error(`Failed to read Best Buy category cache at ${categoryPath}:`, err);
    }
  }

  localCategoryData = [];
  return localCategoryData;
}

async function fetchWithTimeout(url, timeoutMs, label) {
  try {
    return await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }

    throw err;
  }
}

function tokenize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(term => term.trim())
    .filter(Boolean);
}

function getMeaningfulCategoryTerms(query) {
  return tokenize(query).filter(term =>
    !GENERIC_CATEGORY_TERMS.has(term) &&
    !/^\d+$/.test(term)
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getCategorySearchPhrases(query) {
  const terms = getMeaningfulCategoryTerms(query);
  const phrases = [];

  if (terms.length > 1) {
    phrases.push(terms.join(" "));
  }

  for (let index = 0; index < terms.length - 1; index += 1) {
    phrases.push(`${terms[index]} ${terms[index + 1]}`);
  }

  phrases.push(...terms);

  return unique(phrases).slice(0, 5);
}

function getFallbackCategoryIds(query) {
  const terms = new Set(tokenize(query));
  const matchingRules = FALLBACK_CATEGORY_RULES.filter(rule =>
    rule.terms.every(term => terms.has(term))
  );

  return matchingRules.flatMap(rule => rule.categoryIds);
}

function buildCategorySearchUrl(phrase, apiKey) {
  const expression = `name=${encodeURIComponent(`${phrase}*`)}`;

  return `https://api.bestbuy.com/v1/categories(${expression})?apiKey=${apiKey}&format=json&pageSize=${CATEGORY_PAGE_SIZE}&show=${CATEGORY_FIELDS.join(",")}`;
}

function getCategoryText(category) {
  const pathNames = Array.isArray(category?.path)
    ? category.path.map(pathItem => pathItem?.name)
    : [];

  return [category?.name, ...pathNames].filter(Boolean).join(" ");
}

function scoreCategory(category, queryTerms) {
  const categoryTerms = new Set(tokenize(getCategoryText(category)));
  const overlap = [...queryTerms].filter(term => categoryTerms.has(term)).length;
  const depth = Array.isArray(category?.path) ? category.path.length : 1;

  return overlap * 10 + depth;
}

async function searchCategoriesForPhrase(phrase, apiKey) {
  const cacheKey = `${apiKey}:${phrase}`;

  if (categoryCache.has(cacheKey)) {
    return categoryCache.get(cacheKey);
  }

  const url = buildCategorySearchUrl(phrase, apiKey);
  const response = await fetchWithTimeout(url, CATEGORY_SEARCH_TIMEOUT_MS, "Best Buy category search request");
  const data = await response.json();
  const categories = Array.isArray(data?.categories) ? data.categories : [];

  categoryCache.set(cacheKey, categories);
  return categories;
}

function searchLocalCategories(query) {
  const meaningfulTerms = getMeaningfulCategoryTerms(query);
  const queryTerms = new Set(meaningfulTerms);
  const categories = loadLocalCategories();
  const minimumOverlap = meaningfulTerms.length <= 1 ? 1 : 2;

  if (categories.length === 0 || queryTerms.size === 0) {
    return [];
  }

  return categories
    .filter(category => category?.id)
    .map(category => ({
      ...category,
      score: scoreCategory(category, queryTerms),
      overlap: [...queryTerms].filter(term => new Set(tokenize(getCategoryText(category))).has(term)).length
    }))
    .filter(category => category.overlap >= minimumOverlap)
    .sort((a, b) => b.score - a.score)
    .slice(0, CATEGORY_RESULT_LIMIT);
}

export async function resolveBestBuyCategoryIds(query, apiKey) {
  const queryTerms = new Set(getMeaningfulCategoryTerms(query));
  const localCategories = searchLocalCategories(query);
  const fallbackCategoryIds = getFallbackCategoryIds(query);

  if (localCategories.length > 0 || fallbackCategoryIds.length > 0) {
    return unique([
      ...fallbackCategoryIds,
      ...localCategories.map(category => category.id),
    ]);
  }

  const phrases = getCategorySearchPhrases(query);
  const categories = [];

  for (const phrase of phrases) {
    try {
      categories.push(...await searchCategoriesForPhrase(phrase, apiKey));
    } catch (err) {
      console.error("Best Buy category search failed:", err);
    }
  }

  const scoredCategories = categories
    .filter(category => category?.id)
    .map(category => ({
      id: category.id,
      score: scoreCategory(category, queryTerms)
    }))
    .filter(category => category.score > 0)
    .sort((a, b) => b.score - a.score);

  return unique([
    ...fallbackCategoryIds,
    ...scoredCategories.slice(0, CATEGORY_RESULT_LIMIT).map(category => category.id),
  ]);
}
