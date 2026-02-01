# rank_opportunities.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import os
import json
import re
import sys

from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

ENABLE_RANK_LOGGING = True

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "logs")
if ENABLE_RANK_LOGGING:
    os.makedirs(LOG_DIR, exist_ok=True)

try:
    from supabase import create_client
except Exception:
    create_client = None

from gemini.call_gemini import generate_response

router = APIRouter()


# Pydantic models
class OpportunityItem(BaseModel):
    id: str
    name: str
    link: Optional[str] = None
    country: Optional[str] = None


class RankRequest(BaseModel):
    room_code: str
    # Optional list of opportunity items (ids). If omitted or empty, the service will
    # fetch ALL charities from the database.
    opportunities: Optional[List[OpportunityItem]] = None
    returnTop5: bool = True


class RankResponse(BaseModel):
    ranked_ids: List[str]


# Lazy Supabase client - initialized on first use
_supabase_client = None


def get_supabase():
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    if not create_client:
        print("[rank] supabase package not available", file=sys.stderr, flush=True)
        return None
    url = os.getenv("SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
    )
    print(f"[rank] Initializing Supabase: URL={url}, KEY={'set' if key else 'NOT SET'}", file=sys.stderr, flush=True)
    if not url or not key:
        print("[rank] Missing SUPABASE_URL or key env vars!", file=sys.stderr, flush=True)
        return None
    try:
        _supabase_client = create_client(url, key)
        print("[rank] Supabase client OK", file=sys.stderr, flush=True)
        return _supabase_client
    except Exception as e:
        print(f"[rank] Supabase init failed: {e}", file=sys.stderr, flush=True)
        return None


def fetch_all_messages(room_code: str) -> str:
    """Fetch all chat messages for the room, excluding bot messages."""
    sb = get_supabase()
    if not sb:
        return ""
    try:
        res = (
            sb.table("messages")
            .select("message, created_at")
            .eq("room_code", room_code)
            .order("created_at", desc=False)
            .execute()
        )
        data = res.data if hasattr(res, "data") else None
        print(f"[rank] Fetched {len(data) if data else 0} messages for room {room_code}", file=sys.stderr, flush=True)
        if not data:
            return ""

        lines = []
        for row in data:
            text = (row.get("message") if isinstance(row, dict) else getattr(row, "message", "")) or ""
            if not text:
                continue
            trimmed = text.lstrip().lower()[:80]
            if "worldai recommendation" in trimmed:
                continue
            lines.append(text.strip())
        return "\n".join(lines)
    except Exception as e:
        print(f"[rank] Error fetching messages: {e}", file=sys.stderr, flush=True)
        return ""


