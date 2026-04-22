import copy
import traceback
import geocoder
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from geopy.geocoders import Nominatim
from typing import List, Optional

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
    history: Optional[List[dict]] = []


"""Returns location string based on network AP's ip address"""
@app.get("/guess-location")
async def guess_location():
    try:
        g = geocoder.ip("me") # "My" (current connected network's) IP address
        if not g.latlng: # Couldn't find lat, lon based on IP
            return {"location": "Storrs, CT"}
        nom = Nominatim(user_agent="disaster-routing")
        loc = nom.reverse(g.latlng, timeout=5)
        if not loc: # Couldn't get location name from lat,lon
            return {"location": "Storrs, CT"}
        address = loc.raw["address"]
        area_type = "city" if "city" in address else "town" if "town" in address else "county"
        road = address.get("road", "")
        area = address.get(area_type, "Storrs")
        state = address.get("state", "CT")
        # Return simplified location name
        return {"location": f"{road}, {area}, {state}" if road else f"{area}, {state}"}
    except Exception: # Failsafe, most likely location for someone to be using this prototype
        return {"location": "Storrs, CT"}


@app.post("/run-query")
async def run_query(req: QueryRequest):
    try:
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
            return {"response": response_text, "raw_data": {}}

        # Strip path_coordinates before sending to LLM — saves tokens and improves response quality
        llm_context = copy.deepcopy(context)
        if "shelters" in llm_context:
            for shelter in llm_context["shelters"]:
                if shelter.get("route") and "path_coordinates" in shelter["route"]:
                    del shelter["route"]["path_coordinates"]

        response_text = generate_response(req.query, llm_context)

        # raw_data keeps full coordinates for the map
        return {"response": response_text, "raw_data": context}

    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}