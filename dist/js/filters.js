/**
 * Client-side port of PlotService.FilterPlots / GetPlotsByRent
 * (Services/PlotService.cs:69-97).
 *
 * The .NET app made a round trip per filter change — GET /api/plots?rent=… when
 * only a card was selected, POST /api/plots/filter otherwise. Both collapse into
 * this one function: 4592 records filter in well under a millisecond, so the
 * distinction the old client drew between the two endpoints no longer exists.
 *
 * Pure and DOM-free so tools/verify-filters.mjs can run it under Node and diff the
 * results against the real API.
 */

/**
 * Mirrors C# `string.IsNullOrEmpty` on the criteria side: an absent criterion is
 * one that is null, undefined, or "". Note this is IsNullOrEmpty and NOT
 * IsNullOrWhiteSpace — matching the server. It no longer makes a practical
 * difference, because the build strips whitespace-only values so no dropdown can
 * offer " ", but the semantics are kept identical on purpose.
 */
const isAbsent = (value) => value === null || value === undefined || value === '';

/**
 * @param {Array<object>} plots   records from data/plots.json
 * @param {object} criteria       { rentStatus, disName, mainActivity, subActivity, minArea, maxArea }
 * @returns {Array<object>}
 */
export function filterPlots(plots, criteria = {}) {
  const { rentStatus, disName, mainActivity, subActivity, minArea, maxArea } = criteria;

  let results = plots;

  // (p.rent_1 ?? "") == criteria.RentStatus — the build omits empty rent_1
  // entirely, so `?? ''` here stands in for the C# null-coalesce.
  if (!isAbsent(rentStatus)) {
    results = results.filter((p) => (p.rent_1 ?? '') === rentStatus);
  }

  if (!isAbsent(disName)) {
    results = results.filter((p) => p.dis_nam_1 === disName);
  }

  if (!isAbsent(mainActivity)) {
    results = results.filter((p) => p.main_act_1 === mainActivity);
  }

  if (!isAbsent(subActivity)) {
    results = results.filter((p) => p.sub_acti_1 === subActivity);
  }

  // C# guards these with HasValue, so 0 is a real bound — hence a null check
  // rather than a truthiness check. Shape_Area is absent on no records today, but
  // if it ever were, `undefined >= n` is false in JS just as `null >= n` is false
  // in C#, so the two agree.
  if (minArea !== null && minArea !== undefined && !Number.isNaN(minArea)) {
    results = results.filter((p) => p.Shape_Area >= minArea);
  }

  if (maxArea !== null && maxArea !== undefined && !Number.isNaN(maxArea)) {
    results = results.filter((p) => p.Shape_Area <= maxArea);
  }

  return results;
}

/** Maps a dropdown element id to the criteria key and plot field it drives. */
export const FACETS = {
  district: { criteria: 'disName', field: 'dis_nam_1' },
  mainActivity: { criteria: 'mainActivity', field: 'main_act_1' },
  subActivity: { criteria: 'subActivity', field: 'sub_acti_1' },
};

/**
 * Counts available options for one facet, with every OTHER filter applied but
 * not this facet's own selection.
 *
 * Excluding a facet from its own count is what makes faceted search usable:
 * counting with the selection applied would collapse each dropdown to the single
 * option already chosen, and there would be no way to switch to a sibling value.
 *
 * @returns {Map<string, number>} option value -> matching plot count
 */
export function facetCounts(plots, criteria, facetCriteriaKey) {
  const withoutSelf = { ...criteria, [facetCriteriaKey]: null };
  const scope = filterPlots(plots, withoutSelf);

  const field = Object.values(FACETS).find((f) => f.criteria === facetCriteriaKey)?.field;
  const counts = new Map();
  for (const plot of scope) {
    const value = plot[field];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * Counts plots per value of `field`, grouped by rent status.
 * @returns {Array<{value: string, total: number, byRent: Record<string, number>, area: number}>}
 *          sorted by total descending.
 */
export function groupByField(plots, field, unknownLabel = '(غير محدد)') {
  const groups = new Map();

  for (const plot of plots) {
    const value = plot[field] || unknownLabel;
    if (!groups.has(value)) groups.set(value, { value, total: 0, byRent: {}, area: 0 });
    const group = groups.get(value);
    group.total++;
    const rent = plot.rent_1 ?? '';
    group.byRent[rent] = (group.byRent[rent] ?? 0) + 1;
    // Two records carry a negative Shape_Area (reversed ring winding upstream);
    // excluded so they cannot subtract from a category's total.
    if (plot.Shape_Area > 0) group.area += plot.Shape_Area;
  }

  return [...groups.values()].sort((a, b) => b.total - a.total);
}
