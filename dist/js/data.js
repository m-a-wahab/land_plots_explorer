/**
 * Loads the build artifacts produced by tools/build-data.mjs, then normalises
 * Arabic spelling variants before anything else sees the data.
 */

let cache = null;

/**
 * Collapses orthographic variants that the source data treats as distinct:
 *   ى / ي   (alef maqsura vs yaa)  — the actual offender in this dataset
 *   أ إ آ / ا (hamza forms)
 *   runs of whitespace
 *
 * Deliberately does NOT merge ة/ه: that pair changes meaning in Arabic, and
 * checking the source showed it produces no duplicates here anyway.
 */
export const normalizeArabic = (value) =>
  String(value)
    .replace(/[ىي]/g, 'ي')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim();

const CANONICALISED_FIELDS = ['dis_nam_1', 'main_act_1', 'sub_acti_1'];

/**
 * The source spells the same category two ways — `استثماري` (1077) and
 * `استثمارى` (253) in main_act_1, and similarly in sub_acti_1 and dis_nam_1.
 * Both spellings reach the dropdowns as separate, visually near-identical
 * options, so picking one silently discards the other's plots (253 of 1330 for
 * main activity — a 19% undercount presented as a complete answer).
 *
 * Each variant group collapses onto its most frequent spelling, so the label
 * shown is the one that dominates the real data rather than an invented form.
 */
function canonicaliseVariants(plots) {
  const merges = [];

  for (const field of CANONICALISED_FIELDS) {
    const groups = new Map(); // normalised -> Map<original, count>

    for (const plot of plots) {
      const value = plot[field];
      if (!value) continue;
      const key = normalizeArabic(value);
      if (!groups.has(key)) groups.set(key, new Map());
      const variants = groups.get(key);
      variants.set(value, (variants.get(value) ?? 0) + 1);
    }

    const canonical = new Map(); // original -> canonical
    for (const [, variants] of groups) {
      if (variants.size < 2) continue;
      const winner = [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0];
      for (const [original] of variants) canonical.set(original, winner);
      merges.push({
        field,
        kept: winner,
        merged: [...variants.keys()].filter((v) => v !== winner),
        total: [...variants.values()].reduce((a, b) => a + b, 0),
      });
    }

    if (canonical.size === 0) continue;
    for (const plot of plots) {
      const replacement = canonical.get(plot[field]);
      if (replacement) plot[field] = replacement;
    }
  }

  return merges;
}

export async function loadData() {
  if (cache) return cache;

  const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} -> HTTP ${response.status} ${response.statusText}`);
    }
    return response.json();
  };

  const [plots, meta] = await Promise.all([
    fetchJson('data/plots.json'),
    fetchJson('data/meta.json'),
  ]);

  const merges = canonicaliseVariants(plots);
  for (const m of merges) {
    console.info(
      `[data] ${m.field}: merged ${m.merged.map((v) => `"${v}"`).join(', ')} ` +
      `into "${m.kept}" (${m.total} plots total)`
    );
  }

  // meta.json's facet lists were built before normalisation, so they still carry
  // the merged-away spellings. Left alone, each would surface as a dead "(0)"
  // option — the same duplicate the merge exists to remove. Rebuild them from the
  // normalised plots so the dropdowns and the data cannot disagree.
  const distinctSorted = (field) =>
    [...new Set(plots.map((p) => p[field]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ar'));

  meta.districts = distinctSorted('dis_nam_1');
  meta.mainActivities = distinctSorted('main_act_1');
  meta.subActivities = distinctSorted('sub_acti_1');

  cache = { plots, meta, merges };
  return cache;
}
