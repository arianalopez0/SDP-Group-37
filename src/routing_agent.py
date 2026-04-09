import requests
import polyline
from shapely.geometry import LineString
import geopandas as gpd
from math import atan2, degrees

OSRM_URL = "http://router.project-osrm.org"

class RoutingAgent:

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

    @staticmethod
    def call_osrm(user_lat, user_lon, dest_lat, dest_lon):
        url = (
            f"{OSRM_URL}/route/v1/driving/"
            f"{user_lon},{user_lat};{dest_lon},{dest_lat}"
            "?overview=full&geometries=polyline&steps=true"
        )
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            raise RuntimeError(f"OSRM error {r.status_code}: {r.text}")

        data = r.json()
        if "routes" not in data or not data["routes"]:
            raise RuntimeError("No routes returned from OSRM")

        route = data["routes"][0]

        # Decode full geometry for folium polyline
        path_coords = polyline.decode(route["geometry"])

        return {
            "distance_m": route["distance"],
            "duration_s": route["duration"],
            "path_coords": path_coords,
            "legs": route["legs"][0]["steps"]
        }

    @staticmethod
    def summarize_streets(steps):
        names = []
        for step in steps:
            if step.get("name") and step["name"] not in names:
                names.append(step["name"])
        return names

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

            # Bearing-based fallback
            lat1, lon1 = loc[1], loc[0]
            if prev_bearing is None:
                prev_bearing = 0

            # End location from geometry
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

    @staticmethod
    def get_routes(user_lat, user_lon, shelters, max_results=5):
        results = []

        for name, coords in shelters.items():
            dest_lat, dest_lon = coords[0], coords[1]

            try:
                osrm = RoutingAgent.call_osrm(user_lat, user_lon, dest_lat, dest_lon)
            except Exception as e:
                print(f"Skipping {name}, OSRM error: {e}")
                continue

            steps = osrm["legs"]

            major_streets = RoutingAgent.summarize_streets(steps)
            directions = RoutingAgent.generate_directions(steps)

            distance_m = osrm["distance_m"]
            distance_miles = distance_m / 1609.34

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
                # changed to len to we dont get a spam of coordinates in the output
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
