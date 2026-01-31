# hotel_recommendations.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging
import os
import re

# Gemini wrapper (mock or real) - see gemini/call_gemini.py
from gemini.call_gemini import generate_response

router = APIRouter()
logger = logging.getLogger("hotel_recommendations")
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))

# -----------------------
# Pydantic models
# -----------------------
class HotelRecommendationRequest(BaseModel):
    room_code: str
    location: str
    lat: float
    lng: float


class HotelRecommendationResponse(BaseModel):
    recommendation: str


# -----------------------
# Helper functions
# -----------------------
def sanitize_text(text: str) -> str:
    """Remove control characters and normalize whitespace."""
    if not isinstance(text, str):
        text = str(text)
    # Remove control characters except newlines and tabs
    text = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]', '', text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


# -----------------------
# Endpoint
# -----------------------
@router.post("/hotel-recommendations", response_model=HotelRecommendationResponse)
async def hotel_recommendations(req: HotelRecommendationRequest):
    """
    Generate hotel recommendations for a specific location using Gemini.
    
    Accepts:
      - room_code: Room code for context
      - location: Location name (e.g., "Shinjuku, Tokyo, Japan")
      - lat: Latitude
      - lng: Longitude
    
    Returns:
      - recommendation: Hotel recommendations text
    """
    logger.info("=" * 80)
    logger.info("🏨 HOTEL RECOMMENDATIONS ENDPOINT CALLED")
    logger.info("Room code: %s", req.room_code)
    logger.info("Location: %s", req.location)
    logger.info("Coordinates: %f, %f", req.lat, req.lng)
    logger.info("=" * 80)
    
    # Build system prompt for hotel recommendations
    location_sanitized = sanitize_text(req.location)
    
    system_prompt = (
        "You are a helpful travel advisor specializing in hotel recommendations. "
        "Generate a concise hotel itinerary with 3-5 recommended hotels for the specified location. "
        "For each hotel, include: hotel name, brief description (1-2 sentences), and approximate price range or budget category. "
        "Focus on hotels that are well-located, have good reviews, and offer good value. "
        "Format the response as a clear, readable list. "
        "Keep the total response under 200 words. "
        "Do NOT include bullet points or emojis - use plain text with line breaks between hotels."
    )
    
    user_prompt = (
        f"Please provide hotel recommendations for {location_sanitized} "
        f"(coordinates: {req.lat}, {req.lng}). "
        "Include 3-5 hotels with names, brief descriptions, and price ranges."
    )
    
    logger.debug("System prompt length=%d", len(system_prompt))
    logger.debug("User prompt length=%d", len(user_prompt))
    
    # Call Gemini wrapper
    try:
        logger.info("Calling generate_response (Gemini wrapper) for hotel recommendations...")
        recommendation = generate_response(system_prompt=system_prompt, prompt=user_prompt)
        if isinstance(recommendation, str):
            recommendation = sanitize_text(recommendation)
        logger.info("Received hotel recommendation (len=%d)", len(recommendation) if recommendation else 0)
        return HotelRecommendationResponse(recommendation=recommendation)
    except Exception as e:
        logger.exception("Error generating hotel recommendation: %s", e)
        raise HTTPException(status_code=502, detail="Failed to generate hotel recommendation from Gemini.")

