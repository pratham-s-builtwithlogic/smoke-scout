import json
import math
import urllib.request
import csv
import os
import uuid
from datetime import datetime
import boto3

# -------------------------------------------------------------------------
# AWS CONFIGURATION (Read from Environment Variables)
# -------------------------------------------------------------------------
TABLE_NAME = os.environ.get("DYNAMODB_TABLE")
S3_BUCKET_NAME = os.environ.get("S3_BUCKET")
S3_GEOJSON_KEY = os.environ.get("S3_KEY")
NASA_MAP_KEY = os.environ.get("NASA_MAP_KEY", "DEMO_KEY")

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(TABLE_NAME) if TABLE_NAME else None

CACHED_PUNJAB_GEOJSON = None

# -------------------------------------------------------------------------
# S3 DISTRICT BOUNDARY ENGINE (Step 3D)
# -------------------------------------------------------------------------
def get_punjab_geojson():
    """Fetches and caches the 23-district Punjab GeoJSON in container memory."""
    global CACHED_PUNJAB_GEOJSON
    if CACHED_PUNJAB_GEOJSON is not None:
        return CACHED_PUNJAB_GEOJSON

    if not S3_BUCKET_NAME or not S3_GEOJSON_KEY:
        return None

    try:
        response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=S3_GEOJSON_KEY)
        CACHED_PUNJAB_GEOJSON = json.loads(response['Body'].read().decode('utf-8'))
        return CACHED_PUNJAB_GEOJSON
    except Exception as e:
        print(f"S3 fetch error: {e}")
        return None

