# UI/UX Review & Recommendations

Review of the Land Plots Explorer static site, with every finding grounded in the
actual dataset (4592 plots) rather than inspection alone.

**Status legend:** ✅ applied · ⚠️ partially applied · ❌ not applied (rationale given)

---

## 1. Data correctness presenting as a UI bug

### 1.1 Duplicate Arabic spelling variants in every dropdown ✅

The source spells the same category two ways — ي vs ى — and both reach the
dropdowns as separate, visually near-identical options:

| Field | Variants | Impact of picking one |
|---|---|---|
| `main_act_1` | `استثماري` ×1077 + `استثمارى` ×253 | silently hides **253 plots (19%)** |
| `sub_acti_1` | `استثماري` ×788 + `استثمارى` ×105 | silently hides **105 plots (12%)** |
| `dis_nam_1` | `حي المنصورية` ×23 + `حى المنصورية` ×1 | hides 1 plot |

A user filtering "استثماري" received a confidently wrong answer with no indication
anything was missing. This outranked every cosmetic issue.

**Applied** in `js/data.js`: variants are normalised at load (ى→ي, أإآ→ا,
whitespace collapsed) and each group collapses onto its **most frequent** spelling,
so the label shown is the one that dominates the real data. `ة/ه` is deliberately
*not* merged — that pair changes meaning in Arabic, and it produces no duplicates
here anyway.

`meta.json`'s facet lists are rebuilt from the normalised plots, otherwise the
merged-away spellings would resurface as dead `(0)` options.

> **Better long-term fix:** do this in `tools/build-data.mjs` so the artifact
> ships clean. That script no longer exists (deleted, untracked), so the fix lives
> at load time instead. It is idempotent and survives a future rebuild.

---

## 2. High-impact UX

### 2.1 The map never moved to your results ✅

Only **45% of plots** fall inside the default viewport. Selecting **قيد الطرح**
reported 44 results while just **11 of those 44** were on screen — indistinguishable
from a broken filter.

| Category | Plots | Visible at default view |
|---|---|---|
| قيد الطرح | 44 | 11 (25%) |
| غير مؤجر | 2537 | 723 (28%) |
| مؤجر | 1964 | 1316 (67%) |

**Applied**: `fitToPlots()` in `js/map.js` reframes on every filter change, capped
at `maxZoom: 17` so a single-plot result keeps surrounding context. Clearing all
filters returns to the configured default framing rather than staying zoomed in.

### 2.2 Filters did not cascade — 92.7% of combinations were dead ends ✅

Of the 2613 district × sub-activity pairs the dropdowns offered, **2422 returned
zero results** (88.5% for district × main-activity). The only way to discover this
was trial and error.

**Applied**: each dropdown now shows a live count per option (`ورش (1608)`) and
disables options that return nothing under the *other* active filters. Counts
exclude the facet's own selection — otherwise each dropdown would collapse to the
single value already chosen, with no way to switch to a sibling.

### 2.3 No empty state ✅

Zero results produced a blank map and "0", indistinguishable from a load failure.
**Applied**: an explicit "لا توجد نتائج مطابقة" panel with a one-click reset.

### 2.4 Two inconsistent interaction models ✅

Cards filtered instantly; sidebar filters required pressing تطبيق. Filtering costs
**0.195 ms** — there was never a reason to batch it.

**Applied**: dropdowns filter on `change`, area inputs on debounced `input`
(300 ms). تطبيق remains for explicit/keyboard submission.

### 2.5 The count disagreed with the map ✅

48 records have no geometry, so a filter can report more results than polygons
drawn. **Applied**: when they differ, a sub-line reads `4544 معروضة على الخريطة`.

---

## 3. Secondary improvements

| # | Issue | Status |
|---|---|---|
| 3.1 | No way to clear the rent filter except re-clicking the active card (undiscoverable) | ✅ explicit **الكل** card added, active by default |
| 3.2 | Colours only decoded by dashboard cards — which now collapse, taking the key with them | ✅ persistent map legend |
| 3.3 | Filters not shareable; only `?rent=` survived | ✅ full filter state synced to the query string |
| 3.4 | Inverted area range (min > max) silently returned zero | ✅ bounds swapped, with a visible notice |
| 3.5 | Icon-only buttons unlabelled; toggles had no state | ✅ `aria-label`, `aria-expanded`, `aria-pressed`, `aria-live` |
| 3.6 | Dashboard + sidebar left almost no map on phones | ✅ dashboard starts collapsed below 768px |
| 3.7 | `ملاحظات` row commented out — 978 plots had unreachable notes | ✅ restored, rendered only when non-empty |

