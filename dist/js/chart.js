/**
 * Sub-activity breakdown chart.
 *
 * A horizontal stacked bar chart, not a pie: sub_acti_1 has 39 categories after
 * variant normalisation, 25 of which hold 7 plots or fewer. As slices they would
 * be invisible; the distribution is severely long-tailed (top 5 = 81.5%, top 10 =
 * 92.9%, ranks 11-39 = 5.7% combined).
 *
 * Horizontal because the category labels are long Arabic phrases — vertical bars
 * would force rotated, unreadable text.
 *
 * Stacked by rent status because that is where the signal is: مستودعات is 94%
 * rented and مصانع 95%, while استراحات is 82% vacant and منجرة 100% vacant. A
 * plain count chart only says "ورش is biggest".
 *
 * Built with plain DOM — twelve bars do not justify a charting library, and a CDN
 * dependency would be the only external runtime dependency in the project.
 */

import { groupByField } from './filters.js';

const TOP_N = 10;
const OTHER_LABEL = 'أخرى';
const UNKNOWN_LABEL = '(غير محدد)';

/** Rent keys in stacking order, with the palette used everywhere else. */
const RENT_ORDER = [
  { key: 'مؤجر', label: 'مستثمر', color: '#db0f0f' },
  { key: 'غير مؤجر', label: 'غير مستثمر', color: '#22c55e' },
  { key: 'قيد الطرح', label: 'قيد الطرح', color: '#1512c5' },
];

const formatArea = (m2) =>
  m2 >= 10000 ? `${(m2 / 10000).toFixed(1)} هكتار` : `${Math.round(m2)} م²`;

/**
 * Collapses ranks TOP_N+1.. into a single expandable "أخرى" row, so the tail is
 * summarised rather than silently dropped.
 */
function foldTail(groups, expanded) {
  if (groups.length <= TOP_N + 1 || expanded) return { rows: groups, tail: null };

  const head = groups.slice(0, TOP_N);
  const tail = groups.slice(TOP_N);
  const folded = {
    value: OTHER_LABEL,
    total: tail.reduce((s, g) => s + g.total, 0),
    area: tail.reduce((s, g) => s + g.area, 0),
    byRent: {},
    isTail: true,
    tailCount: tail.length,
  };
  for (const g of tail) {
    for (const [k, v] of Object.entries(g.byRent)) {
      folded.byRent[k] = (folded.byRent[k] ?? 0) + v;
    }
  }
  return { rows: [...head, folded], tail: folded };
}

function buildRow(group, maxValue, metric, onSelect) {
  const row = document.createElement('div');
  row.className = 'chart-row';

  const value = metric === 'area' ? group.area : group.total;
  const display = metric === 'area' ? formatArea(group.area) : String(group.total);

  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'chart-label';
  label.textContent = group.value;
  label.title = group.isTail
    ? `${group.tailCount} تصنيفات أخرى — اضغط للعرض`
    : `تصفية حسب: ${group.value}`;

  const track = document.createElement('div');
  track.className = 'chart-track';

  const bar = document.createElement('div');
  bar.className = 'chart-bar';
  bar.style.width = maxValue > 0 ? `${(value / maxValue) * 100}%` : '0';

  // Segments are proportional to plot COUNT even when the metric is area: a
  // per-segment area split is not tracked, and inventing one would misreport.
  for (const rent of RENT_ORDER) {
    const count = group.byRent[rent.key] ?? 0;
    if (!count) continue;
    const segment = document.createElement('div');
    segment.className = 'chart-segment';
    segment.style.background = rent.color;
    segment.style.flex = String(count);
    segment.title = `${rent.label}: ${count}`;
    bar.appendChild(segment);
  }

  const amount = document.createElement('span');
  amount.className = 'chart-value';
  amount.textContent = display;

  track.append(bar);
  row.append(label, track, amount);

  label.addEventListener('click', () => onSelect(group));
  return row;
}

/**
 * @param {HTMLElement} container
 * @param {Array<object>} plots         the CURRENTLY FILTERED plots, so the chart
 *                                      acts as a drill-down rather than a static
 *                                      summary
 * @param {object} options
 * @param {'count'|'area'} options.metric
 * @param {boolean} options.expanded    whether the tail is unfolded
 * @param {string} options.selected     currently filtered sub-activity, if any
 * @param {(value: string|null) => void} options.onSelect
 * @param {() => void} options.onExpand
 */
export function renderChart(container, plots, options) {
  const { metric, expanded, selected, onSelect, onExpand } = options;
  container.replaceChildren();

  const groups = groupByField(plots, 'sub_acti_1', UNKNOWN_LABEL);

  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chart-empty';
    empty.textContent = 'لا توجد بيانات لعرضها';
    container.appendChild(empty);
    return;
  }

  const { rows } = foldTail(groups, expanded);
  const maxValue = Math.max(...rows.map((g) => (metric === 'area' ? g.area : g.total)));

  for (const group of rows) {
    const row = buildRow(group, maxValue, metric, (g) => {
      if (g.isTail) return onExpand();
      // The unknown bucket is an absence of a value; there is nothing to filter to.
      if (g.value === UNKNOWN_LABEL) return;
      onSelect(g.value === selected ? null : g.value);
    });
    if (group.value === selected) row.classList.add('is-selected');
    if (group.value === UNKNOWN_LABEL) row.classList.add('is-unknown');
    container.appendChild(row);
  }

  if (expanded && groups.length > TOP_N + 1) {
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'chart-more';
    collapse.textContent = 'عرض أقل';
    collapse.addEventListener('click', onExpand);
    container.appendChild(collapse);
  }
}
