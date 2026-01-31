#!/usr/bin/env python3
"""
HTTP Flight Tracker for AWTRIX - Shows closest flight when within 5 NM
- Uses HTTP API (MQTT not enabled)
- Cycles through: Aircraft Type → Route → Distance+Altitude
- Cycles 5 times then exits
- Only triggers for flights within 5 NM
"""

import requests
import json
import time
import math
from datetime import datetime

# AWTRIX Clock settings
AWTRIX_IP = "192.168.5.56"  # Ulanzi TC001 clock
AWTRIX_URL = f"http://{AWTRIX_IP}/api/notify"

# Vancouver, WA coordinates (Jack's home)
LAT, LON = 45.625280431872, -122.52811167430798
RANGE_DEGREES = 0.5  # ~50km
CLOSE_THRESHOLD_NM = 2.0  # Only show flights within 2 nautical miles
MAX_CYCLES = 5  # Cycle 5 times then exit

# Aircraft type code to name mapping (common types)
AIRCRAFT_TYPES = {
    "A319": "A319",
    "A320": "A320", 
    "A321": "A321",
    "A332": "A330",
    "A333": "A330",
    "A359": "A350",
    "B38M": "737 MAX",
    "B738": "737-800",
    "B739": "737-900",
    "B752": "757",
    "B753": "757",
    "B763": "767",
    "B764": "767",
    "B772": "777",
    "B773": "777",
    "B77W": "777",
    "B788": "787-8",
    "B789": "787-9",
    "B78X": "787-10",
    "E75L": "E175",
    "E75S": "E175",
    "CRJ2": "CRJ200",
    "CRJ7": "CRJ700",
    "CRJ9": "CRJ900",
    "MD11": "MD-11",
    "MD82": "MD-82",
    "MD83": "MD-83",
    "DC10": "DC-10",
    "C172": "Cessna 172",
    "C182": "Cessna 182",
    "C208": "Caravan",
    "PC12": "Pilatus PC-12",
    "SR22": "Cirrus SR22",
    "BE20": "King Air",
    "GLF4": "Gulfstream",
    "GLF5": "Gulfstream",
    "CL30": "Challenger",
    "CL60": "Challenger",
    "FA7X": "Falcon 7X",
    "A388": "A380",
    "A20N": "A320neo",
    "A21N": "A321neo",
    "BCS1": "A220",
    "BCS3": "A220",
    "E190": "E190",
    "E195": "E195",
    "AT75": "ATR-72",
    "AT76": "ATR-72",
    "DH8A": "Dash 8",
    "DH8B": "Dash 8",
    "DH8C": "Dash 8",
    "DH8D": "Dash 8 Q400",
    "B190": "Beech 1900",
    "SW4": "Metroliner",
    "C130": "C-130",
    "C17": "C-17",
    "C5M": "C-5",
    "K35R": "KC-135",
    "V22": "V-22",
    "P8": "P-8",
    "E6": "E-6",
    "E3TF": "AWACS",
    "B742": "747",
    "B744": "747-400",
    "B748": "747-8",
    "B74R": "747",
    "A310": "A310",
    "A306": "A300",
    "A30B": "A300",
    "A342": "A340",
    "A343": "A340",
    "A345": "A340",
    "A346": "A340",
    "CONC": "Concorde",
}

# Track the current flight being displayed
last_flight = None
last_flight_time = 0
FLIGHT_TIMEOUT = 300  # Keep showing same flight for 5 minutes max if no new ones

# Web export settings
WEB_EXPORT_PATH = "./flights-web.json"
FLIGHTS_LOG_PATH = "./flights.json"
active_flight_path = []  # Path snapshots for detailed tracking
last_web_export = 0


