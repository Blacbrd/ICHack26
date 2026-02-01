# IMCharitable

IMCharitable is a volunteer collaboration platform that combines a 3D globe, real-time rooms, and AI-assisted matching to help people discover and coordinate global volunteering opportunities.

## What this project does

- Interactive 3D globe with country selection and mapped opportunities.
- Public and private rooms with live participant lists and planning flow.
- Real-time chat backed by Supabase.
- AI-assisted recommendations and ranking powered by Google Gemini.
- Opportunity sourcing via Idealist.org scraping and Supabase-backed charity data.
- Flight route visualization and nearest-airport lookup via Google Maps APIs.
- News feed tailored to disaster and humanitarian topics.
- Volunteer profiles with CV upload and availability calendar.

## Architecture overview

Frontend (React):
- Routing and pages for login, rooms, planning, chat, profiles, and charity tools.
- Globe visualization with Globe.gl and Three.js.
- Supabase client for auth, storage, and real-time data.
- FullCalendar for availability scheduling.

Backend (FastAPI):
- Gemini endpoints for recommendations, rankings, and conversions.
- Idealist scraping via Selenium and Chrome WebDriver.
- Google Maps endpoints for airports and flight routes.
- NewsAPI integration with optional Supabase-based user preferences.

## Key features by area

Rooms and planning
- Create/join rooms with a room code.
- Public room discovery, description, and host controls.
- Planning flow with country selection and opportunity voting.

Opportunities and AI
- Opportunities come from Supabase `charities` or fallback `client/public/opportunities.json`.
- Idealist.org link scraping and geo-conversion into `backend/opportunities.json`.
- Gemini-powered recommendation and ranking based on room chat context.

Profiles and availability
- Volunteer profile with CV upload to Supabase storage (`resumes` bucket).
- Availability slots stored in `availability_slots` with FullCalendar UI.

News and mapping
- NewsAPI search endpoint for humanitarian and disaster topics.
- Google Maps endpoints for nearest airport and great-circle flight routes.

## Tech stack

Frontend
- React 18, React Router
- Globe.gl, Three.js
- Supabase JS client
- FullCalendar

Backend
- FastAPI, Uvicorn
- Google Gemini (google-genai)
- Selenium + webdriver-manager
- NewsAPI
- Google Maps Places API
- Supabase Python client

## Requirements

- Node.js 18+
- Python 3.8+
- Chrome or Chromium installed for Selenium
- Supabase project with required tables and storage bucket
- API keys: Gemini, Google Maps, NewsAPI, Supabase

## Setup

1) Install frontend dependencies

```bash
cd client
npm install
```

2) Install backend dependencies

```bash
pip install -r requirements.txt
```

3) Create environment files

Backend `backend/.env` (example):

```bash
GEMINI_API_KEY=your-gemini-api-key
GMAPS_API_KEY=your-google-maps-api-key
NEWS_API_KEY=your-newsapi-key
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
# Optional
GEMINI_FAST_MODEL=gemini-2.5-flash
FRONTEND_ORIGINS=http://localhost:3000
HEADLESS=1
IDEALIST_MAX_PAGES=50
```

Frontend `client/.env` (example):

```bash
REACT_APP_SUPABASE_URL=your-supabase-url
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key
```

4) Supabase schema notes

At minimum, the UI expects the following tables:
- `profiles` (volunteer profiles, includes `username`, `cv_url`)
- `charities` (opportunities with `charity_id`, `name`, `lat`, `lon`, `country`, optional `causes`, `link`)
- `rooms` (room metadata, includes `room_code`, `master_id`, `selected_country`, `is_public`)
- `room_participants` (room membership)
- `messages` (chat history)
- `posts` (charity posts for the volunteer feed)
- `availability_slots` (see `SUPABASE_AVAILABILITY_SETUP.md`)

Storage:
- Bucket `resumes` for CV uploads.

5) Run the servers

Backend:
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:
```bash
cd client
npm start
```

Frontend runs on `http://localhost:3000` and the API docs are at `http://localhost:8000/docs`.

## API endpoints (backend)

- `GET /api/health`
- `POST /api/gemini/set_prompt`
- `GET /api/gemini/get_prompt`
- `GET /api/gemini/get_response`
- `GET /api/gemini/convert_idealist`
- `POST /api/gemini/recommend-opportunity`
- `POST /api/gemini/rank-opportunities`
- `POST /api/gemini/hotel-recommendations`
- `POST /api/gmap/find-nearest-airport`
- `POST /api/gmap/flight-route`
- `GET /api/news/recommended`
- `GET /api/idealist/search`

## Project structure

```
backend/                 FastAPI backend
  gemini/                Gemini wrapper and parsing helpers
  routers/               API route handlers
  utils/                 Utility helpers
  opportunities.json     Generated opportunity locations
client/                  React frontend
  public/                Static assets and sample data
  src/                   Components, pages, and helpers
requirements.txt         Python dependencies
SUPABASE_AVAILABILITY_SETUP.md
```

## Notes and troubleshooting

- Selenium requires Chrome or Chromium. The backend uses webdriver-manager to install a compatible driver.
- `client/public/opportunities.json` is used as a fallback when Supabase data is unavailable.
- If `/api/idealist/search` is slow, reduce `IDEALIST_MAX_PAGES` and keep `HEADLESS=1`.
- Availability calendar output format is documented in `client/AVAILABILITY_OUTPUT_EXAMPLE.md`.
