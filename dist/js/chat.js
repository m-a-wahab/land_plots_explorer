/**
 * AI chat assistant (bottom-left). Lets the investor ask about plots in natural
 * language and drive the map. The LLM call is proxied through /api/chat (which
 * holds the OpenRouter key); the TOOLS run here in the browser, against the data
 * that is already loaded, reusing the exact same filter/analytics logic as the UI.
 *
 * Flow: user text -> POST /api/chat -> assistant turn. If it contains tool_calls,
 * we execute them locally, append the results, and POST again, until the model
 * returns a plain-text answer. The proxy is stateless; we send the full history.
 */

import { loadData } from './data.js';
import { filterPlots, groupByField } from './filters.js';
import { setFilters, resetFilters } from './app.js';
import { focusPlot } from './map.js';

const MAX_TOOL_ROUNDS = 6; // guard against a tool-call loop that never settles

let plots = [];
let meta = null;

/** History sent to the proxy each turn — user/assistant/tool messages only.
 *  The system prompt is added server-side, so it is never duplicated here. */
const history = [];

// --- data ------------------------------------------------------------------

async function ensureData() {
  if (meta) return;
  ({ plots, meta } = await loadData()); // cached; the same objects app.js uses
}

/** The exact category vocabulary the model must quote — sent with every request. */
function facets() {
  return {
    rentSummary: meta.rentSummary,
    districts: meta.districts,
    mainActivities: meta.mainActivities,
    subActivities: meta.subActivities,
    areaRange: meta.areaRange,
  };
}

const rentLabel = (key) =>
  meta.rentSummary.find((r) => r.key === (key ?? ''))?.label || 'غير محدد';

// --- tools (executed locally) ----------------------------------------------

/** Keeps only the recognised filter keys from a tool's arguments. */
function pickCriteria(args = {}) {
  const keys = ['rentStatus', 'disName', 'mainActivity', 'subActivity', 'minArea', 'maxArea'];
  const out = {};
  for (const k of keys) if (k in args) out[k] = args[k];
  return out;
}

/** A compact, model-friendly summary of the plots matching `criteria`. */
function summarise(criteria) {
  const results = filterPlots(plots, criteria);

  const byRent = {};
  let totalArea = 0;
  for (const p of results) {
    const label = rentLabel(p.rent_1);
    byRent[label] = (byRent[label] ?? 0) + 1;
    if (p.Shape_Area > 0) totalArea += p.Shape_Area; // skip the 2 negative-area anomalies
  }

  const top = (field) =>
    groupByField(results, field).slice(0, 5).map((g) => ({ value: g.value, count: g.total }));

  return {
    count: results.length,
    byRent,
    totalAreaSqm: Math.round(totalArea),
    topDistricts: top('dis_nam_1'),
    topSubActivities: top('sub_acti_1'),
  };
}

const TOOL_IMPL = {
  apply_filter(args) {
    const { applied, rejected, count } = setFilters(pickCriteria(args));
    const out = { count, applied };
    if (Object.keys(rejected).length) out.rejected = rejected; // unknown values, so the model can correct
    return out;
  },
  query_plots(args) {
    return summarise(pickCriteria(args));
  },
  reset_filters() {
    return resetFilters();
  },
  focus_plot(args) {
    const id = Number(args?.objectid);
    const plot = plots.find((p) => p.OBJECTID === id);
    if (!plot) return { error: `لا توجد قطعة بالرقم ${args?.objectid}` };
    const ok = focusPlot(plot);
    return {
      found: true,
      opened: ok,
      OBJECTID: plot.OBJECTID,
      district: plot.dis_nam_1,
      status: rentLabel(plot.rent_1),
      mainActivity: plot.main_act_1,
      subActivity: plot.sub_acti_1,
      areaSqm: typeof plot.Shape_Area === 'number' ? Math.round(plot.Shape_Area) : null,
    };
  },
};

function runTool(toolCall) {
  const name = toolCall.function?.name;
  let args = {};
  try {
    args = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch {
    return { error: 'Could not parse tool arguments.' };
  }
  const impl = TOOL_IMPL[name];
  if (!impl) return { error: `Unknown tool: ${name}` };
  try {
    return impl(args);
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

// --- proxy call ------------------------------------------------------------

async function callProxy() {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: history, facets: facets() }),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`الخادم أعاد استجابة غير صالحة (${res.status}).`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || `تعذّر الاتصال بالمساعد (${res.status}).`);
  }
  return data.message; // { role, content, tool_calls? }
}

// --- UI --------------------------------------------------------------------

const ui = {};

