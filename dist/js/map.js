/**
 * Google Maps rendering. Ports initMap / renderPolygons / clearPolygons and the
 * info-window template from Views/Home/Index.cshtml:131-295.
 *
 * Two deliberate changes from the original:
 *
 *  1. Polygons are built once and toggled with setVisible(), rather than being
 *     destroyed and reconstructed on every filter change. The old clearPolygons()
 *     tore down and rebuilt up to ~4600 Polygon objects per interaction; now a
 *     filter is a visibility pass over existing objects.
 *
 *  2. Info-window content is built as DOM nodes instead of an interpolated HTML
 *     string. The original injected raw field values into innerHTML, including
 *     forusLink straight into an href.
 */

const RENT_COLORS = {
  'مؤجر': '#db0f0f',
  'غير مؤجر': '#22c55e',
  'تم احالة الاشراف للزراعة': '#f59e0b',
  'قيد الطرح': '#1512c5',
  '': '#6b7280',
};

const FALLBACK_COLOR = '#6b7280';

let map = null;
let infoWindow = null;

/** OBJECTID -> google.maps.Polygon[] (a plot may have several rings). */
const polygonsByPlot = new Map();

const colorFor = (rentStatus) => RENT_COLORS[rentStatus ?? ''] ?? FALLBACK_COLOR;

// --- Google Maps script loading -------------------------------------------

/**
 * @param {string} apiKey
 * @param {(message: string) => void} [onAuthFailure] called if Google rejects the
 *        key AFTER the script loads — a wrong, unbilled, or referrer-blocked key
 *        still resolves the callback below, then paints its own error over the
 *        map. Without gm_authFailure that failure is invisible to us.
 */
