/**
 * FlightRadar24 API Client
 * Provides richer data including departure/destination airports and aircraft type
 */

const FR24_BASE = 'https://data-cloud.flightradar24.com/zones/fcgi/feed.js';

/**
 * Fetch flights from FlightRadar24
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {number} radiusNm - Search radius in nautical miles
 */
export async function fetchFR24Flights(lat, lon, radiusNm = 15) {
  // Convert nm to degrees (approximate)
  const latDeg = radiusNm / 60;
  const lonDeg = radiusNm / (60 * Math.cos(lat * Math.PI / 180));
  
  const bounds = {
    north: lat + latDeg,
    south: lat - latDeg,
    west: lon - lonDeg,
    east: lon + lonDeg
  };
  
  const url = `${FR24_BASE}?bounds=${bounds.north.toFixed(6)},${bounds.south.toFixed(6)},${bounds.west.toFixed(6)},${bounds.east.toFixed(6)}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=0&air=1&vehicles=0&estimated=1&maxage=14400&gliders=0&stats=0`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    
    const data = await res.json();
    return parseFR24Flights(data, lat, lon, radiusNm);
  } catch (err) {
    console.error('FR24 fetch error:', err.message);
    return [];
  }
}

/**
 * Parse FR24 response
 * FR24 format: { icao: [icao, lat, lon, heading, alt, speed, squawk, radar, ac_type, reg, timestamp, origin, dest, flight, on_ground, v_speed, callsign, ...] }
 */
function parseFR24Flights(data, centerLat, centerLon, radiusNm) {
  const flights = [];
  
  for (const [icao, items] of Object.entries(data)) {
    // Skip metadata keys
    if (!Array.isArray(items) || items.length < 17) continue;
    
    // Skip grounded aircraft
    if (items[14] === true) continue;
    
    const flight = {
      icao: items[0],
      lat: items[1],
      lon: items[2],
      heading: items[3],
      altitude: items[4], // feet
      speed: items[5], // knots
      squawk: items[6],
      radar: items[7],
      aircraftType: items[8], // ICAO type code (e.g., "B738")
      registration: items[9],
      timestamp: items[10],
      origin: items[11], // IATA origin airport
      destination: items[12], // IATA destination airport
      flightNumber: items[13], // Flight number
      onGround: items[14],
      verticalRate: items[15],
      callsign: items[16], // Callsign
    };
    
    if (flight.lat && flight.lon) {
      flight.distance = calculateDistance(centerLat, centerLon, flight.lat, flight.lon);
      // Strict radius filtering - only include flights within radius
      if (flight.distance <= radiusNm) {
        flights.push(flight);
      }
    }
  }
  
  return flights.sort((a, b) => a.distance - b.distance);
}

/**
 * Calculate distance between two lat/lon points (Haversine)
 * Returns distance in nautical miles
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Get arrow character for heading
 */
export function headingToArrow(heading) {
  if (heading == null) return '○';
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const normalized = ((heading % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return arrows[index];
}

/**
 * Calculate bearing from center to flight
 */
export function calculateBearingToFlight(centerLat, centerLon, flightLat, flightLon) {
  const dLon = toRad(flightLon - centerLon);
  const lat1 = toRad(centerLat);
  const lat2 = toRad(flightLat);
  
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x) * (180 / Math.PI);
  bearing = ((bearing % 360) + 360) % 360;
  
  return bearing;
}
