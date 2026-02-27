from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from geopy.geocoders import Nominatim

from src.orchestration import orchestration
from src.response_agent.response_agent import generate_response

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

geolocator = Nominatim(user_agent="disaster-routing")


class QueryRequest(BaseModel):
    query: str
    start_location: str = "Storrs, CT"
    mode: str = "Shelters nearby"


@app.post("/run-query")
async def run_query(req: QueryRequest):
    # try:
        # Geocode the start location string into lat/lon
        location = geolocator.geocode(req.start_location)
        if not location:
            return {"error": f"Could not geocode location: '{req.start_location}'. Try a more specific address."}

        lat, lon = location.latitude, location.longitude

        # orchestration.main() returns either:
        #   - none:          {}
        #   - shelter-only:  { input_location, nearest_shelters, ... }
        #   - with routing:  { user_location, shelters, ... }
        context = orchestration.main(req.query, lat, lon)

        if not context:
            response_text = generate_response(req.query, {})
    
            return {
                "response": response_text,
                "raw_data": {}
            }
            #return {"error": "No context returned from orchestration. The query may not require shelter or routing data."}

        response_text = generate_response(req.query, context)

        return {
            "response": response_text,
            "raw_data": context,
        }

    # except Exception as e:
        # return {"error": str(e)}