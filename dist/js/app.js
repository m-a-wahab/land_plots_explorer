/**
 * Application bootstrap: reads the prebuilt data, renders the dashboard, filters,
 * chart and map, and keeps them in sync with the URL.
 */

import { loadData } from './data.js';
import { filterPlots, facetCounts, FACETS } from './filters.js';
import { loadGoogleMaps, initMap, renderPlots, fitToPlots, resetView } from './map.js';
import { renderCards, setActiveCard, populateSelect, renderLegend, setStatus } from './ui.js';
import { renderChart } from './chart.js';

const el = {
  cardsGrid: document.getElementById('cardsGrid'),
  totalPlots: document.getElementById('totalPlots'),
  rentStatus: document.getElementById('rentStatus'),
  district: document.getElementById('district'),
  mainActivity: document.getElementById('mainActivity'),
  subActivity: document.getElementById('subActivity'),
  minArea: document.getElementById('minArea'),
  maxArea: document.getElementById('maxArea'),
  areaMinLabel: document.getElementById('areaMinLabel'),
  areaMaxLabel: document.getElementById('areaMaxLabel'),
  areaWarning: document.getElementById('areaWarning'),
  resultsCount: document.getElementById('resultsCount'),
  resultsDrawn: document.getElementById('resultsDrawn'),
  filterForm: document.getElementById('filterForm'),
  resetFilters: document.getElementById('resetFilters'),
  filtersSidebar: document.getElementById('filtersSidebar'),
  toggleSidebar: document.getElementById('toggleSidebar'),
  showSidebar: document.getElementById('showSidebar'),
  dashboardSection: document.querySelector('.dashboard-section'),
  toggleDashboard: document.getElementById('toggleDashboard'),
  showDashboard: document.getElementById('showDashboard'),
  legend: document.getElementById('mapLegend'),
  emptyState: document.getElementById('emptyState'),
  emptyReset: document.getElementById('emptyReset'),
  chart: document.getElementById('chart'),
  chartMetric: document.getElementById('chartMetric'),
  status: document.getElementById('appStatus'),
};

/** Current filter state — the client-side equivalent of FilterCriteria. */
const state = {
  rentStatus: '',
  disName: '',
  mainActivity: '',
  subActivity: '',
  minArea: null,
  maxArea: null,
};

const chartState = { metric: 'count', expanded: false };

let plots = [];
let meta = null;
let mapReady = false;
let suppressUrlSync = false;

const isFiltered = () =>
  Boolean(state.rentStatus || state.disName || state.mainActivity ||
          state.subActivity || state.minArea !== null || state.maxArea !== null);

// --- state <-> form --------------------------------------------------------

function readFormIntoState() {
  state.rentStatus = el.rentStatus.value;
  state.disName = el.district.value;
  state.mainActivity = el.mainActivity.value;
  state.subActivity = el.subActivity.value;

  const min = el.minArea.value === '' ? null : Number(el.minArea.value);
  const max = el.maxArea.value === '' ? null : Number(el.maxArea.value);

  // An inverted range silently returns nothing, which reads as "no such plots"
  // rather than "your bounds are backwards". Swap and say so.
  const inverted = min !== null && max !== null && min > max;
  state.minArea = inverted ? max : min;
  state.maxArea = inverted ? min : max;
  el.areaWarning.hidden = !inverted;
}

function clearFilterInputs() {
  el.district.value = '';
  el.mainActivity.value = '';
  el.subActivity.value = '';
  el.minArea.value = '';
  el.maxArea.value = '';
  el.areaWarning.hidden = true;
}

// --- URL sync --------------------------------------------------------------

const URL_KEYS = {
  rent: 'rentStatus',
  district: 'disName',
  main: 'mainActivity',
  sub: 'subActivity',
  minArea: 'minArea',
  maxArea: 'maxArea',
};

