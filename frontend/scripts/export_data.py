"""Export Database NBĐ xlsx -> data.json for the chatbot (pricing_archive is intentionally excluded)."""
import sys, json, datetime as dt
import openpyxl

SHEETS = ["destinations", "media_assets", "services_pricing", "operation_hours", "activities", "faq",
          "knowledge_base", "itineraries", "maps_navigation", "travel_tips", "weather_info", "transportation",
          "photo_spots", "food_stay", "contact_info", "events_culture", "safety_emergency", "chatbot_intents",
          "chatbot_rules"]


def conv(v):
    if isinstance(v, dt.datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, dt.time):
        return v.strftime("%H:%M")
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
out = {}
for s in SHEETS:
    ws = wb[s]
    hdr = [c.value for c in ws[1]]
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] in (None, ""):
            continue
        rows.append({h: conv(v) for h, v in zip(hdr, r) if h and v not in (None, "")})
    out[s] = rows
out["_meta"] = {"source_file": sys.argv[1].split("/")[-1], "exported": dt.date.today().isoformat()}
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
print({k: len(v) for k, v in out.items() if k != "_meta"})
