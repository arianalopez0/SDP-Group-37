import requests
import polyline
import json
import os
from shapely.geometry import LineString
import geopandas as gpd
from math import atan2, degrees, radians, sin, cos, sqrt

# OSRM and Valhalla as a backup
OSRM_URL = "http://router.project-osrm.org"
VALHALLA_URL = "https://valhalla1.openstreetmap.de/route"
CACHE_FILE = os.path.join(os.path.dirname(__file__), "route_cache.json")

# cache file to make the search faster
# (especially for Demo Day when the location will probably be the same)
def _load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _save_cache(cache: dict):
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(cache, f)
    except Exception as e:
        print(f"[cache] Failed to save: {e}")

def _cache_key(user_lat, user_lon, dest_lat, dest_lon) -> str:
    return f"{round(user_lat,4)},{round(user_lon,4)}->{round(dest_lat,4)},{round(dest_lon,4)}"


class RoutingAgent:

    # Direction functions
    @staticmethod
    def compute_bearing(lat1, lon1, lat2, lon2):
        angle = atan2((lon2 - lon1), (lat2 - lat1))
        bearing = degrees(angle)
        return (bearing + 360) % 360

    @staticmethod
    def turn_direction(b1, b2):
        diff = (b2 - b1 + 360) % 360
        if diff < 30 or diff > 330:
            return "Continue straight"
        elif diff < 180:
            return "Turn right"
        else:
            return "Turn left"

    # Attempt original OSRM configuration first 
    @staticmethod
    def _try_osrm(user_lat, user_lon, dest_lat, dest_lon):
        url = (
            f"{OSRM_URL}/route/v1/driving/"
            f"{user_lon},{user_lat};{dest_lon},{dest_lat}"
            "?overview=full&geometries=polyline&steps=true"
        )
        # Tets the request response
        r = requests.get(url, timeout=5)
        if r.status_code != 200:
            raise RuntimeError(f"OSRM error {r.status_code}: {r.text}")

        data = r.json()
        if "routes" not in data or not data["routes"]:
            raise RuntimeError("No routes returned from OSRM")

        route = data["routes"][0]
        path_coords = polyline.decode(route["geometry"])

        return {
            "distance_m": route["distance"],
            "duration_s": route["duration"],
            "path_coords": path_coords,
            "legs": route["legs"][0]["steps"],
            "source": "osrm"
        }

    # Valhalla setup as a failsafe for OSRM API
    @staticmethod
    def _try_valhalla(user_lat, user_lon, dest_lat, dest_lon):
        body = {
            "locations": [
                {"lat": user_lat, "lon": user_lon},
                {"lat": dest_lat, "lon": dest_lon}
            ],
            "costing": "auto",
            "directions_options": {"units": "miles"}
        }
        # Test request
        r = requests.post(VALHALLA_URL, json=body, timeout=10)
        if r.status_code != 200:
            raise RuntimeError(f"Valhalla error {r.status_code}: {r.text}")

        data = r.json()
        trip = data["trip"]
        legs = trip["legs"][0]

        # Valhalla encodes shape with precision=6
        path_coords = polyline.decode(legs["shape"], 6)
        distance_m = trip["summary"]["length"] * 1609.34
        duration_s = trip["summary"]["time"]

        # Normalize into OSRM-like steps so downstream functions work unchanged
        steps = []
        for m in legs.get("maneuvers", []):
            loc_idx = m.get("begin_shape_index", 0)
            loc = [path_coords[loc_idx][1], path_coords[loc_idx][0]]
            steps.append({
                "name": m.get("street_names", [""])[0] if m.get("street_names") else "",
                "maneuver": {
                    "location": loc,
                    "instruction": m.get("instruction", "")
                },
                "geometry": None
            })

        return {
            "distance_m": distance_m,
            "duration_s": duration_s,
            "path_coords": path_coords,
            "legs": steps,
            "source": "valhalla"
        }
    
    # Third fallback just in case
    @staticmethod
    def _haversine_fallback(user_lat, user_lon, dest_lat, dest_lon):
        R = 6371000
        phi1, phi2 = radians(user_lat), radians(dest_lat)
        dphi = radians(dest_lat - user_lat)
        dlam = radians(dest_lon - user_lon)
        a = sin(dphi/2)**2 + cos(phi1)*cos(phi2)*sin(dlam/2)**2
        distance_m = R * 2 * atan2(sqrt(a), sqrt(1 - a))
        duration_s = (distance_m / 1609.34) / 35 * 3600

        return {
            "distance_m": distance_m * 1.35,
            "duration_s": duration_s,
            "path_coords": [[user_lat, user_lon], [dest_lat, dest_lon]],
            "legs": [{
                "name": "Direct route",
                "maneuver": {
                    "location": [user_lon, user_lat],
                    "instruction": f"Head toward destination ({distance_m/1609.34:.1f} mi straight-line — routing unavailable)"
                },
                "geometry": None
            }],
            "source": "haversine"
        }

    @staticmethod
    def call_osrm(user_lat, user_lon, dest_lat, dest_lon):
        # check cache first
        key = _cache_key(user_lat, user_lon, dest_lat, dest_lon)
        cache = _load_cache()

        if key in cache:
            return cache[key]

        result = None

        # Attempt OSRM first, then Valhalla, then Haversine
        try:
            result = RoutingAgent._try_osrm(user_lat, user_lon, dest_lat, dest_lon)
        except Exception as e:
            print(f"OSRM failed ({e}), trying Valhalla...")

        if result is None:
            try:
                result = RoutingAgent._try_valhalla(user_lat, user_lon, dest_lat, dest_lon)
            except Exception as e:
                print(f"Valhalla failed ({e}), using straight-line fallback...")

        if result is None:
            result = RoutingAgent._haversine_fallback(user_lat, user_lon, dest_lat, dest_lon)

        if result["source"] != "haversine":
            cache[key] = result
            _save_cache(cache)

        return result

    # For translating direcitons from the route response
    @staticmethod
    def summarize_streets(steps):
        names = []
        for step in steps:
            if step.get("name") and step["name"] not in names:
                names.append(step["name"])
        return names

    # Actually generate the direcitons with the bearings and turns
    @staticmethod
    def generate_directions(steps):
        directions = []
        prev_bearing = None

        for step in steps:
            name = step.get("name", "Unnamed Road")
            maneuver = step["maneuver"]

            # OSRM already gives textual instructions
            instr = maneuver.get("instruction")
            if instr:
                directions.append(instr)
                continue

            # If OSRM didn't provide instruction (rare), fallback to bearing logic
            loc = maneuver.get("location")
            if not loc:
                continue

            lat1, lon1 = loc[1], loc[0]
            if prev_bearing is None:
                prev_bearing = 0

            geom = step.get("geometry")
            if geom:
                coords = polyline.decode(geom)
                lat2, lon2 = coords[-1][0], coords[-1][1]
                b2 = RoutingAgent.compute_bearing(lat1, lon1, lat2, lon2)
                turn = RoutingAgent.turn_direction(prev_bearing, b2)
                directions.append(f"{turn} onto {name}")
                prev_bearing = b2

        return directions

    @staticmethod
    def classify_flood_risk(zone: str, subtype: str = "", sfha_tf=None) -> str:
        """
        Map FEMA fields to a simple risk label.
        - SFHA (A/V zones) => High
        - Zone X shaded (0.2% annual chance) => Moderate
        - Zone X unshaded => Low
        """
        z = (zone or "").upper().strip()
        st = (subtype or "").upper()
        sfha_flag = str(sfha_tf).upper() in {"T", "Y", "1", "TRUE", "YES"}

        if sfha_flag or z.startswith(("A", "V")):
            return "High"
        if z == "X" and ("0.2" in st or "0.2 PCT" in st or "SHADED" in st):
            return "Moderate"
        if z == "X":
            return "Low"
        return "Unknown"

    @staticmethod
    def check_route_flood_risk(path_coords, flood_gdf):
        """
        Given a decoded polyline (list of [lat, lon]) and a flood GeoDataFrame,
        return a list of flood zone intersections along the route.
        """
        if flood_gdf is None or len(path_coords) < 2:
            return []

        # path_coords is [[lat, lon], ...] — shapely wants (lon, lat)
        line = LineString([(lon, lat) for lat, lon in path_coords])
        route_gdf = gpd.GeoDataFrame(geometry=[line], crs="EPSG:4326")

        joined = gpd.sjoin(route_gdf, flood_gdf, predicate="intersects", how="inner")
        if joined.empty:
            return []

        warnings = []
        for _, row in joined.iterrows():
            zone = row.get("FLD_ZONE", "Unknown")
            subtype = row.get("ZONE_SUBTY", "")
            sfha_tf = row.get("SFHA_TF", None)
            risk = RoutingAgent.classify_flood_risk(zone, subtype, sfha_tf)
            warnings.append({
                "zone": zone,
                "risk": risk,
                "description": subtype or None
            })

        # Dedupe by zone+risk
        seen = set()
        unique = []
        for w in warnings:
            key = (w["zone"], w["risk"])
            if key not in seen:
                seen.add(key)
                unique.append(w)

        return unique

    # Call the working routing API, summarize directions, and return fully formatted response
    @staticmethod
    def get_routes(user_lat, user_lon, shelters, max_results=5):
        results = []

        # Cycle through the shelters
        for name, coords in shelters.items():
            dest_lat, dest_lon = coords[0], coords[1]

            try:
                osrm = RoutingAgent.call_osrm(user_lat, user_lon, dest_lat, dest_lon)
            except Exception as e:
                print(f"Skipping {name}, OSRM error: {e}")
                continue

            steps = osrm["legs"]

            #  for directions
            major_streets = RoutingAgent.summarize_streets(steps)
            directions = RoutingAgent.generate_directions(steps)

            distance_m = osrm["distance_m"]
            distance_miles = distance_m / 1609.34

            # response format
            results.append({
                "shelter_name": name,
                "location": {"lat": dest_lat, "lon": dest_lon},
                "distance": {
                    "meters": round(distance_m, 1),
                    "miles": round(distance_miles, 2),
                    "display": f"{distance_miles:.1f} miles"
                },
                "route_summary": {
                    "major_roads": major_streets[:5],
                    "total_turns": len(directions)
                },
                "directions": {
                    "steps": directions,
                    "narrative": "\n".join([f"{i+1}. {d}" for i, d in enumerate(directions)])
                },
                # changed to len so we don't get a spam of coordinates in the output
                "path_coordinates": osrm["path_coords"]
            })

        # Sort & return
        results.sort(key=lambda r: r["distance"]["meters"])
        return {
            "success": True,
            "user_location": {"lat": user_lat, "lon": user_lon},
            "summary": {
                "total_shelters_found": len(results),
                "nearest_shelter": results[0]["shelter_name"] if results else None,
                "nearest_distance": results[0]["distance"]["display"] if results else None,
            },
            "routes": results[:max_results],
            "llm_context": {
                "quick_summary": (
                    f"Found {len(results)} shelters. Closest is "
                    f"{results[0]['shelter_name']} at {results[0]['distance']['display']}."
                    if results else "No shelters found."
                ),
                "top_3_options": [
                    {
                        "name": rt["shelter_name"],
                        "distance": rt["distance"]["display"],
                        "first_direction": rt["directions"]["steps"][0]
                        if rt["directions"]["steps"] else ""
                    }
                    for rt in results[:3]
                ]
            }
        }