/** Mirrors filter state into the query string so a view can be shared. */
function syncUrl() {
  if (suppressUrlSync) return;
  const params = new URLSearchParams();
  for (const [param, key] of Object.entries(URL_KEYS)) {
    const value = state[key];
    if (value !== '' && value !== null && value !== undefined) params.set(param, value);
  }
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

function readUrlIntoForm() {
  const params = new URLSearchParams(location.search);
  const valid = (select, value) =>
    value && [...select.options].some((o) => o.value === value);

  const rent = params.get('rent') ?? '';
  if (rent && meta.rentSummary.some((r) => r.key === rent)) el.rentStatus.value = rent;

  if (valid(el.district, params.get('district'))) el.district.value = params.get('district');
  if (valid(el.mainActivity, params.get('main'))) el.mainActivity.value = params.get('main');
  if (valid(el.subActivity, params.get('sub'))) el.subActivity.value = params.get('sub');

  const num = (v) => (v !== null && v !== '' && !Number.isNaN(Number(v)) ? v : '');
  el.minArea.value = num(params.get('minArea'));
  el.maxArea.value = num(params.get('maxArea'));
}

// --- render ----------------------------------------------------------------

/** Repopulates each dropdown with counts reachable under the OTHER filters. */
function refreshFacets() {
  for (const [id, facet] of Object.entries(FACETS)) {
    const counts = facetCounts(plots, state, facet.criteria);
    const values = meta[
      { district: 'districts', mainActivity: 'mainActivities', subActivity: 'subActivities' }[id]
    ];
    populateSelect(el[id], values, counts);
  }
}

function applyFilters({ fit = true } = {}) {
  readFormIntoState();
  const results = filterPlots(plots, state);

  el.resultsCount.textContent = String(results.length);

  // Records without geometry match filters but draw nothing. Saying so avoids a
  // count that permanently disagrees with the map.
  const drawable = results.filter((p) => p.rings?.length).length;
  if (drawable !== results.length) {
    el.resultsDrawn.hidden = false;
    el.resultsDrawn.textContent = `${drawable} معروضة على الخريطة`;
  } else {
    el.resultsDrawn.hidden = true;
  }

  el.emptyState.hidden = results.length > 0;
  setActiveCard(el.cardsGrid, state.rentStatus);
  refreshFacets();

  renderChart(el.chart, results, {
    metric: chartState.metric,
    expanded: chartState.expanded,
    selected: state.subActivity || null,
    onSelect: (value) => {
      el.subActivity.value = value ?? '';
      applyFilters();
    },
    onExpand: () => {
      chartState.expanded = !chartState.expanded;
      applyFilters({ fit: false });
    },
  });

  if (mapReady) {
    renderPlots(results);
    // Only reframe when a filter is active; with no filters the configured
    // default view is the intended framing.
    if (fit) {
      if (isFiltered()) fitToPlots(results);
      else resetView(window.APP_CONFIG?.map);
    }
  }

  syncUrl();
  return results;
}

function selectRent(rentKey, cardEl) {
  const alreadyActive = cardEl.classList.contains('active');
  const nextKey = alreadyActive ? '' : rentKey;
  el.rentStatus.value = nextKey;
  clearFilterInputs();
  applyFilters();
}

function resetAll() {
  el.rentStatus.value = '';
  clearFilterInputs();
  chartState.expanded = false;
  applyFilters();
}

// --- programmatic API (used by the chat widget) ----------------------------
// The chat assistant sets filters exactly the way a human clicking the UI does:
// write the DOM controls, then run the SAME applyFilters() pipeline (facets,
// chart, URL sync, map fit). No filtering logic is duplicated.

/** Maps a criteria key to its form control. */
const SETTABLE = {
  rentStatus: () => el.rentStatus,
  disName: () => el.district,
  mainActivity: () => el.mainActivity,
  subActivity: () => el.subActivity,
  minArea: () => el.minArea,
  maxArea: () => el.maxArea,
};

/**
 * Sets one or more filters from outside the form. Only keys present in `partial`
 * change; pass '' to clear a field. Categorical values are validated against
 * `meta`, so a hallucinated district is rejected rather than silently producing
 * an empty map (same guard as readUrlIntoForm).
 *
 * @param {object} partial { rentStatus, disName, mainActivity, subActivity, minArea, maxArea }
 * @returns {{ applied: object, rejected: object, count: number }}
 */
export function setFilters(partial = {}) {
  const validSets = {
    rentStatus: new Set(meta.rentSummary.map((r) => r.key)),
    disName: new Set(meta.districts),
    mainActivity: new Set(meta.mainActivities),
    subActivity: new Set(meta.subActivities),
  };

  const applied = {};
  const rejected = {};

  for (const [key, getInput] of Object.entries(SETTABLE)) {
    if (!(key in partial)) continue;
    const input = getInput();
    let value = partial[key];

    if (key === 'minArea' || key === 'maxArea') {
      if (value === '' || value === null || value === undefined) {
        input.value = '';
        applied[key] = '';
      } else if (!Number.isNaN(Number(value))) {
        input.value = String(Number(value));
        applied[key] = Number(value);
      } else {
        rejected[key] = value;
      }
      continue;
    }

    value = value == null ? '' : String(value);
    if (value === '' || validSets[key].has(value)) {
      input.value = value;
      applied[key] = value;
    } else {
      rejected[key] = value;
    }
  }

  const results = applyFilters();
  return { applied, rejected, count: results.length };
}

/** Clears every filter and returns to the default framing. */
export function resetFilters() {
  resetAll();
  return { count: plots.length };
}

// --- wiring ----------------------------------------------------------------

function wirePanels() {
  const bind = (toggle, show, panel, collapsedClass = 'collapsed') => {
    const set = (collapsed) => {
      panel.classList.toggle(collapsedClass, collapsed);
      show.style.display = collapsed ? 'flex' : 'none';
      toggle.setAttribute('aria-expanded', String(!collapsed));
    };
    toggle.addEventListener('click', () => set(true));
    show.addEventListener('click', () => set(false));
    return set;
  };

  bind(el.toggleSidebar, el.showSidebar, el.filtersSidebar);

  // The dashboard's height is measured in JS: it is an auto-height flex item, so
  // a `grid-template-rows: 1fr -> 0fr` accordion resolves both tracks to content
  // height and never collapses, and a fixed max-height would clip the one-column
  // card layout below 768px.
  const section = el.dashboardSection;
  const setDashboard = (collapsed, animate = true) => {
    if (animate) {
      section.style.height = `${section.getBoundingClientRect().height}px`;
      void section.offsetHeight;
    }

    section.classList.toggle('collapsed', collapsed);
    el.showDashboard.style.display = collapsed ? 'flex' : 'none';
    el.toggleDashboard.setAttribute('aria-expanded', String(!collapsed));

    if (!animate) {
      section.style.height = collapsed ? '0px' : '';
      return;
    }

    section.style.height = collapsed ? '0px' : `${section.scrollHeight}px`;

    if (!collapsed) {
      // transitionend alone is not enough: it never fires when transitions are
      // disabled (prefers-reduced-motion), which would pin the height forever.
      // The timer is the guarantee; the event just releases sooner.
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        section.style.height = '';
        section.removeEventListener('transitionend', onEnd);
      };
      const onEnd = (event) => {
        if (event.target === section && event.propertyName === 'height') release();
      };
      section.addEventListener('transitionend', onEnd);
      setTimeout(release, 400);
    }
  };

  el.toggleDashboard.addEventListener('click', () => setDashboard(true));
  el.showDashboard.addEventListener('click', () => setDashboard(false));

  // Below 768px the dashboard and sidebar together leave almost no map. Start
  // collapsed there, without animating on first paint.
  if (window.matchMedia('(max-width: 768px)').matches) setDashboard(true, false);
}

