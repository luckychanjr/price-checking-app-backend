/*
pickBestMatch(query, products)
Scores each product independently vs query
Picks the single best match
Uses simple heuristic scoring (substring + word overlap)

👉 This is useful when:

You already have a candidate list
You want to pick ONE winner
You don’t care about grouping duplicates

So the new file is more like:

ranking / selection engine
*/

function scoreMatch(query, productName) { 
    const q = normalize(query); 
    const name = normalize(productName); 
    let score = 0; 
    if (name.includes(q)) score += 5; 
    const qWords = q.split(" "); 
    for (const word of qWords) { 
        if (name.includes(word)) score += 1; 
    } 
    return score; 
} 

export function pickBestMatch(query, products) { 
    if (!products || products.length === 0) return null; 
    let best = products[0]; 
    let bestScore = scoreMatch(query, best.name); 
    for (const p of products) { 
        const score = scoreMatch(query, p.name); 
        if (score > bestScore) { 
            bestScore = score; 
            best = p; 
        } 
    } return best; 
}