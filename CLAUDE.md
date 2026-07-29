🧠 Project Overview
A static site that visualizes land plots from a JSON dataset on Google Maps, with
filtering and categorization by rental status.

Originally an ASP.NET Core MVC app; converted to static HTML/CSS/JS. The backend
collapsed into a build step because nothing was ever dynamic — every endpoint was
a pure function of a file that never changes at runtime.

🏗️ Tech Stack
Build (one-time, Node)
  proj4 — UTM zone 37N → WGS84 projection
Runtime (browser only)
  Plain HTML, CSS, ES modules — no framework, no Bootstrap, no jQuery
  Google Maps JavaScript API

📁 Project Structure
/land_plots_explorer
 ├── Data/plots.json          # 41 MB source, UTM 37N. Build input only.
 ├── tools/
 │    ├── build-data.mjs      # Data/plots.json -> dist/data/*.json
 │    └── test-map.html       # map.js harness against a stubbed Maps API
 ├── dist/                    # the deployable site
 │    ├── index.html
 │    ├── css/site.css
 │    ├── js/config.js        # API key + map defaults
 │    ├── js/data.js          # loads the artifacts
 │    ├── js/filters.js       # pure, DOM-free filter predicates
 │    ├── js/map.js           # polygons + info windows
 │    ├── js/ui.js            # cards + dropdowns
 │    ├── js/app.js           # bootstrap, state, wiring
 │    └── data/               # build output (committed)
 ├── desCards/                # 47 Arabic PDFs, not referenced by any code
 └── package.json             # build tooling only

📦 Data Handling
`npm run build:data` reads Data/plots.json and emits:

  dist/data/plots.json     4592 records, 1.7 MB (~277 KB gzipped)
  dist/data/meta.json      rent summary, dropdown lists, area range, anomalies
  dist/data/unmapped.json  the 47 records with no coordinates at all

The build:
  - strips the UTF-8 BOM (present in the source; hard-fails JSON.parse otherwise)
  - drops "تم احالة الاشراف للزراعة" (6726 -> 4592 records)
  - projects all 30128 ring points to WGS84 at build time, rounded to 6 decimals
  - keeps 9 core + 9 tender fields out of 63; omits empty and whitespace-only values
  - preserves EXACT source field names (OBJECTID, PLAN_NUM_1, Shape_Area)

Field naming: the .NET API serialized these inconsistently (`objectid`,
`plaN_NUM_1`, `shape_Area`), and the old template read names that did not match —
so PLAN_NUM_1 and notes_1 silently rendered blank for every plot. The build owns
the contract now; there is exactly one spelling of each field.

Tripwires: the build asserts wkid 32637, 4592 records, the per-rent counts, tender
field presence, and a bounding box on projected coordinates. It fails loudly
rather than emitting bad data.

rent_1 Labels & Colors:
  مؤجر         → "مستثمر"      #db0f0f   (1964)
  غير مؤجر     → "غير مستثمر"  #22c55e   (2584)
  قيد الطرح    → "قيد الطرح"   #1512c5   (44)
  تم احالة الاشراف للزراعة → "نفع عام"  #f59e0b  (filtered out at build)
  (empty)      → "Unknown"     #6b7280

🏠 Single Page
No navbar; fills the viewport.
  1. Dashboard (flex-shrink: 0) — title, total count, one card per rent category.
     Clicking a card filters the map in place; the active card gets a coloured ring.
     Clicking the active card again clears the filter.
  2. Map (flex: 1) — collapsible filters sidebar on the right, map fills the rest.

Deep links: `?rent=<value>` preselects a card. The value is validated against
meta.rentSummary, so an unknown value degrades to no filter.

🗺️ Map
Centered at { lat: 30.99, lng: 40.95 }, zoom 14.
Polygons are built once and toggled with setVisible() on filter changes — the
.NET version destroyed and rebuilt ~4600 Polygon objects per interaction.

📌 Polygon Info Window (on click)
Shown for ALL plots:
  رقم القطعة (OBJECTID), الحي (dis_nam_1), رقم المخطط (PLAN_NUM_1),
  الحالة (rent_1), النشاط الرئيسي (main_act_1), النشاط الفرعي (sub_acti_1),
  الموقع (location_1), المساحة (Shape_Area), ملاحظات (notes_1)

ADDITIONAL section only for rent_1 === 'قيد الطرح':
  اسم الموقع (name), النشاط (activity), المساحة المطروحة (area),
  سعر كراسة الشروط (buckletPrice), مدة العقد (contractPeriod),
  رقم الفرصة (forsaNumber), تاريخ الإعلان (advertiseDate, epoch ms),
  تاريخ فتح المظاريف (openEnvelopesDate, epoch ms),
  رابط فرصة فرص (forusLink)

The .NET template replaced the common table wholesale for قيد الطرح plots,
dropping رقم القطعة / الحي / الحالة / المساحة / ملاحظات. It is now genuinely
additive, per this spec.

Content is built as DOM nodes, not interpolated HTML. forusLink is scheme-checked
(http/https only) and all text goes through textContent.

🎛️ Filters Sidebar
  District (dis_nam_1), Main Activity (main_act_1), Sub Activity (sub_acti_1)
  → dropdowns populated from meta.json
  Area (Shape_Area) → min/max number inputs

🔍 Filtering Logic
All client-side, in dist/js/filters.js — a direct port of PlotService.FilterPlots.
Verified against the live .NET API across 211 filter combinations (exhaustive over
every district and activity, plus multi-criteria conjunctions and edge cases):
OBJECTID sets matched exactly in every case. ~0.2 ms per filter vs 84 ms per
server round trip.

filters.js is pure and DOM-free on purpose, so it can be tested under Node.

⚠️ Edge Cases / Known Data Characteristics
  - 48 of 4592 records never draw (no geometry). OBJECTID 4978 has fallback
    x_12/y_23 coordinates but no rings, so it still produces no polygon — the
    documented fallback path is functionally dead.
  - The results count reflects matching RECORDS, not drawn polygons.
  - OBJECTID 5549 and 5767 have a negative Shape_Area (reversed ring winding
    upstream). Raw values are preserved; they are excluded from the advertised
    filter range and listed under meta.anomalies. The .NET app advertised a
    -9190 m² minimum in the sidebar as a result.
  - The source is full of whitespace-only strings (3287 for notes_1, 397 for
    location_1). These are treated as empty; otherwise a bare " " appears as a
    blank dropdown option. This is the one intentional divergence from the .NET
    behaviour, which offered " " as a selectable district/activity.
  - 5 plots in طريق طريف sit ~120 km west of Arar. Real data, not corruption.
  - قيد الطرح extra fields are absent (not null) on the other 4548 records.

✅ Definition of Done
  Dashboard shows 2584 / 1964 / 44
  Clicking a card filters in place and highlights it
  Polygons render with the correct colour per rent status
  Filters update results without a network request
  Clicking a polygon shows full attributes
  قيد الطرح polygons additionally show the tender section
  tools/test-map.html passes all 26 checks
