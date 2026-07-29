"""
Vercel Python serverless function: /api/chat

A thin, stateless relay between the browser chat widget and the LLM. It holds the
OpenRouter key (from the OPENROUTER_API_KEY environment variable) so the key never
ships to the browser, and it calls Cerebras via LiteLLM + OpenRouter exactly as
described in .claude/skills/cerebras/SKILL.md.

Request  (POST JSON):
    { "messages": [...],            # conversation so far (no system message)
      "facets":   { ... } }         # rentSummary / districts / activities / areaRange
                                    # from meta.json, so the model uses exact values

Response (JSON):
    { "message": { role, content, tool_calls? } }   # the next assistant turn
    { "error": "..." }                               # on failure (non-200)

The browser owns the tool *execution* (the 4592-record dataset already lives
there); this function only declares the tool contract and relays messages.
"""

import json
import os
from http.server import BaseHTTPRequestHandler

try:  # local dev convenience; Vercel injects env vars directly in production
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from litellm import completion

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

# Shared criteria properties, reused by apply_filter and query_plots.
_CRITERIA_PROPERTIES = {
    "rentStatus": {
        "type": "string",
        "description": "Rent status. Use the EXACT Arabic key from the provided "
                       "rent list (e.g. 'مؤجر', 'غير مؤجر', 'قيد الطرح'). '' clears it.",
    },
    "disName": {
        "type": "string",
        "description": "District. Must be an exact value from the provided districts list.",
    },
    "mainActivity": {
        "type": "string",
        "description": "Main activity. Exact value from the provided main activities list.",
    },
    "subActivity": {
        "type": "string",
        "description": "Sub activity. Exact value from the provided sub activities list.",
    },
    "minArea": {"type": "number", "description": "Minimum Shape_Area in m²."},
    "maxArea": {"type": "number", "description": "Maximum Shape_Area in m²."},
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "apply_filter",
            "description": (
                "Filter the plots shown ON THE MAP and zoom to them. Use for "
                "'show me', 'display', 'filter', 'highlight' requests. Only the "
                "fields you pass change; pass '' to clear a specific field. Returns "
                "the resulting plot count."
            ),
            "parameters": {
                "type": "object",
                "properties": _CRITERIA_PROPERTIES,
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_plots",
            "description": (
                "Compute statistics about plots matching the given criteria WITHOUT "
                "changing the map. Use for 'how many', 'what is', 'compare', "
                "'breakdown', 'total area' questions. Returns count, rent breakdown, "
                "total area, and the top districts / sub-activities."
            ),
            "parameters": {
                "type": "object",
                "properties": _CRITERIA_PROPERTIES,
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reset_filters",
            "description": "Clear ALL filters and return the map to its default view.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "focus_plot",
            "description": (
                "Open the details popup for one specific plot and pan the map to it. "
                "Use when the user names a specific plot number (OBJECTID)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "objectid": {"type": "integer", "description": "The plot's OBJECTID."}
                },
                "required": ["objectid"],
            },
        },
    },
]


def _facet_list(facets, key, limit=None):
    values = facets.get(key) or []
    if limit and len(values) > limit:
        return values  # districts/activities are short enough to include in full
    return values


def build_system_prompt(facets):
    """Inject the exact category vocabulary so the model never invents a value the
    filter cannot match."""
    rent = facets.get("rentSummary") or []
    rent_lines = "\n".join(
        f'  - key "{r.get("key")}" (shown to the user as "{r.get("label")}"), '
        f'{r.get("count")} plots'
        for r in rent
    )
    districts = "، ".join(_facet_list(facets, "districts"))
    main_acts = "، ".join(_facet_list(facets, "mainActivities"))
    sub_acts = "، ".join(_facet_list(facets, "subActivities"))
    area = facets.get("areaRange") or {}
    area_min = area.get("min")
    area_max = area.get("max")

    return (
        "You are an assistant embedded in an interactive map of land plots in the "
        "Northern Borders region of Saudi Arabia, used by an investor. You help them "
        "explore plots by activity, sub-activity, district, area, and rent (rental/"
        "investment) status, and you can drive the map on their behalf.\n\n"
        "LANGUAGE: Reply in the SAME language the user writes in (Arabic or English). "
        "Category values in the data are Arabic; quote them verbatim.\n\n"
        "TOOLS:\n"
        "  - apply_filter: for 'show/display/filter/highlight' — it changes the map.\n"
        "  - query_plots: for 'how many/what/compare/breakdown/total area' — it does NOT change the map.\n"
        "  - reset_filters: to clear everything.\n"
        "  - focus_plot: when the user names a specific plot (OBJECTID).\n"
        "Prefer a tool over guessing. After a tool returns, summarise the result in "
        "plain language (do not dump raw JSON). Areas are in square metres (م²).\n\n"
        "You MUST use these EXACT values when calling tools — never invent or "
        "translate them:\n\n"
        f"RENT STATUS (rent_1) keys:\n{rent_lines}\n\n"
        f"DISTRICTS (dis_nam_1):\n  {districts}\n\n"
        f"MAIN ACTIVITIES (main_act_1):\n  {main_acts}\n\n"
        f"SUB ACTIVITIES (sub_acti_1):\n  {sub_acts}\n\n"
        f"AREA RANGE (Shape_Area, m²): min ≈ {area_min}, max ≈ {area_max}.\n\n"
        "Plots with rent status 'قيد الطرح' (open for tender) additionally carry "
        "tender fields (opportunity name, tender area, brochure price, contract "
        "period, dates, a forus.sa link); focus_plot reveals them."
    )


def _send_json(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            if not os.environ.get("OPENROUTER_API_KEY"):
                return _send_json(self, 500, {"error": "OPENROUTER_API_KEY is not set on the server."})

            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            data = json.loads(raw or b"{}")

            messages = data.get("messages")
            if not isinstance(messages, list) or not messages:
                return _send_json(self, 400, {"error": "Request must include a non-empty 'messages' array."})

            facets = data.get("facets") or {}
            system = {"role": "system", "content": build_system_prompt(facets)}

            response = completion(
                model=MODEL,
                messages=[system, *messages],
                tools=TOOLS,
                tool_choice="auto",
                reasoning_effort="low",
                extra_body=EXTRA_BODY,
            )

            message = response.choices[0].message
            payload = message.model_dump() if hasattr(message, "model_dump") else dict(message)
            return _send_json(self, 200, {"message": payload})

        except Exception as exc:  # never leak a stack trace to the client
            return _send_json(self, 500, {"error": f"LLM request failed: {exc}"})