def point_in_polygon(px, py, poly):
    """Ray-casting algorithm to test if [px, py] falls within a polygon boundary."""
    inside = False
    n = len(poly)
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if py > min(p1y, p2y):
            if py <= max(p1y, p2y):
                if px <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (py - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or px <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def match_district(lon, lat):
    """Identifies the Punjab district enclosing [lon, lat]."""
    geojson_data = get_punjab_geojson()
    if not geojson_data or "features" not in geojson_data:
        return "Punjab (General Region)"

    for feature in geojson_data.get("features", []):
        props = feature.get("properties", {})
        district_name = (
            props.get("NAME") or 
            props.get("district") or 
            props.get("DISTRICT") or 
            props.get("dtname") or 
            props.get("NAME_2") or 
            props.get("name")
        )
        geometry = feature.get("geometry", {})
        g_type = geometry.get("type")
        coords = geometry.get("coordinates", [])

        if g_type == "Polygon":
            for ring in coords:
                if point_in_polygon(lon, lat, ring):
                    return district_name
        elif g_type == "MultiPolygon":
            for poly in coords:
                for ring in poly:
                    if point_in_polygon(lon, lat, ring):
                        return district_name

    return "Border Region / Out of Bounds"

# -------------------------------------------------------------------------
# DYNAMODB LOGGING ENGINE (Phase 4)
# -------------------------------------------------------------------------
def log_incident_to_dynamodb(record):
    """Persists incident report to DynamoDB without blocking the API on errors."""
    if not table:
        return None

    try:
        event_id = str(uuid.uuid4())[:8]
        item = {
            "eventID": event_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "mode": record.get("mode", "fire_trace"),
            "status": record.get("status"),
            "confidence_score": str(record.get("confidence_score")),
            "origin_district": str(record.get("origin_district")),
            "sensor_lat": str(record["sensor_location"]["lat"]),
            "sensor_lon": str(record["sensor_location"]["lon"]),
            "target_lat": str(record["target_coordinates"]["lat"]),
            "target_lon": str(record["target_coordinates"]["lon"]),
            "pm25": str(record["air_quality"]["pm25"]),
            "co": str(record["air_quality"]["co"])
        }
        table.put_item(Item=item)
        return event_id
    except Exception as e:
        print(f"DynamoDB log error: {e}")
        return None

# -------------------------------------------------------------------------
# CITIZEN HEALTH ADVISORY ENGINE
# -------------------------------------------------------------------------
def generate_citizen_advisory(current_pm25, morning_pm25, midday_pm25):
    """Produces real-time and tomorrow morning diurnal inversion advisories."""
    if current_pm25 >= 250:
        now_status = "SEVERE_EMERGENCY"
        now_action = "Avoid all outdoor exposure. N95 mask mandatory."
        now_windows = "Keep windows tightly closed. Run HEPA air purification."
    elif current_pm25 >= 120:
        now_status = "VERY_POOR"
        now_action = "Avoid outdoor cardio. Normal walking requires N95 mask."
        now_windows = "Keep windows closed."
    elif current_pm25 >= 60:
        now_status = "MODERATE_POOR"
        now_action = "Safe for short activities. Sensitive groups limit exertion."
        now_windows = "Safe to open windows for ventilation."
    else:
        now_status = "GOOD"
        now_action = "Ideal air quality for outdoor activities."
        now_windows = "Safe to ventilate home."

    if morning_pm25 >= 150:
        morning_advice = f"AVOID morning walk. Inversion layer traps heavy smoke ({morning_pm25} µg/m³)."
    elif morning_pm25 >= 80:
        morning_advice = f"Caution. Moderate smog forecasted ({morning_pm25} µg/m³). Limit cardio."
    else:
        morning_advice = f"Clear morning forecasted ({morning_pm25} µg/m³). Safe for walks."

    alternative = (
        f"Shift outdoor activity to 2:00 PM (Forecast: drops to {midday_pm25} µg/m³)."
        if midday_pm25 < morning_pm25 else "Midday air quality remains stable."
    )

    return {
        "right_now": {
            "status": now_status,
            "pm25_level": current_pm25,
            "action": now_action,
            "home_ventilation": now_windows
        },
        "tomorrow_planner": {
            "morning_forecast_pm25": morning_pm25,
            "midday_forecast_pm25": midday_pm25,
            "morning_walk_advice": morning_advice,
            "better_alternative": alternative
        }
    }

# -------------------------------------------------------------------------
# AIR QUALITY & WIND ENGINES (Step 3A & 3B)
# -------------------------------------------------------------------------
def fetch_air_quality(lat, lon):
    url = (
        f"https://air-quality-api.open-meteo.com/v1/air-quality?"
        f"latitude={lat}&longitude={lon}"
        f"&current=pm10,pm2_5,carbon_monoxide"
        f"&hourly=pm2_5"
        f"&timezone=Asia/Kolkata"
    )
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read().decode('utf-8'))
            
        current = data.get("current", {})
        current_pm25 = current.get("pm2_5", 135.0)
        current_pm10 = current.get("pm10", 620.0)
        co = current.get("carbon_monoxide", 320.0)
        
        hourly_times = data.get("hourly", {}).get("time", [])
        hourly_pm25 = data.get("hourly", {}).get("pm2_5", [])
        morning_pm25, midday_pm25 = current_pm25, current_pm25
        
        if current.get("time", "") in hourly_times:
            idx = hourly_times.index(current.get("time", ""))
            for i, t in enumerate(hourly_times[idx:]):
                if "T06:00" in t and morning_pm25 == current_pm25:
                    morning_pm25 = hourly_pm25[idx + i]
                if "T14:00" in t and midday_pm25 == current_pm25:
                    midday_pm25 = hourly_pm25[idx + i]
            pm25_1h_ago = hourly_pm25[idx - 1] if idx > 0 else current_pm25
        else:
            pm25_1h_ago = current_pm25 - 30.0
    except Exception:
        current_pm25, current_pm10, co, pm25_1h_ago, morning_pm25, midday_pm25 = 142.5, 580.0, 340.0, 105.0, 185.0, 85.0

    delta = round(current_pm25 - pm25_1h_ago, 2)
    return {
        "pm25": current_pm25,
        "pm10": current_pm10,
        "co": co,
        "delta_1h": delta,
        "morning_forecast_pm25": morning_pm25,
        "midday_forecast_pm25": midday_pm25,
        "investigation_triggered": (current_pm25 >= 100.0 or delta >= 25.0)
    }

def fetch_wind_and_cone(lat, lon, lookback_hours=2.5):
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=wind_speed_10m,wind_direction_10m"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read().decode('utf-8'))
        speed = data.get("current", {}).get("wind_speed_10m", 12.0)
        wind_dir = data.get("current", {}).get("wind_direction_10m", 75.0)
    except Exception:
        speed, wind_dir = 12.0, 75.0

    reverse_bearing = wind_dir
    dist = speed * lookback_hours
    R = 6371.0

    def project_point(olat, olon, bearing_deg):
        brng, lat1, lon1 = math.radians(bearing_deg), math.radians(olat), math.radians(olon)
        lat2 = math.asin(math.sin(lat1) * math.cos(dist / R) + math.cos(lat1) * math.sin(dist / R) * math.cos(brng))
        lon2 = lon1 + math.atan2(math.sin(brng) * math.sin(dist / R) * math.cos(lat1), math.cos(dist / R) - math.sin(lat1) * math.sin(lat2))
        return [round(math.degrees(lon2), 4), round(math.degrees(lat2), 4)]

    left_pt = project_point(lat, lon, (reverse_bearing - 15) % 360)
    right_pt = project_point(lat, lon, (reverse_bearing + 15) % 360)
    center_pt = project_point(lat, lon, reverse_bearing)

    return {
        "speed_kmh": speed,
        "drift_distance_km": round(dist, 1),
        "center_point": center_pt,
        "cone_coordinates": [[round(lon, 4), round(lat, 4)], left_pt, right_pt, [round(lon, 4), round(lat, 4)]]
    }