On 3.7: the row was switched off because 3614 plots hold a placeholder `" "` and
rendered an empty row. Making it conditional keeps the row absent for those and
present for the 978 that have real content.

---

## 4. The sub-activity chart ✅

### Why not a pie chart

`sub_acti_1` has 39 categories after normalisation, **25 of them holding ≤7 plots**.
As slices they are invisible. The distribution is severely long-tailed:

| | |
|---|---|
| Top 5 categories | **81.5%** of all plots |
| Top 10 | **92.9%** |
| Ranks 11–39 | 29 categories, **5.7%** combined |
| ورش alone | **35%** |

### What was built

A **horizontal stacked bar chart** (`js/chart.js`), in the sidebar:

- **Horizontal** — the labels are long Arabic phrases; vertical bars force
  rotated, unreadable text.
- **Stacked by rent status**, reusing the existing palette. This is where the
  signal lives:

  | Sub-activity | Plots | مؤجر | غير مؤجر | Signal |
  |---|---|---|---|---|
  | مستودعات | 192 | 180 | 12 | **94% occupied** |
  | مصانع | 62 | 59 | 3 | **95% occupied** |
  | ورش | 1608 | 999 | 607 | 62% occupied |
  | استراحات | 683 | 118 | 563 | **82% vacant** |
  | منجرة | 48 | 0 | 48 | **100% vacant** |

  A plain count chart says "ورش is biggest". A stacked one says "warehouses and
  factories are saturated; rest-houses and carpentries sit empty."

- **Top 10 + an expandable أخرى row** — the tail is summarised, never silently
  dropped.
- **Count ⇄ Area toggle** — they tell different stories: استثماري is **462 ha** vs
  ورش **234 ha** despite half the plot count (median 2637 m² vs 1305 m²).
- **Clickable bars** set the sub-activity filter, consistent with the cards.
- **Respects active filters**, so it is a drill-down: pick a district, see its
  activity mix.
- **"(غير محدد)" shown explicitly** — 470 plots (10.2%), rank 4. Hiding it would
  misstate the totals. It is not clickable: it is an absence of a value, not a
  value to filter to.

**No charting library.** Twelve bars are ~40 lines of DOM. A CDN dependency would
be the only external runtime dependency in the project and would break offline use.

> Segments are proportional to plot **count** even in area mode — a per-segment
> area split is not tracked, and inventing one would misreport.

---

## 5. Not applied

### 5.1 Viewport culling / polygon clustering ❌

4556 polygons and 30,128 vertices stay mounted permanently; below zoom ~13 they are
sub-pixel. Rendering only in-bounds geometry, or swapping to clustered markers when
zoomed out, would cut idle cost substantially.

**Not applied**: this changes what is on screen based on viewport, which needs real
interactive profiling on the target hardware to tune. Doing it blind risks plots
that vanish while panning — a worse failure than the current slowness. Current
performance is acceptable (polygons are reused across filters, not rebuilt).

### 5.2 Colour-blind-safe palette ❌

مؤجر red / غير مؤجر green is the single worst pair for the ~8% of men with
colour-vision deficiency, and red-for-occupied may read backwards to newcomers.

**Not applied**: the palette is specified in `CLAUDE.md` and matches the original
system, so changing it is a product decision, not a bug fix. A redundant channel
(stroke weight or fill pattern) would preserve the existing colours while removing
the reliance on hue — worth doing, but it needs your sign-off first.

### 5.3 Area filter presets ❌

The range is 3.88–406,427 m², so linear numeric entry is awkward; presets
(< 1000، 1000–5000، > 5000) would beat free text. **Not applied** — it changes the
filter's semantics from continuous to bucketed, which should be your call. The
inverted-range fix (3.4) addresses the actual correctness problem.

---

## Verification

All changes verified in headless Chrome against the real dataset — **41/41 checks
passing**: variant merging, facet counts matching real result counts, dead-end
disabling, URL round-tripping, empty state, inverted ranges, the الكل card, chart
composition, click-to-filter, tail expansion, the metric toggle, and ARIA state.

**Not verified:** anything requiring a working map. The API key is referrer-
restricted and rejects `localhost`, so `fitToPlots()`, the legend's position over
live map controls, and polygon rendering could not be exercised end to end. These
need a check on the real deployment origin.
