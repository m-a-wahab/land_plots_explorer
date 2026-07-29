/**
 * Renders the chrome that Razor used to emit server-side: the summary cards
 * (@foreach over ViewBag.RentSummary) and the three filter dropdowns
 * (ViewBag.Districts / MainActivities / SubActivities).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(width, height, pathSpecs) {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('width', width);
  el.setAttribute('height', height);
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '2');
  for (const [tag, attrs] of pathSpecs) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v);
    el.appendChild(child);
  }
  return el;
}

/**
 * Builds one summary card. Uses DOM construction rather than innerHTML: the
 * labels are Arabic data values, and the old Razor template passed them through
 * Html.Raw into a JS string literal, which would break on an apostrophe.
 */
function buildCard(item, onSelect) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'summary-card';
  button.style.setProperty('--card-color', item.color);
  button.dataset.rentKey = item.key;

  const icon = document.createElement('div');
  icon.className = 'card-icon';
  icon.appendChild(svg(28, 28, [
    ['path', { d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
    ['polyline', { points: '9 22 9 12 15 12 15 22' }],
  ]));

  const content = document.createElement('div');
  content.className = 'card-content';

  const label = document.createElement('span');
  label.className = 'card-label';
  label.textContent = item.label;

  const count = document.createElement('span');
  count.className = 'card-count';
  // Plain Western digits, matching Razor's @item.Count. Switching to
  // toLocaleString('ar-EG') would render ٤٬٥٩٢ instead — a deliberate choice to
  // make, not a formatting detail to change in passing.
  count.textContent = String(item.count);

  const unit = document.createElement('span');
  unit.className = 'card-unit';
  unit.textContent = 'قطعة';

  content.append(label, count, unit);

  const arrow = document.createElement('div');
  arrow.className = 'card-arrow';
  arrow.appendChild(svg(20, 20, [['polyline', { points: '9 18 15 12 9 6' }]]));

  button.append(icon, content, arrow);
  button.addEventListener('click', () => onSelect(item.key, button));
  return button;
}

export function renderCards(container, rentSummary, onSelect) {
  container.replaceChildren(...rentSummary.map((item) => buildCard(item, onSelect)));
}

export function setActiveCard(container, rentKey) {
  for (const card of container.querySelectorAll('.summary-card')) {
    // '' is a real selection now — it is the "الكل" card — so compare directly
    // rather than treating the empty key as "nothing active".
    const active = card.dataset.rentKey === rentKey;
    card.classList.toggle('active', active);
    card.setAttribute('aria-pressed', String(active));
  }
}

/**
 * Populates a <select> with per-option result counts, disabling options that
 * would return nothing under the other active filters.
 *
 * Without this, 92.7% of the district × sub-activity combinations the dropdowns
 * offer return zero results — the UI advertises 2613 pairings of which 2422 are
 * dead ends, and the only way to discover that is to try them.
 *
 * The current selection is always kept selectable even at zero, so a user can
 * never be trapped in a value they cannot see or change.
 *
 * @param {HTMLSelectElement} select
 * @param {string[]} values          every possible value for this facet
 * @param {Map<string, number>} counts reachable counts under the other filters
 */
export function populateSelect(select, values, counts = null) {
  const current = select.value;

  const options = values.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    if (counts) {
      const count = counts.get(value) ?? 0;
      option.textContent = `${value} (${count})`;
      option.disabled = count === 0 && value !== current;
      option.classList.toggle('is-empty', count === 0);
    } else {
      option.textContent = value;
    }
    return option;
  });

  // Keep option[0] ("الكل"), replace the rest.
  select.replaceChildren(select.options[0], ...options);
  select.value = current;
}

/** Legend for the polygon colours, so they stay decodable when the dashboard
 *  (the only other place the colours are explained) is collapsed. */
export function renderLegend(container, rentSummary) {
  const items = rentSummary.map((item) => {
    const row = document.createElement('span');
    row.className = 'legend-item';

    const swatch = document.createElement('i');
    swatch.className = 'legend-swatch';
    swatch.style.background = item.color;

    const label = document.createElement('span');
    label.textContent = item.label;

    row.append(swatch, label);
    return row;
  });
  container.replaceChildren(...items);
}

export function setStatus(el, message, isError = false) {
  if (!message) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('is-error', isError);
}
