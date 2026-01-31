import os
from typing import Optional

import requests
from dotenv import load_dotenv, find_dotenv
from fastapi import APIRouter, HTTPException, Query

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


@router.get("/recommended")
def get_recommended_news(
    q: Optional[str] = Query(None, description="Search query to override defaults"),
    page: int = Query(1, ge=1, le=10),
    page_size: int = Query(20, ge=1, le=100),
    language: str = Query("en"),
):
    api_key = os.getenv("NEWS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="NEWS_API_KEY is not set")

    params = {
        "q": q or DEFAULT_QUERY,
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
        "totalResults": data.get("totalResults", 0),
        "articles": normalized,
    }