def fetch_charities_from_db(filter_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Fetch charities from the Supabase 'charities' table.

    If filter_ids is provided, only returns rows whose charity_id is in filter_ids.
    Returns list of dicts with at least charity_id and name (and link/country if available).
    """
    sb = get_supabase()
    if not sb:
        return []
    try:
        # Select the columns we need. Adjust or add columns if required.
        res = sb.table("charities").select("charity_id, name, link, country").execute()
        data = res.data if hasattr(res, "data") else None
        if not data:
            return []
        if filter_ids:
            idset = set(map(str, filter_ids))
            data = [r for r in data if str(r.get("charity_id")) in idset]
        return data
    except Exception as e:
        print(f"[rank] Error fetching charities from DB: {e}", file=sys.stderr, flush=True)
        return []


@router.post("/rank-opportunities", response_model=RankResponse)
async def rank_opportunities(req: RankRequest):
    # We'll support two modes:
    # 1) If client provided a non-empty req.opportunities list, prefer that list but enrich
    #    with DB data when available (keeps compatibility with existing callers).
    # 2) If client did NOT provide opportunities (or provided empty list / None), fetch ALL charities from DB.

    chat_text = fetch_all_messages(req.room_code)

    # Build id -> title map from either provided opportunities or DB
    id_title_map: Dict[str, str] = {}
    id_link_map: Dict[str, Optional[str]] = {}
    id_country_map: Dict[str, Optional[str]] = {}

    provided_ids = []
    if req.opportunities:
        # Use provided list of opportunities, but attempt to fetch DB rows to get authoritative names/links
        provided_ids = [opp.id for opp in req.opportunities]
        db_rows = fetch_charities_from_db(filter_ids=provided_ids)
        db_map = {str(r.get("charity_id")): r for r in db_rows}
        for opp in req.opportunities:
            cid = str(opp.id)
            if cid in db_map:
                row = db_map[cid]
                id_title_map[cid] = row.get("name") or opp.name
                id_link_map[cid] = row.get("link") or opp.link
                id_country_map[cid] = row.get("country") or opp.country
            else:
                # Fallback to provided data
                id_title_map[cid] = opp.name
                id_link_map[cid] = opp.link
                id_country_map[cid] = opp.country

        all_ids = list(id_title_map.keys())
    else:
        # No opportunities provided by client: fetch all charities from DB and rank them.
        db_rows = fetch_charities_from_db(filter_ids=None)
        if not db_rows:
            raise HTTPException(status_code=500, detail="No opportunities provided and failed to fetch charities from database.")
        for r in db_rows:
            cid = str(r.get("charity_id"))
            id_title_map[cid] = r.get("name") or "(no name)"
            id_link_map[cid] = r.get("link")
            id_country_map[cid] = r.get("country")
        all_ids = list(id_title_map.keys())

    if not all_ids:
        raise HTTPException(status_code=400, detail="No opportunities available to rank.")

    if req.returnTop5:
        count_instruction = "Return ONLY the top 5 most relevant IDs."
        example = 'Example: ["opp-5", "opp-2", "opp-0", "opp-1", "opp-3"]'
    else:
        count_instruction = "Include ALL IDs."
        example = 'Example: ["opp-5", "opp-2", "opp-0", "opp-1", "opp-3", "opp-4"]'

    system_prompt = (
        "You are a ranking assistant for volunteering opportunities.\n"
        "You receive a JSON object mapping IDs to opportunity titles, and a chat conversation.\n\n"
        "YOUR TASK: Rank the IDs by how much the users would WANT to do them based on the chat.\n"
        "- Pay attention to SENTIMENT. If users say they LIKE something, rank matching opportunities HIGH.\n"
        "- If users say they HATE or DISLIKE something, rank matching opportunities LOW (at the bottom).\n"
        "- 'I love animals' = animal opportunities at TOP\n"
        "- 'I hate animals' = animal opportunities at BOTTOM\n"
        "- The order MUST change based on the chat - do NOT just return the original order\n"
        f"- {count_instruction}\n\n"
        f"RESPOND WITH ONLY a JSON array of IDs. No markdown, no explanation.\n"
        f"{example}"
    )

    # Build compact {id: title} map JSON for the assistant
    user_prompt = (
        f"OPPORTUNITIES:\n{json.dumps(id_title_map, ensure_ascii=False)}\n\n"
        f"CHAT CONVERSATION:\n{chat_text if chat_text else '(no messages yet)'}\n\n"
        f"Based on the chat conversation, rank opportunity IDs from most relevant to least relevant. "
        f"{count_instruction} Return ONLY a JSON array of IDs."
    )

    log_lines = []
    log_path = None
    if ENABLE_RANK_LOGGING:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        log_path = os.path.join(LOG_DIR, f"rank_{ts}.txt")
        log_lines = [
            f"TIMESTAMP: {datetime.now().isoformat()}",
            f"ROOM: {req.room_code}",
            f"OPPORTUNITY COUNT: {len(all_ids)}",
            "",
            "=== CHAT TEXT ===",
            chat_text if chat_text else "(empty)",
            "",
            "=== ID:TITLE MAP (first 10) ===",
            json.dumps(dict(list(id_title_map.items())[:10]), ensure_ascii=False, indent=2),
            "",
            "=== SYSTEM PROMPT ===",
            system_prompt,
            "",
            "=== USER PROMPT (first 500 chars) ===",
            user_prompt[:500],
            "",
        ]

    try:
        raw = generate_response(system_prompt=system_prompt, prompt=user_prompt)

        if ENABLE_RANK_LOGGING:
            log_lines.append("=== GEMINI RAW RESPONSE (first 500 chars) ===")
            log_lines.append((raw[:500] if raw else "(empty)"))
            log_lines.append("")

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        ranked_ids = json.loads(cleaned)

        if not isinstance(ranked_ids, list):
            if ENABLE_RANK_LOGGING:
                log_lines.append("ERROR: Gemini returned non-list")
                with open(log_path, "w") as f:
                    f.write("\n".join(log_lines))
            return RankResponse(ranked_ids=all_ids)

        # Validate: keep only IDs that exist in input (or DB)
        valid_ids = [str(rid) for rid in ranked_ids if str(rid) in all_ids]
        if req.returnTop5:
            valid_ids = valid_ids[:5]
        else:
            # Append any missing IDs at the end
            for oid in all_ids:
                if oid not in valid_ids:
                    valid_ids.append(oid)

        if ENABLE_RANK_LOGGING:
            log_lines.append("=== RESULT ===")
            log_lines.append(f"Top 10 ranked: {valid_ids[:10]}")
            log_lines.append(f"Original first 10: {all_ids[:10]}")
            log_lines.append(f"Order changed: {valid_ids[:10] != all_ids[:10]}")
            log_lines.append(f"Valid IDs returned: {len(valid_ids)} / {len(all_ids)}")
            with open(log_path, "w") as f:
                f.write("\n".join(log_lines))

        return RankResponse(ranked_ids=valid_ids)
    except json.JSONDecodeError:
        if ENABLE_RANK_LOGGING:
            log_lines.append("JSON PARSE ERROR")
            log_lines.append(f"Raw: {raw}" if raw else "(empty)")
            with open(log_path, "w") as f:
                f.write("\n".join(log_lines))
        return RankResponse(ranked_ids=all_ids)
    except Exception as e:
        if ENABLE_RANK_LOGGING:
            log_lines.append(f"EXCEPTION: {e}")
            with open(log_path, "w") as f:
                f.write("\n".join(log_lines))
        raise HTTPException(status_code=502, detail="Failed to rank opportunities via Gemini.")