def export_web_data(flight_just_left=False):
    """Export web-friendly JSON with closest approach data"""
    global last_web_export
    
    now = time.time()
    # Throttle exports to every 5 seconds unless flight just left
    if not flight_just_left and now - last_web_export < 5:
        return
    last_web_export = now
    
    try:
        # Find closest approach from path data
        closest_flight = None
        min_distance = float('inf')
        
        if active_flight_path:
            for snapshot in active_flight_path:
                if snapshot['distance'] < min_distance:
                    min_distance = snapshot['distance']
                    closest_flight = snapshot
        
        if not closest_flight:
            # No flight data yet
            with open(WEB_EXPORT_PATH, 'w') as f:
                json.dump({
                    'status': 'waiting',
                    'message': 'No flights detected yet',
                    'timestamp': datetime.now().isoformat()
                }, f, indent=2)
            return
        
        # Calculate overhead score
        overhead_score = closest_flight['distance']
        is_overhead = overhead_score < 1.0
        
        # Determine precision
        precision = 'high' if len(active_flight_path) >= 3 else \
                   'tracked' if active_flight_path else 'estimated'
        
        web_data = {
            'closestApproach': {
                'distance': round(closest_flight['distance'], 2),
                'altitude': round(closest_flight['altitude']),
                'timestamp': closest_flight.get('timestamp', datetime.now().isoformat()),
                'lat': closest_flight['lat'],
                'lon': closest_flight['lon'],
                'precision': precision
            },
            'flight': {
                'callsign': closest_flight.get('callsign', last_flight.get('callsign') if last_flight else 'UNKNOWN'),
                'aircraftType': get_aircraft_name(closest_flight.get('type')),
                'origin': closest_flight.get('from'),
                'destination': closest_flight.get('to')
            },
            'overheadScore': round(overhead_score, 2),
            'isOverhead': is_overhead,
            'pathSnapshots': len(active_flight_path),
            'status': 'completed' if flight_just_left else 'tracking',
            'timestamp': datetime.now().isoformat()
        }
        
        with open(WEB_EXPORT_PATH, 'w') as f:
            json.dump(web_data, f, indent=2)
        
        if flight_just_left:
            print(f"🌐 Web export: closest approach {web_data['closestApproach']['distance']}NM @ {web_data['closestApproach']['altitude']}ft ({precision})")
    
    except Exception as e:
        print(f"Error exporting web data: {e}")


def record_path_snapshot(flight):
    """Record a path snapshot for detailed tracking"""
    snapshot = {
        'timestamp': datetime.now().isoformat(),
        'callsign': flight.get('callsign'),
        'lat': flight.get('lat'),
        'lon': flight.get('lon'),
        'distance': flight.get('distance'),
        'altitude': flight.get('altitude'),
        'speed': flight.get('speed'),
        'track': flight.get('track'),
        'type': flight.get('type'),
        'from': flight.get('from'),
        'to': flight.get('to')
    }
    active_flight_path.append(snapshot)
    # Keep only last 100 snapshots
    if len(active_flight_path) > 100:
        active_flight_path.pop(0)


def get_aircraft_name(type_code):
    """Convert aircraft type code to readable name"""
    if not type_code:
        return "Plane"
    code = str(type_code).upper().strip()
    return AIRCRAFT_TYPES.get(code, code)


def fetch_flights():
    """Fetch flights near Seattle from FlightRadar24"""
    bounds = f"{LAT + RANGE_DEGREES},{LAT - RANGE_DEGREES},{LON - RANGE_DEGREES},{LON + RANGE_DEGREES}"
    url = f"https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds={bounds}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=1&maxage=14400&gliders=1&stats=1"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0",
        "Accept": "application/json",
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        flights = []
        for key, val in data.items():
            if isinstance(val, list) and len(val) >= 14:
                flight = {
                    "callsign": str(val[13]).strip() if val[13] else "UNKNOWN",
                    "altitude": val[4],  # feet
                    "speed": val[5],     # knots
                    "from": str(val[11]) if val[11] else "???",
                    "to": str(val[12]) if val[12] else "???",
                    "lat": val[1],       # latitude
                    "lon": val[2],       # longitude
                    "track": val[3] if len(val) > 3 else 0,  # heading
                    "type": str(val[8]) if len(val) > 8 and val[8] else None,  # aircraft type
                }
                flights.append(flight)
        return flights
    except Exception as e:
        print(f"Error fetching flights: {e}")
        return []


