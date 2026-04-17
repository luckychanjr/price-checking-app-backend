function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function similarity(a, b) {
  const aWords = new Set(normalize(a).split(" "));
  const bWords = new Set(normalize(b).split(" "));

  const intersection = [...aWords].filter(w => bWords.has(w)).length;
  return intersection / Math.max(aWords.size, bWords.size);
}

export function clusterProducts(products, seedName) {
  const clusters = [];

  for (const product of products) {
    let added = false;

    for (const cluster of clusters) {
      const score = similarity(cluster[0].name, product.name);

      if (score > 0.55) {
        cluster.push(product);
        added = true;
        break;
      }
    }

    if (!added) {
      clusters.push([product]);
    }
  }

  // pick best cluster (closest to seed if available)
  if (seedName) {
    clusters.sort((a, b) =>
      similarity(b[0].name, seedName) - similarity(a[0].name, seedName)
    );
  }

  return clusters[0];
}