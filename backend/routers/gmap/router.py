# backend/routers/gmap/router.py
import os
import math
import requests
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


def get_gmaps_api_key() -> str:
    """Get Google Maps API key from environment, raising error if not found."""
    api_key = os.environ.get("GMAPS_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GMAPS_API_KEY not found in environment variables. Please set it in your .env file."
        )
    return api_key


class LocationRequest(BaseModel):
    lat: float
    lng: float


class AirportResponse(BaseModel):
    place_id: str
    name: str
    lat: float
    lng: float
    address: str


class FlightRouteRequest(BaseModel):
    origin: LocationRequest
    destination: LocationRequest


class FlightRouteResponse(BaseModel):
    route: List[List[float]]  # List of [lat, lng] coordinates for the arc
    distance_km: float
    origin: LocationRequest
    destination: LocationRequest


def find_nearest_airport(lat: float, lng: float, radius_km: int = 50) -> Optional[AirportResponse]:
    """
    Find the nearest airport to the given coordinates using Google Places API.
    
    Args:
        lat: Latitude of the user's location
        lng: Longitude of the user's location
        radius_km: Search radius in kilometers (default 50km, max 50km for Places API)
    
    Returns:
        AirportResponse with airport details, or None if not found
    """
    # Convert radius from km to meters (Places API uses meters)
    radius_meters = min(radius_km * 1000, 50000)  # Cap at 50km (API limit)
    
    api_key = get_gmaps_api_key()
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{lat},{lng}",
        "radius": radius_meters,
        "type": "airport",
        "key": api_key,
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get("status") != "OK":
            # Try with a larger radius if no results
            if radius_km < 200:
                return find_nearest_airport(lat, lng, radius_km * 2)
            return None
        
        results = data.get("results", [])
        if not results:
            # Try with a larger radius if no results
            if radius_km < 200:
                return find_nearest_airport(lat, lng, radius_km * 2)
            return None
        
        # Get the first (nearest) airport
        airport = results[0]
        location = airport.get("geometry", {}).get("location", {})
        
        return AirportResponse(
            place_id=airport.get("place_id", ""),
            name=airport.get("name", "Unknown Airport"),
            lat=location.get("lat", lat),
            lng=location.get("lng", lng),
            address=airport.get("vicinity", airport.get("formatted_address", "Unknown Address"))
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error calling Google Places API: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing airport data: {str(e)}")


def calculate_great_circle_arc(
    lat1: float, lng1: float,
    lat2: float, lng2: float,
    num_points: int = 100
) -> List[List[float]]:
    """
    Calculate a great circle arc between two points on the Earth's surface.
    This creates a curved path that represents a flight route.
    
    Args:
        lat1, lng1: Origin coordinates (degrees)
        lat2, lng2: Destination coordinates (degrees)
        num_points: Number of points along the arc (default 100)
    
    Returns:
        List of [lat, lng] tuples representing the arc
    """
    # Convert to radians
    lat1_rad = math.radians(lat1)
    lng1_rad = math.radians(lng1)
    lat2_rad = math.radians(lat2)
    lng2_rad = math.radians(lng2)
    
    # Calculate angular distance using haversine formula
    d_lat = lat2_rad - lat1_rad
    d_lng = lng2_rad - lng1_rad
    
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(d_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    # Generate points along the great circle
    arc_points = []
    for i in range(num_points + 1):
        fraction = i / num_points
        
        # Spherical linear interpolation (slerp)
        A = math.sin((1 - fraction) * c) / math.sin(c)
        B = math.sin(fraction * c) / math.sin(c)
        
        x = (A * math.cos(lat1_rad) * math.cos(lng1_rad) +
             B * math.cos(lat2_rad) * math.cos(lng2_rad))
        y = (A * math.cos(lat1_rad) * math.sin(lng1_rad) +
             B * math.cos(lat2_rad) * math.sin(lng2_rad))
        z = A * math.sin(lat1_rad) + B * math.sin(lat2_rad)
        
        # Convert back to lat/lng
        lat = math.atan2(z, math.sqrt(x ** 2 + y ** 2))
        lng = math.atan2(y, x)
        
        arc_points.append([math.degrees(lat), math.degrees(lng)])
    
    return arc_points


def calculate_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the great circle distance between two points in kilometers.
    Uses the haversine formula.
    """
    R = 6371  # Earth's radius in kilometers
    
    lat1_rad = math.radians(lat1)
    lng1_rad = math.radians(lng1)
    lat2_rad = math.radians(lat2)
    lng2_rad = math.radians(lng2)
    
    d_lat = lat2_rad - lat1_rad
    d_lng = lng2_rad - lng1_rad
    
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(d_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


@router.post("/find-nearest-airport", response_model=AirportResponse)
def find_nearest_airport_endpoint(location: LocationRequest):
    """
    Find the nearest airport to the user's location.
    
    This endpoint uses the Google Places API to search for airports near the given coordinates.
    """
    airport = find_nearest_airport(location.lat, location.lng)
    
    if not airport:
        raise HTTPException(
            status_code=404,
            detail="No airport found within search radius. Try a different location."
        )
    
    return airport


@router.post("/flight-route", response_model=FlightRouteResponse)
def get_flight_route(request: FlightRouteRequest):
    """
    Calculate a flight route (great circle arc) between origin and destination.
    
    This endpoint calculates a curved path representing a flight route between two points.
    The route follows a great circle, which is the shortest path on a sphere.
    """
    origin = request.origin
    destination = request.destination
    
    # Calculate the great circle arc
    route = calculate_great_circle_arc(
        origin.lat, origin.lng,
        destination.lat, destination.lng
    )
    
    # Calculate distance
    distance_km = calculate_distance_km(
        origin.lat, origin.lng,
        destination.lat, destination.lng
    )
    
    return FlightRouteResponse(
        route=route,
        distance_km=round(distance_km, 2),
        origin=origin,
        destination=destination
    )