def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in nautical miles"""
    R = 3440.065  # Earth's radius in nautical miles
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def send_http_notification(text, icon=0, color="#FFFFFF", duration=5):
    """Send notification to AWTRIX via HTTP API"""
    # Convert RGB list to hex if needed
    if isinstance(color, list):
        color = "#{:02X}{:02X}{:02X}".format(color[0], color[1], color[2])

    payload = {
        "text": text,
        "icon": icon,
        "color": color,
        "duration": duration,
        "repeat": 1,
    }

    try:
        resp = requests.post(AWTRIX_URL, json=payload, timeout=5)
        resp.raise_for_status()
        print(f"  HTTP → {text} (icon: {icon})")
        return True
    except Exception as e:
        print(f"Error sending HTTP notification: {e}")
        return False


def get_altitude_color(alt):
    """Get color based on altitude"""
    if alt > 30000:
        return "#64C8FF"  # Cyan for high
    elif alt > 10000:
        return "#FFFF64"  # Yellow for medium
    else:
        return "#64FF64"  # Green for low


def get_direction_arrow(track):
    """Get arrow for heading direction"""
    if 45 <= track < 135:
        return "→"  # East
    elif 135 <= track < 225:
        return "↓"  # South
    elif 225 <= track < 315:
        return "←"  # West
    else:
        return "↑"  # North


def cycle_flight_display(flight):
    """Cycle through flight info: Aircraft Type → Route → Distance+Altitude"""
    alt = flight["altitude"]
    spd = flight["speed"]
    dist = flight.get("distance", 0)
    from_code = flight.get("from", "???")[:3]
    to_code = flight.get("to", "???")[:3]
    track = flight.get("track", 0)
    type_code = flight.get("type")
    
    color = get_altitude_color(alt)
    direction = get_direction_arrow(track)
    aircraft_name = get_aircraft_name(type_code)
    
    # AWTRIX icon names (LaMetric icons, uploaded via setup_awtrix_icons.sh)
    ICON_PLANE = "airplane"   # LaMetric icon 2056 (airplane)
    ICON_GLOBE = "globe"      # LaMetric icon 53 (globe)
    ICON_RADAR = "radar"      # LaMetric icon 1538 (radar/signal)
    
    # 1. Aircraft Type (e.g., "737-800" or "A320")
    send_http_notification(aircraft_name, icon=ICON_PLANE, color=color, duration=4)
    time.sleep(4)

    # 2. Route (e.g., "SEA → LAX")
    route_text = f"{from_code} {direction} {to_code}" if from_code != "???" or to_code != "???" else "Route Unknown"
    send_http_notification(route_text, icon=ICON_GLOBE, color=color, duration=4)
    time.sleep(4)

    # 3. Distance and Altitude
    alt_k = alt // 1000
    dist_text = f"{dist:.1f}NM {alt_k}Kft"
    send_http_notification(dist_text, icon=ICON_RADAR, color=color, duration=4)
    time.sleep(4)


def main():
    global last_flight, last_flight_time

    print(f"Starting HTTP Flight Tracker - Monitoring near Vancouver, WA ({LAT}, {LON})")
    print(f"AWTRIX URL: {AWTRIX_URL}")
    print(f"Threshold: Only shows flights within {CLOSE_THRESHOLD_NM} NM")
    print(f"Cycles {MAX_CYCLES} times when close flight detected")
    print("Press Ctrl+C to stop\n")

    cycle_count = 0
    currently_displaying = False

    try:
        while True:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Fetching flights...")
            flights = fetch_flights()

            if flights:
                # Sort by distance to find closest
                for f in flights:
                    f['distance'] = calculate_distance(LAT, LON, f.get('lat', LAT), f.get('lon', LON))
                flights.sort(key=lambda x: x.get('distance', 999))

                closest = flights[0]
                dist = closest.get('distance', 999)

                print(f"Closest: {closest['callsign']} at {dist:.1f}NM")

                # Check if flight is within threshold
                if dist <= CLOSE_THRESHOLD_NM:
                    # Record path snapshot for web export
                    record_path_snapshot(closest)
                    export_web_data(flight_just_left=False)
                    
                    # Check if this is a new close flight
                    is_new_flight = (last_flight is None or
                                   closest['callsign'] != last_flight.get('callsign'))

                    if is_new_flight:
                        print(f"✓ NEW close flight: {closest['callsign']} at {dist:.1f}NM")
                        print(f"Type: {get_aircraft_name(closest.get('type'))}")
                        last_flight = closest
                        cycle_count = 0
                        currently_displaying = True
                        # Reset path for new flight
                        active_flight_path.clear()
                        record_path_snapshot(closest)

                    # Display if we haven't completed MAX_CYCLES yet
                    if currently_displaying and cycle_count < MAX_CYCLES:
                        cycle_count += 1
                        print(f"--- Displaying cycle {cycle_count}/{MAX_CYCLES} ({len(active_flight_path)} path snaps) ---")
                        cycle_flight_display(closest)

                        if cycle_count >= MAX_CYCLES:
                            print(f"Completed {MAX_CYCLES} cycles for {closest['callsign']}")
                            currently_displaying = False
                    else:
                        print(f"Already displayed {MAX_CYCLES} cycles, waiting for new flight...")
                else:
                    print(f"Too far ({dist:.1f}NM > {CLOSE_THRESHOLD_NM}NM)")
                    if currently_displaying:
                        print("Flight left threshold zone")
                        export_web_data(flight_just_left=True)
                        active_flight_path.clear()
                        currently_displaying = False
                        last_flight = None
                        cycle_count = 0
            else:
                print("No flights found")

            # Wait before next check
            time.sleep(10)

    except KeyboardInterrupt:
        print("\n\nStopping flight tracker...")
        send_http_notification("", duration=1)
        print("Stopped")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
