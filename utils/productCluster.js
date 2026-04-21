import { normalize } from "./productNormalizer.js";

const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "for",
  "inch",
  "inches",
  "class",
  "model",
  "edition",
  "version",
  "wifi",
  "smart",
  "led",
  "uhd"
]);

const CLUSTER_THRESHOLD = 4.25;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function intersectionSize(a, b) {
  return [...a].filter(value => b.has(value)).length;
}

function isStorageLikeToken(token) {
  return /^\d+(?:\.\d+)?(?:gb|tb)$/i.test(token);
}

function isScreenLikeToken(token) {
  return /^\d+(?:\.\d+)?(?:inch|in)$/i.test(token);
}

function isResolutionLikeToken(token) {
  return /^\d+(?:k|p)$/i.test(token);
}

function extractStorageTokens(rawName) {
  return unique(
    [...rawName.matchAll(/\b(\d+(?:\.\d+)?)\s?(gb|tb)\b/gi)].map(
      match => `${match[1]}${match[2].toLowerCase()}`
    )
  );
}

function extractScreenValues(rawName) {
  const matches = [
    ...rawName.matchAll(/\b(\d+(?:\.\d+)?)\s?(?:-|\s)?(?:inch|in|")\b/gi),
    ...rawName.matchAll(/\b(\d+(?:\.\d+)?)\s?class\b/gi)
  ];

  return unique(matches.map(match => match[1]));
}

function extractScreenTokens(rawName) {
  return extractScreenValues(rawName).map(value => `${value}in`);
}

function extractModelTokens(tokens) {
  return unique(
    tokens.filter(token =>
      /[a-z]/.test(token) &&
      /\d/.test(token) &&
      token.length >= 2 &&
      !isStorageLikeToken(token) &&
      !isScreenLikeToken(token) &&
      !isResolutionLikeToken(token)
    )
  );
}

function extractNumericTokens(tokens, excludedTokens, excludedNumberValues) {
  const excluded = new Set(excludedTokens);
  const excludedValues = new Set(excludedNumberValues);

  return unique(
    tokens.filter(token => {
      if (!/\d/.test(token) || excluded.has(token) || isStorageLikeToken(token) || isScreenLikeToken(token)) {
        return false;
      }

      if (/^\d+(?:\.\d+)?$/.test(token) && excludedValues.has(token)) {
        return false;
      }

      return true;
    })
  );
}

function tokenizeName(rawName) {
  return normalize(rawName)
    .split(" ")
    .map(token => token.trim())
    .filter(Boolean);
}

export function extractProductFeatures(productName) {
  const rawName = String(productName ?? "");
  const normalizedName = normalize(rawName);
  const tokens = tokenizeName(rawName);
  const storageTokens = extractStorageTokens(rawName);
  const screenValues = extractScreenValues(rawName);
  const screenTokens = extractScreenTokens(rawName);
  const excludedNumericTokens = [...storageTokens, ...screenTokens];
  const modelTokens = extractModelTokens(tokens);
  const numericTokens = extractNumericTokens(tokens, excludedNumericTokens, screenValues);
  const informativeTokens = unique(
    tokens.filter(
      token =>
        token.length > 1 &&
        !STOP_WORDS.has(token) &&
        !isScreenLikeToken(token)
    )
  );

  return {
    normalizedName,
    brand: tokens[0] || "",
    tokens: new Set(tokens),
    informativeTokens: new Set(informativeTokens),
    storageTokens: new Set(storageTokens),
    screenTokens: new Set(screenTokens),
    modelTokens: new Set(modelTokens),
    numericTokens: new Set(numericTokens)
  };
}

export function scoreProductSimilarity(aName, bName) {
  const a = extractProductFeatures(aName);
  const b = extractProductFeatures(bName);

  if (!a.normalizedName || !b.normalizedName) {
    return 0;
  }

  if (a.normalizedName === b.normalizedName) {
    return 10;
  }

  let score = 0;

  if (a.brand && a.brand === b.brand) {
    score += 1.25;
  }

  const sharedModelTokens = intersectionSize(a.modelTokens, b.modelTokens);
  if (sharedModelTokens > 0) {
    score += Math.min(3, sharedModelTokens * 2.5);
  } else if (a.modelTokens.size > 0 && b.modelTokens.size > 0) {
    score -= 1.5;
  }

  const sharedStorageTokens = intersectionSize(a.storageTokens, b.storageTokens);
  const hasStorageConflict =
    sharedStorageTokens === 0 &&
    a.storageTokens.size > 0 &&
    b.storageTokens.size > 0;
  if (sharedStorageTokens > 0) {
    score += 2;
  } else if (hasStorageConflict) {
    score -= 5;
  }

  const sharedScreenTokens = intersectionSize(a.screenTokens, b.screenTokens);
  const hasScreenConflict =
    sharedScreenTokens === 0 &&
    a.screenTokens.size > 0 &&
    b.screenTokens.size > 0;
  if (sharedScreenTokens > 0) {
    score += 1.75;
  } else if (hasScreenConflict) {
    score -= 4.5;
  }

  const sharedNumericTokens = intersectionSize(a.numericTokens, b.numericTokens);
  if (sharedNumericTokens > 0) {
    score += Math.min(1.5, sharedNumericTokens * 0.75);
  }

  const informativeIntersection = intersectionSize(a.informativeTokens, b.informativeTokens);
  const informativeUnion = new Set([
    ...a.informativeTokens,
    ...b.informativeTokens
  ]).size;

  if (informativeUnion > 0) {
    score += (informativeIntersection / informativeUnion) * 3;
  }

  if (informativeIntersection <= 1 && sharedModelTokens === 0) {
    score -= 1;
  }

  if (hasStorageConflict) {
    score = Math.min(score, CLUSTER_THRESHOLD - 0.5);
  }

  if (hasScreenConflict) {
    score = Math.min(score, CLUSTER_THRESHOLD - 0.75);
  }

  return score;
}

function clusterSimilarity(cluster, product) {
  return Math.max(
    ...cluster.map(existingProduct => scoreProductSimilarity(existingProduct.name, product.name))
  );
}

export function clusterProductGroups(products, seedName) {
  const clusters = [];

  for (const product of products) {
    let bestCluster = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const cluster of clusters) {
      const score = clusterSimilarity(cluster, product);

      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestScore >= CLUSTER_THRESHOLD) {
      bestCluster.push(product);
    } else {
      clusters.push([product]);
    }
  }

  if (seedName) {
    clusters.sort((a, b) => {
      const scoreA = Math.max(
        ...a.map(product => scoreProductSimilarity(product.name, seedName))
      );
      const scoreB = Math.max(
        ...b.map(product => scoreProductSimilarity(product.name, seedName))
      );

      return scoreB - scoreA;
    });
  }

  return clusters;
}

export function clusterProducts(products, seedName) {
  return clusterProductGroups(products, seedName)[0] || [];
}