# ---------------------------------------------------------
# NASA SATELLITE VERIFICATION (Step 3C)
# ---------------------------------------------------------
def check_nasa_fires(polygon):
    if NASA_MAP_KEY == "DEMO_KEY":
        return []

    matched_hotspots = []
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_MAP_KEY}/VIIRS_SNPP_NRT/73.8,29.5,76.9,32.5/1"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            lines = response.read().decode('utf-8').splitlines()
            reader = csv.DictReader(lines)
            for row in reader:
                f_lat, f_lon = float(row.get('latitude', 0)), float(row.get('longitude', 0))
                if point_in_polygon(f_lon, f_lat, polygon):
                    matched_hotspots.append({
                        "lat": f_lat,
                        "lon": f_lon,
                        "frp_mw": float(row.get('frp', 0)),
                        "acq_time": row.get('acq_time', '')
                    })
    except Exception:
        pass
    return matched_hotspots

# ---------------------------------------------------------
# MAIN LAMBDA HANDLER ROUTER
# ---------------------------------------------------------
def lambda_handler(event, context):
    try:
        body = event.get('body')
        if isinstance(body, str):
            payload = json.loads(body)
        elif isinstance(event, dict):
            payload = event
        else:
            payload = {}

        mode = payload.get("mode", "fire_trace")
        lat = payload.get("lat", 30.2110)
        lon = payload.get("lon", 74.9455)

        # BRANCH A: CITIZEN ADVISORY MODE
        if mode == "citizen":
            aq = fetch_air_quality(lat, lon)
            advisory = generate_citizen_advisory(
                aq["pm25"], 
                aq["morning_forecast_pm25"], 
                aq["midday_forecast_pm25"]
            )
            return {
                "statusCode": 200,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({
                    "mode": "citizen",
                    "location": {"lat": lat, "lon": lon},
                    "advisory": advisory
                })
            }

        # BRANCH B: ENFORCEMENT FIRE TRACE MODE
        elif mode == "fire_trace":
            lookback = payload.get("lookback_hours", 2.5)
            aq = fetch_air_quality(lat, lon)

            if not aq["investigation_triggered"]:
                return {
                    "statusCode": 200,
                    "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                    "body": json.dumps({
                        "mode": "fire_trace",
                        "status": "NORMAL_AIR",
                        "message": "Air quality does not indicate a biomass influx.",
                        "air_quality": aq
                    })
                }

            wind_cone = fetch_wind_and_cone(lat, lon, lookback)
            fires = check_nasa_fires(wind_cone["cone_coordinates"])

            if fires:
                target_lon, target_lat = fires[0]["lon"], fires[0]["lat"]
                final_score, final_status = 10, "CONFIRMED_STUBBLE_FIRE"
            else:
                target_lon, target_lat = wind_cone["center_point"][0], wind_cone["center_point"][1]
                final_score, final_status = 3, "UNVERIFIED_SMOKE_PLUME"

            origin_district = match_district(target_lon, target_lat)

            # Persist to DynamoDB (Phase 4)
            event_id = log_incident_to_dynamodb({
                "mode": "fire_trace",
                "status": final_status,
                "confidence_score": final_score,
                "origin_district": origin_district,
                "sensor_location": {"lat": lat, "lon": lon},
                "target_coordinates": {"lat": target_lat, "lon": target_lon},
                "air_quality": aq
            })

            geojson_features = [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {"layer": "sensor", "pm25": aq["pm25"]}
                },
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [wind_cone["cone_coordinates"]]},
                    "properties": {"layer": "search_wedge", "drift_km": wind_cone["drift_distance_km"]}
                }
            ]

            for f in fires:
                geojson_features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [f["lon"], f["lat"]]},
                    "properties": {"layer": "nasa_fire_hotspot", "frp": f["frp_mw"]}
                })

            return {
                "statusCode": 200,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({
                    "event_id": event_id,
                    "mode": "fire_trace",
                    "status": final_status,
                    "confidence_score": final_score,
                    "origin_district": origin_district,
                    "target_coordinates": {"lat": target_lat, "lon": target_lon},
                    "sensor_location": {"lat": lat, "lon": lon},
                    "satellite_fires": fires,
                    "geojson": {"type": "FeatureCollection", "features": geojson_features}
                })
            }

        else:
            return {"statusCode": 400, "body": json.dumps({"error": "Invalid mode."})}

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}