export function loadGoogleMaps(apiKey, onAuthFailure) {
  if (!apiKey || apiKey === 'YOUR_API_KEY') {
    return Promise.reject(
      new Error('لم يتم ضبط مفتاح خرائط Google. حرّر js/config.js وأضف المفتاح.')
    );
  }

  window.gm_authFailure = () => {
    onAuthFailure?.(
      'تعذّر التحقق من مفتاح خرائط Google. تأكد من قيود الإحالة (HTTP referrer) ' +
      'ومن تفعيل الفوترة و Maps JavaScript API.'
    );
  };

  return new Promise((resolve, reject) => {
    const callbackName = '__initGoogleMaps';
    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.google.maps);
    };

    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&callback=${callbackName}&language=ar&region=SA`;
    script.async = true;
    script.onerror = () => reject(new Error('تعذّر تحميل خرائط Google.'));
    document.head.appendChild(script);
  });
}

export function initMap(container, { center, zoom }) {
  map = new google.maps.Map(container, {
    zoom,
    center,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      position: google.maps.ControlPosition.TOP_LEFT,
    },
  });
  infoWindow = new google.maps.InfoWindow();
  return map;
}

// --- Info window -----------------------------------------------------------

function formatEpochDate(ms) {
  if (!ms) return '-';
  return new Date(ms).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function row(label, value) {
  const tr = document.createElement('tr');
  const th = document.createElement('td');
  const strong = document.createElement('strong');
  strong.textContent = label;
  th.appendChild(strong);
  const td = document.createElement('td');
  td.textContent = value ?? '-';
  tr.append(th, td);
  return tr;
}

function sectionRow(title, color) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 2;
  td.textContent = title;
  td.style.cssText =
    `background:${color}20;font-weight:bold;padding:6px 8px;border-radius:4px;`;
  tr.appendChild(td);
  return tr;
}

/** Only http/https survive — a javascript: or data: URL in the source data
 *  would otherwise become a live link in the info window. */
function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, location.href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function buildInfoContent(plot) {
  const wrapper = document.createElement('div');
  wrapper.className = 'info-window';
  wrapper.dir = 'rtl';

  const heading = document.createElement('h3');
  heading.textContent = 'قطعة أرض';
  wrapper.appendChild(heading);

  const table = document.createElement('table');

  // Shown for all plots. The .NET template replaced this block wholesale for
  // قيد الطرح records, dropping رقم القطعة / الحي / الحالة / المساحة / ملاحظات;
  // CLAUDE.md specifies the tender block as an *additional* section, so the
  // common fields are kept here for every plot.
  table.append(
    row('رقم القطعة:', plot.OBJECTID),
    row('الحي:', plot.dis_nam_1),
    row('رقم المخطط:', plot.PLAN_NUM_1),
    row('الحالة:', plot.rent_1 ?? 'غير محدد'),
    row('النشاط الرئيسي:', plot.main_act_1),
    row('النشاط الفرعي:', plot.sub_acti_1),
    row('الموقع:', plot.location_1),
    row('المساحة:', typeof plot.Shape_Area === 'number'
      ? `${plot.Shape_Area.toFixed(2)} م²`
      : '-'),
  );

  // Shown only when there is something to show. 978 plots carry real notes; the
  // other 3614 held a placeholder " " in the source and would render an empty
  // row, which is why this was previously switched off wholesale.
  if (plot.notes_1) table.append(row('ملاحظات:', plot.notes_1));

  if (plot.rent_1 === 'قيد الطرح') {
    table.append(
      sectionRow('تفاصيل الفرصة', RENT_COLORS['قيد الطرح']),
      row('اسم الموقع:', plot.name),
      row('النشاط:', plot.activity),
      row('المساحة المطروحة:', typeof plot.area === 'number'
        ? `${plot.area.toFixed(2)} م²`
        : '-'),
      // The .NET template labels this سعر كراسة الشروط while CLAUDE.md calls it
      // سعر الدلو — a literal reading of "buckletPrice". The template's label is
      // the one that matches the business meaning, so it is kept.
      row('سعر كراسة الشروط:', typeof plot.buckletPrice === 'number'
        ? `${plot.buckletPrice.toLocaleString('ar-SA')} ريال`
        : '-'),
      row('مدة العقد:', plot.contractPeriod),
      row('رقم الفرصة:', plot.forsaNumber),
      row('تاريخ الإعلان:', formatEpochDate(plot.advertiseDate)),
      row('تاريخ فتح المظاريف:', formatEpochDate(plot.openEnvelopesDate))
    );

    const href = safeHttpUrl(plot.forusLink);
    if (href) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.style.textAlign = 'center';
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'رابط فرصة فرص';
      link.style.cssText = `color:${RENT_COLORS['قيد الطرح']};text-decoration:underline`;
      td.appendChild(link);
      tr.appendChild(td);
      table.appendChild(tr);
    }
  }

  wrapper.appendChild(table);
  return wrapper;
}

// --- Polygons --------------------------------------------------------------

function buildPolygons(plot) {
  const color = colorFor(plot.rent_1);

  return plot.rings.map((ring) => {
    const polygon = new google.maps.Polygon({
      paths: ring.map(([lng, lat]) => ({ lat, lng })),
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.35,
      visible: false,
    });

    polygon.addListener('click', (event) => {
      infoWindow.setContent(buildInfoContent(plot));
      infoWindow.setPosition(event.latLng);
      infoWindow.open(map);
    });

    polygon.setMap(map);
    return polygon;
  });
}

/**
 * Renders exactly the given plots. Polygons are constructed on first sight and
 * reused thereafter, so repeated filtering costs a visibility toggle rather than
 * a full teardown.
 *
 * @returns {{drawn: number, skipped: number}} skipped = records with no geometry
 */
/**
 * Moves the viewport to enclose the given plots.
 *
 * Without this a filter can appear broken: only 45% of plots fall inside the
 * default viewport, and selecting قيد الطرح reports 44 results while just 11 of
 * them are on screen.
 *
 * maxZoom stops a single-plot result from zooming to street level, where there is
 * no surrounding context to orient by.
 */
export function fitToPlots(plots, { maxZoom = 17 } = {}) {
  if (!map) return false;

  const bounds = new google.maps.LatLngBounds();
  let any = false;

  for (const plot of plots) {
    for (const ring of plot.rings ?? []) {
      for (const [lng, lat] of ring) {
        bounds.extend({ lat, lng });
        any = true;
      }
    }
  }

  if (!any) return false;

  const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
    if (map.getZoom() > maxZoom) map.setZoom(maxZoom);
  });
  map.fitBounds(bounds, 32);
  // Guard against 'idle' never firing (e.g. bounds identical to current view).
  setTimeout(() => google.maps.event.removeListener(listener), 2000);
  return true;
}

/** Returns the map to the configured default framing (used after a full reset). */
export function resetView({ center, zoom } = {}) {
  if (!map || !center) return;
  map.setCenter(center);
  map.setZoom(zoom);
}

/**
 * Opens the info window for a single plot and pans to it, without touching the
 * current filter/visibility state. Used by the chat assistant for "tell me about
 * plot X" answers. Uses the same buildInfoContent() as a polygon click, so the
 * tender section appears for قيد الطرح plots too.
 *
 * @returns {boolean} false if the plot has no position to anchor to.
 */
export function focusPlot(plot) {
  if (!map || !infoWindow || !plot) return false;

  let position = null;
  if (typeof plot.CenterLat === 'number' && typeof plot.CenterLng === 'number') {
    position = { lat: plot.CenterLat, lng: plot.CenterLng };
  } else {
    const first = plot.rings?.[0]?.[0];
    if (first) position = { lat: first[1], lng: first[0] };
  }
  if (!position) return false;

  infoWindow.setContent(buildInfoContent(plot));
  infoWindow.setPosition(position);
  infoWindow.open(map);
  if (plot.rings?.length) fitToPlots([plot]);
  else map.panTo(position);
  return true;
}

export function renderPlots(plots) {
  infoWindow?.close();

  const visibleIds = new Set();
  let drawn = 0;
  let skipped = 0;

  for (const plot of plots) {
    if (!plot.rings?.length) {
      skipped++;
      continue;
    }

    let polygons = polygonsByPlot.get(plot.OBJECTID);
    if (!polygons) {
      polygons = buildPolygons(plot);
      polygonsByPlot.set(plot.OBJECTID, polygons);
    }

    visibleIds.add(plot.OBJECTID);
    for (const polygon of polygons) polygon.setVisible(true);
    drawn++;
  }

  for (const [objectId, polygons] of polygonsByPlot) {
    if (visibleIds.has(objectId)) continue;
    for (const polygon of polygons) polygon.setVisible(false);
  }

  return { drawn, skipped };
}
