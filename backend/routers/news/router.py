import os
from typing import Optional

import json
import requests
from dotenv import load_dotenv, find_dotenv
from fastapi import APIRouter, HTTPException, Query

try:
    from supabase import create_client  # supabase-py
except Exception:
    create_client = None

# Load env vars from .env if available
_dotenv_path = find_dotenv()
if _dotenv_path:
    load_dotenv(_dotenv_path)
else:
    load_dotenv()

router = APIRouter()

NEWS_API_BASE = "https://newsapi.org/v2"
DEFAULT_QUERY = (
    "earthquake OR flood OR hurricane OR wildfire OR tsunami OR volcano OR "
    "landslide OR drought OR disaster relief OR humanitarian crisis OR "
    "pandemic OR epidemic OR disease outbreak OR health emergency OR "
    "pharmaceutical OR pharma"
)

# Supabase (optional)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
)

PREFS_TABLE = os.getenv("NEWS_PREFS_TABLE", "user_preferences")
PREFS_USER_COLUMN = os.getenv("NEWS_PREFS_USER_COLUMN", "user_id")
PREFS_COLUMN = os.getenv("NEWS_PREFS_COLUMN", "preferences")

supabase = None
if create_client and SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception:
        supabase = None


def _normalize_preferences(raw):
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    if isinstance(raw, dict):
        for key in ("keywords", "tags", "topics", "preferences", "news_preferences", "interests"):
            if key in raw:
                return _normalize_preferences(raw.get(key))
        return []
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        try:
            parsed = json.loads(s)
            return _normalize_preferences(parsed)
        except Exception:
            return [p.strip() for p in s.replace(";", ",").split(",") if p.strip()]
    return [str(raw).strip()] if str(raw).strip() else []


def _fetch_user_preferences(user_id: str):
    if not supabase or not user_id:
        return []
    try:
        res = (
            supabase.table(PREFS_TABLE)
            .select(PREFS_COLUMN)
            .eq(PREFS_USER_COLUMN, user_id)
            .single()
            .execute()
        )
        data = None
        error = None
        if isinstance(res, dict):
            data = res.get("data")
            error = res.get("error")
        else:
            data = getattr(res, "data", None)
            error = getattr(res, "error", None)
        if error or not data:
            return []
        raw = data.get(PREFS_COLUMN) if isinstance(data, dict) else getattr(data, PREFS_COLUMN, None)
        return _normalize_preferences(raw)
    except Exception:
        return []


def _build_query(base_query: str, preferences):
    if not preferences:
        return base_query
    def _quote(term: str) -> str:
        t = term.strip()
        return f'"{t}"' if " " in t else t
    pref_clause = " OR ".join(_quote(p) for p in preferences if p.strip())
    if not pref_clause:
        return base_query
    return f"({base_query}) AND ({pref_clause})"


@router.get("/recommended")
def get_recommended_news(
    q: Optional[str] = Query(None, description="Search query to override defaults"),
    user_id: Optional[str] = Query(None, description="User id for preference-based filtering"),
    page: int = Query(1, ge=1, le=10),
    page_size: int = Query(20, ge=1, le=100),
    language: str = Query("en"),
):
    api_key = os.getenv("NEWS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="NEWS_API_KEY is not set")

    preferences = _fetch_user_preferences(user_id) if user_id else []
    query = _build_query(q or DEFAULT_QUERY, preferences)

    params = {
        "q": query,
        "language": language,
        "sortBy": "publishedAt",
        "pageSize": page_size,
        "page": page,
        "apiKey": api_key,
    }

    try:
        resp = requests.get(f"{NEWS_API_BASE}/everything", params=params, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"NewsAPI request failed: {exc}")

    data = resp.json()
    if data.get("status") != "ok":
        raise HTTPException(status_code=502, detail=data.get("message", "NewsAPI error"))

    articles = data.get("articles", [])
    normalized = [
        {
            "title": a.get("title"),
            "description": a.get("description"),
            "url": a.get("url"),
            "imageUrl": a.get("urlToImage"),
            "publishedAt": a.get("publishedAt"),
            "source": (a.get("source") or {}).get("name"),
            "author": a.get("author"),
        }
        for a in articles
    ]

    return {
        "query": params["q"],
        "preferences": preferences,
        "totalResults": data.get("totalResults", 0),
        "articles": normalized,
    }