function wireForm() {
  // Filtering costs ~0.2 ms, so there is no reason to batch it behind a submit.
  // The button stays as an explicit affordance and for keyboard submission.
  for (const input of [el.district, el.mainActivity, el.subActivity]) {
    input.addEventListener('change', () => applyFilters());
  }
  for (const input of [el.minArea, el.maxArea]) {
    input.addEventListener('input', debounce(() => applyFilters(), 300));
  }

  el.filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters();
  });
  el.resetFilters.addEventListener('click', resetAll);
  el.emptyReset.addEventListener('click', resetAll);

  el.chartMetric.addEventListener('click', () => {
    chartState.metric = chartState.metric === 'count' ? 'area' : 'count';
    el.chartMetric.textContent =
      chartState.metric === 'count' ? 'حسب العدد' : 'حسب المساحة';
    applyFilters({ fit: false });
  });
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// --- init ------------------------------------------------------------------

async function init() {
  try {
    ({ plots, meta } = await loadData());
  } catch (error) {
    console.error('Failed to load plot data:', error);
    setStatus(el.status, `تعذّر تحميل بيانات الأراضي: ${error.message}`, true);
    return;
  }

  el.totalPlots.textContent = String(meta.totalPlots);

  // An explicit "الكل" card: previously the only way to clear a rent filter was
  // to click the active card a second time, which nothing communicated.
  const cards = [
    { key: '', label: 'الكل', count: meta.totalPlots, color: '#64748b' },
    ...meta.rentSummary,
  ];
  renderCards(el.cardsGrid, cards, selectRent);
  renderLegend(el.legend, meta.rentSummary);

  // Populate once without counts so URL values can be validated against them;
  // applyFilters() immediately repopulates with live counts.
  populateSelect(el.district, meta.districts);
  populateSelect(el.mainActivity, meta.mainActivities);
  populateSelect(el.subActivity, meta.subActivities);

  const { min, max } = meta.areaRange;
  el.areaMinLabel.textContent = min.toFixed(2);
  el.areaMaxLabel.textContent = max.toFixed(2);
  for (const input of [el.minArea, el.maxArea]) {
    input.min = Math.floor(min);
    input.max = Math.ceil(max);
  }

  suppressUrlSync = true;
  readUrlIntoForm();
  suppressUrlSync = false;

  wirePanels();
  wireForm();

  setStatus(el.status, null);
  console.info(
    `Loaded ${plots.length} plots (${meta.unmappedCount} without geometry, not drawable).`
  );

  // The map loads last and its failure is non-fatal: a missing or rejected API
  // key still leaves the dashboard, filters, chart and counts usable.
  const config = window.APP_CONFIG ?? {};
  try {
    await loadGoogleMaps(config.googleMapsApiKey, (message) => {
      console.error('Google Maps auth failure:', message);
      setStatus(el.status, message, true);
    });
    initMap(document.getElementById('map'), config.map);
    mapReady = true;
  } catch (error) {
    console.error('Map unavailable:', error);
    setStatus(el.status, error.message, true);
  }

  applyFilters();
}

init();