function buildWidget() {
  const root = document.createElement('div');
  root.className = 'chat-widget';
  root.dir = 'rtl';

  // Launcher
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'chat-launcher';
  launcher.setAttribute('aria-label', 'فتح المساعد الذكي');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.textContent = '💬';

  // Panel
  const panel = document.createElement('div');
  panel.className = 'chat-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'المساعد الذكي');

  const header = document.createElement('div');
  header.className = 'chat-header';
  const title = document.createElement('span');
  title.className = 'chat-title';
  title.textContent = 'المساعد الذكي';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'chat-close';
  close.setAttribute('aria-label', 'إغلاق');
  close.textContent = '×';
  header.append(title, close);

  const log = document.createElement('div');
  log.className = 'chat-log';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');

  const form = document.createElement('form');
  form.className = 'chat-input-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'chat-input';
  input.placeholder = 'اسأل عن الأراضي… مثال: اعرض المستودعات أكبر من ٥٠٠٠ متر';
  input.autocomplete = 'off';
  const send = document.createElement('button');
  send.type = 'submit';
  send.className = 'chat-send';
  send.setAttribute('aria-label', 'إرسال');
  send.textContent = '↑';
  form.append(input, send);

  panel.append(header, log, form);
  root.append(panel, launcher);
  document.body.appendChild(root);

  Object.assign(ui, { root, launcher, panel, close, log, form, input, send });
}

function openPanel(open) {
  ui.panel.hidden = !open;
  ui.launcher.setAttribute('aria-expanded', String(open));
  ui.root.classList.toggle('open', open);
  if (open) {
    if (!ui.log.childElementCount) {
      addBubble('assistant',
        'مرحباً! اسألني عن الأراضي حسب النشاط أو المساحة أو الحي، أو اطلب مني عرضها على الخريطة.');
    }
    ui.input.focus();
  }
}

function addBubble(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `chat-msg chat-msg-${role}`;
  bubble.textContent = text; // textContent — never inject HTML from the model
  ui.log.appendChild(bubble);
  ui.log.scrollTop = ui.log.scrollHeight;
  return bubble;
}

function addToolNote(text) {
  const note = document.createElement('div');
  note.className = 'chat-tool-note';
  note.textContent = text;
  ui.log.appendChild(note);
  ui.log.scrollTop = ui.log.scrollHeight;
}

let typingEl = null;
function setTyping(on) {
  if (on && !typingEl) {
    typingEl = document.createElement('div');
    typingEl.className = 'chat-msg chat-msg-assistant chat-typing';
    typingEl.textContent = '…';
    ui.log.appendChild(typingEl);
    ui.log.scrollTop = ui.log.scrollHeight;
  } else if (!on && typingEl) {
    typingEl.remove();
    typingEl = null;
  }
}

const TOOL_LABEL = {
  apply_filter: 'تطبيق فلتر على الخريطة',
  query_plots: 'تحليل البيانات',
  reset_filters: 'إعادة تعيين الفلاتر',
  focus_plot: 'عرض قطعة محددة',
};

// --- conversation ----------------------------------------------------------

let busy = false;

async function send(text) {
  if (busy) return;
  busy = true;
  ui.send.disabled = true;

  addBubble('user', text);
  history.push({ role: 'user', content: text });
  setTyping(true);

  try {
    await ensureData();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const message = await callProxy();
      // Store the assistant turn verbatim (tool_calls must survive the round trip).
      history.push(message);

      if (message.tool_calls?.length) {
        for (const call of message.tool_calls) {
          addToolNote('🔧 ' + (TOOL_LABEL[call.function?.name] || call.function?.name));
          const result = runTool(call);
          history.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
        continue; // let the model read the tool results and respond
      }

      setTyping(false);
      if (message.content) addBubble('assistant', message.content);
      return;
    }

    setTyping(false);
    addBubble('assistant', 'تعذّر إكمال الطلب بعد عدة محاولات. حاول إعادة صياغة السؤال.');
  } catch (err) {
    setTyping(false);
    addBubble('assistant', `⚠️ ${err.message}`);
  } finally {
    busy = false;
    ui.send.disabled = false;
    ui.input.focus();
  }
}

// --- init ------------------------------------------------------------------

function init() {
  buildWidget();
  ui.launcher.addEventListener('click', () => openPanel(ui.panel.hidden));
  ui.close.addEventListener('click', () => openPanel(false));
  ui.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = ui.input.value.trim();
    if (!text) return;
    ui.input.value = '';
    send(text);
  });

  // Warm the data cache in the background so the first question is instant.
  ensureData().catch(() => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
