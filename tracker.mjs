#!/usr/bin/env node
/**
 * Flight Tracker - AWTRIX Channel Integration
 * Event-driven: only notifies when NEW flights detected
 * Uses ulanzi-clock channel API for proper clawdbot integration
 */

import { fetchFR24Flights } from './api-fr24.mjs';
import * as awtrix from './channel.mjs';
import { enrichFlight, getAircraftName, getAirlineCode, getDBStats } from './aircraft-db.mjs';
import fs from 'fs';
import path from 'path';

const CONFIG = {
  lat: parseFloat(process.env.TRACKER_LAT) || 45.625280431872,  // Vancouver, WA
  lon: parseFloat(process.env.TRACKER_LON) || -122.52811167430798,
  radiusNm: parseFloat(process.env.TRACKER_RADIUS_NM) || 1.5,   // 1.5NM detection zone
  pollIntervalSec: parseInt(process.env.POLL_INTERVAL) || 10,
  displayDuration: 5,  // Seconds per info screen
  flightsLogPath: process.env.FLIGHTS_LOG_PATH || './flights.json',
  webExportPath: process.env.WEB_EXPORT_PATH || './flights-web.json'
};

let lastFlightCallsign = null;
let isRunning = true;
let flightHistory = new Map(); // Track flights with their closest approach
let activeFlightPath = []; // Track path snapshots for current flight in zone
let lastWebExport = 0; // Throttle web exports
let cyclesRemaining = 0; // Track cycles for close flights
let lastNotifiedCallsign = null; // Track last flight we notified
let lastFlightSeen = null; // Timestamp when we last saw any flight

/**
 * Load existing flight history from file
 */
function loadFlightHistory() {
  try {
    if (fs.existsSync(CONFIG.flightsLogPath)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.flightsLogPath, 'utf8'));
      data.forEach(f => flightHistory.set(f.callsign, f));
      console.log(`📚 Loaded ${data.length} flights from history`);
    }
  } catch (err) {
    console.error('Error loading flight history:', err.message);
  }
}

/**
 * Save flight history to file
 */
function saveFlightHistory() {
  try {
    const data = Array.from(flightHistory.values());
    fs.writeFileSync(CONFIG.flightsLogPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving flight history:', err.message);
  }
}

/**
 * Export web-friendly JSON for website display
 * Includes closest approach data with precision indicator
 */
function exportWebData(flightJustLeft = false) {
  const now = Date.now();
  // Throttle exports to every 5 seconds unless flight just left zone
  if (!flightJustLeft && now - lastWebExport < 5000) return;
  lastWebExport = now;

  try {
    // Find the flight with closest approach in current session
    let closestFlight = null;
    let minDistance = Infinity;
    
    // Check active path first (high precision)
    if (activeFlightPath.length > 0) {
      for (const snapshot of activeFlightPath) {
        if (snapshot.distance < minDistance) {
          minDistance = snapshot.distance;
          closestFlight = snapshot;
        }
      }
    }
    
    // Fallback to flight history if no active path
    if (!closestFlight && flightHistory.size > 0) {
      for (const f of flightHistory.values()) {
        if (f.closestDistance < minDistance) {
          minDistance = f.closestDistance;
          closestFlight = {
            distance: f.closestDistance,
            altitude: f.closestAltitude,
            lat: CONFIG.lat, // approximated
            lon: CONFIG.lon,
            timestamp: f.lastSeen,
            callsign: f.callsign,
            aircraftType: f.aircraftType,
            origin: f.origin,
            destination: f.destination
          };
        }
      }
    }

    if (!closestFlight) {
      // No flight data yet - write empty state
      fs.writeFileSync(CONFIG.webExportPath, JSON.stringify({
        status: 'waiting',
        message: 'No flights detected yet',
        timestamp: new Date().toISOString()
      }, null, 2));
      return;
    }

    // Calculate overhead score (0 = directly overhead)
    const overheadScore = closestFlight.distance;
    const isOverhead = overheadScore < 1.0; // Within 1NM is "overhead"

    // Determine precision based on data source
    const precision = activeFlightPath.length >= 3 ? 'high' : 
                      activeFlightPath.length > 0 ? 'tracked' : 'estimated';

    // Get speed from closest snapshot if available
    const closestSnapshot = activeFlightPath.find(s => s.distance === closestFlight.distance);
    const speed = closestSnapshot?.speed || closestFlight.speed || 0;
    
    // Get best aircraft type info - enriched > path > raw
    const aircraftType = closestSnapshot?.aircraftName || 
                         closestSnapshot?.aircraftType || 
                         closestFlight.aircraftType || 
                         closestFlight.type || null;
    
    // Get firstSeen time for takeoff display
    const historyEntry = flightHistory.get(closestFlight.callsign);
    const firstSeen = historyEntry?.firstSeen || closestFlight.timestamp || new Date().toISOString();
    
    const webData = {
      closestApproach: {
        distance: Math.round(closestFlight.distance * 100) / 100, // 2 decimal places
        altitude: Math.round(closestFlight.altitude),
        speed: Math.round(speed),
        timestamp: closestFlight.timestamp || new Date().toISOString(),
        lat: closestFlight.lat,
        lon: closestFlight.lon,
        precision: precision
      },
      flight: {
        callsign: closestFlight.callsign || lastFlightCallsign || 'UNKNOWN',
        aircraftType: getAircraftType(aircraftType) || aircraftType || 'Unknown',
        origin: closestFlight.origin || closestSnapshot?.origin || null,
        destination: closestFlight.destination || closestSnapshot?.destination || null,
        firstSeen: firstSeen
      },
      overheadScore: Math.round(overheadScore * 100) / 100,
      isOverhead: isOverhead,
      pathSnapshots: activeFlightPath.length,
      status: flightJustLeft ? 'completed' : 'tracking',
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(CONFIG.webExportPath, JSON.stringify(webData, null, 2));
    
    if (flightJustLeft) {
      console.log(`🌐 Web export: closest approach ${webData.closestApproach.distance}NM @ ${webData.closestApproach.altitude}ft (${precision})`);
    }
  } catch (err) {
    console.error('Error exporting web data:', err.message);
  }
}

/**
 * Update flight tracking data
 */
function trackFlight(flight) {
  const existing = flightHistory.get(flight.callsign);
  const now = new Date().toISOString();
  
  if (existing) {
    // Update existing flight
    existing.lastSeen = now;
    existing.duration = Math.round((new Date(now) - new Date(existing.firstSeen)) / 1000);
    if (flight.distance < existing.closestDistance) {
      existing.closestDistance = flight.distance;
      existing.closestAltitude = flight.altitude;
      existing.closestSpeed = flight.speed;
    }
    // Update route info if we got it
    if (flight.origin && !existing.origin) existing.origin = flight.origin;
    if (flight.destination && !existing.destination) existing.destination = flight.destination;
    if (flight.flightNumber && !existing.flightNumber) existing.flightNumber = flight.flightNumber;
    if (flight.aircraftType && !existing.aircraftType) existing.aircraftType = flight.aircraftType;
    if (flight.icao && !existing.icao) existing.icao = flight.icao;
    if (flight.registration && !existing.registration) existing.registration = flight.registration;
  } else {
    // New flight - only log if within radius
    if (flight.distance > CONFIG.radiusNm) {
      return; // Skip flights that start outside the zone
    }
    flightHistory.set(flight.callsign, {
      callsign: flight.callsign,
      flightNumber: flight.flightNumber || null,
      aircraftType: flight.aircraftType || flight.type || null,
      aircraftName: null,
      origin: flight.origin || null,
      destination: flight.destination || null,
      icao: flight.icao || null,
      registration: flight.registration || null,
      firstSeen: now,
      lastSeen: now,
      duration: 0,
      closestDistance: flight.distance,
      closestAltitude: flight.altitude,
      closestSpeed: flight.speed,
      initialDistance: flight.distance,
      initialAltitude: flight.altitude,
      initialSpeed: flight.speed
    });
    console.log(`📝 Logged new flight: ${flight.callsign}`);
  }
  
  saveFlightHistory();
}

/**
 * Record a path snapshot for detailed tracking
 */
function recordPathSnapshot(flight) {
  // Enrich with aircraft database
  const enriched = enrichFlight(flight);
  
  const snapshot = {
    timestamp: new Date().toISOString(),
    callsign: flight.callsign,
    lat: flight.lat,
    lon: flight.lon,
    distance: flight.distance,
    altitude: flight.altitude,
    speed: flight.speed,
    track: flight.track,
    aircraftType: enriched.aircraftType || flight.aircraftType,
    aircraftName: enriched.aircraftName,
    manufacturer: enriched.manufacturer,
    origin: flight.origin,
    destination: flight.destination,
    icao: flight.icao,
    registration: flight.registration
  };
  
  activeFlightPath.push(snapshot);
  
  // Keep only last 100 snapshots to prevent memory bloat
  if (activeFlightPath.length > 100) {
    activeFlightPath.shift();
  }
}

/**
 * Get color based on altitude (meaningful color coding)
 */
function getAltitudeColor(altitude) {
  if (altitude == null) return '#FFFFFF';
  if (altitude < 5000) return '#FF6B35';    // Orange - low/landing
  if (altitude < 15000) return '#FFD700';   // Gold - mid-level
  if (altitude < 30000) return '#00D9FF';   // Cyan - climbing/descending
  return '#9D4EDD';                          // Purple - cruising altitude
}

/**
 * Get color based on speed (meaningful color coding)
 */
function getSpeedColor(speed) {
  if (speed == null) return '#FFFFFF';
  if (speed < 200) return '#4CAF50';        // Green - slow/descending
  if (speed < 350) return '#FFD700';        // Gold - normal
  if (speed < 500) return '#FF9800';        // Orange - fast
  return '#F44336';                          // Red - very fast
}

/**
 * Get color based on distance (proximity to house)
 */
function getDistanceColor(distanceNm) {
  if (distanceNm == null) return '#FFFFFF';
  if (distanceNm < 0.5) return '#FF0000';   // Red - very close!
  if (distanceNm < 1.0) return '#FF9800';   // Orange - close
  if (distanceNm < 1.5) return '#FFD700';   // Gold - nearby
  return '#00D9FF';                          // Cyan - farther
}

/**
 * Get altitude-based icon
 */
function getAltitudeIcon(altitude) {
  if (altitude == null) return 'plane';
  if (altitude < 5000) return 'arrow_down';
  if (altitude > 30000) return 'arrow_up';
  return 'plane';
}

/**
 * Get aircraft type name from ICAO code
 * AWTRIX display is 32x8 pixels - keep names SHORT (2-4 chars max)
 */
function getAircraftType(typeCode) {
  const types = {
    'A319': 'A319', 'A320': 'A320', 'A321': 'A321',
    'A332': 'A333', 'A333': 'A333', 'A359': 'A359',
    'B38M': '7MAX', 'B738': 'B738', 'B739': 'B739',
    'B752': 'B752', 'B763': 'B763', 'B772': 'B772',
    'B788': 'B788', 'B789': 'B789',
    'E75L': 'E75L', 'CRJ7': 'CRJ7',
    'A20N': 'A20N', 'A21N': 'A21N',
    'BCS1': 'A220', 'BCS3': 'A223',
    'PC12': 'PC12', 'C56X': 'C56X', 
    'GLF4': 'GLF4', 'GLF5': 'GLF5', 'GLF6': 'GLF6',
    'C680': 'C680', 'CL60': 'CL60', 'FA50': 'FA50',
    'E135': 'E135', 'E145': 'E145', 'E170': 'E170', 'E190': 'E190'
  };
  // Return mapped code (4 chars max for AWTRIX), or first 4 of raw code, or '?'
  if (types[typeCode]) return types[typeCode];
  if (typeCode) return typeCode.substring(0, 4);
  return '?';
}

// Note: getAirlineCode and enrichFlight are imported from aircraft-db.mjs

/**
 * Detect if flight is commercial airline or private/GA
 * Commercial: 3-letter airline code + numbers (ASA416, UAL123)
 * Private: N-number or other registration format
 */
function detectFlightType(callsign, aircraftType) {
  if (!callsign) return 'unknown';
  const cs = callsign.toUpperCase();
  
  // GA aircraft types are always private
  const gaTypes = ['C172', 'C182', 'C208', 'SR22', 'PC12', 'BE20', 'BE36', 'PA31', 'PA32', 
                   'C56X', 'CL60', 'GLEX', 'GLF4', 'GLF5', 'GLF6', 'FA7X', 'FA8X', 
                   'C25A', 'C25B', 'C25C', 'C680', 'C700', 'C750'];
  if (gaTypes.includes(aircraftType?.toUpperCase())) {
    return 'private';
  }
  
  // US N-numbers are private/GA
  if (/^N[0-9]/.test(cs)) {
    return 'private';
  }
  
  // Canadian C- registrations
  if (/^C-[FG]/.test(cs)) {
    return 'private';
  }
  
  // UK G- registrations
  if (/^G-/.test(cs)) {
    return 'private';
  }
  
  // 3-letter airline prefix + numbers = commercial
  if (/^[A-Z]{3}[0-9]/.test(cs)) {
    return 'commercial';
  }
  
  // 2-letter airline prefix + numbers = commercial
  if (/^[A-Z]{2}[0-9]/.test(cs)) {
    return 'commercial';
  }
  
  return 'unknown';
}

/**
 * Format flight notification
 */
function formatFlight(flight) {
  // Enrich with aircraft database
  const enriched = enrichFlight(flight);
  
  const route = enriched.origin && enriched.destination
    ? `${enriched.origin}→${enriched.destination}`
    : 'UNKNOWN';

  const fullFlightNum = enriched.flightNumber || enriched.callsign || '';
  const airlineCodeRaw = enriched.airlineCode || getAirlineCode(fullFlightNum, enriched.callsign);
  const distNm = enriched.distance ? enriched.distance.toFixed(1) : '?';
  const altKft = enriched.altitude ? (enriched.altitude / 1000).toFixed(1) : '?';
  const speedKt = enriched.speed ? Math.round(enriched.speed) : '?';

  // Use enriched aircraft type - prefer raw type code over name for AWTRIX brevity
  let aircraftType = enriched.aircraftType || '?';
  
  // Detect commercial vs private
  const flightType = detectFlightType(enriched.callsign, enriched.aircraftType);

  return {
    airlineCode: airlineCodeRaw,
    distNm,
    flightType,  // 'commercial', 'private', or 'unknown'
    route,
    altKft,
    speedKt,
    aircraftType,
    enriched  // Pass through for logging/debugging
  };
}

/**
 * Format time in Pacific Time (PT)
 */
function formatPTTime(date) {
  return new Date(date).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) + ' PT';
}

/**
 * Send flight notification to AWTRIX
 * 3-screen sequence: DIST → DEP-ARR → Flight Number
 * Cycles 3 times if flight is within 1.5NM radius
 */
async function notifyFlight(flight, isCloseFlight = false) {
  const { airlineCode, distNm, flightType, route, altKft, speedKt, aircraftType } = formatFlight(flight);

  const typeIcon = flightType === 'private' ? '🚁' : flightType === 'commercial' ? '✈️' : '✈️';
  console.log(`${typeIcon} ${distNm} | ${route} | ${airlineCode} ${aircraftType}`);

  const dur = CONFIG.displayDuration;

  // Extract departure and arrival airports
  const [departure, arrival] = route !== 'UNKNOWN' ? route.split('→') : ['?', '?'];
  
  // Choose distance icon - animated 17777 for commercial, 72581 for private
  const distanceIcon = flightType === 'private' ? 72581 : 17777;
  
  // Build flight number display (airline code + aircraft type)
  const flightNumDisplay = `${airlineCode}${aircraftType}`;
  
  // 3-screen sequence: DIST → DEP-ARR → Flight Number
  const screens = [
    {
      text: distNm,              // "1.2" - Distance (no NM, always implied)
      icon: distanceIcon,        // Animated 17777 (commercial) or 72581 (private)
      color: '#00D9FF',          // Cyan for distance
      duration: dur,
      scroll: false
    },
    {
      text: `${departure}-${arrival}`,  // "SEA-PDX" - Route
      icon: 'plane',                    // Airplane icon
      color: '#FFFFFF',                 // White for route
      duration: dur,
      scroll: false
    },
    {
      text: flightNumDisplay,    // "ASB738" - Airline code + Aircraft type
      icon: 'plane',             // Airplane icon
      color: '#FFD700',          // Gold for flight number
      duration: dur,
      scroll: false
    }
  ];

  // Determine number of cycles: 3 for close flights (< 1.5NM), 1 otherwise
  const cycles = isCloseFlight ? 3 : 1;
  
  // Send screens for each cycle
  for (let cycle = 0; cycle < cycles; cycle++) {
    if (cycle > 0) {
      console.log(`  ↻ Cycle ${cycle + 1}/3 for close flight`);
    }
    for (const screen of screens) {
      await awtrix.send(screen);
      await new Promise(r => setTimeout(r, dur * 1000));
    }
  }
}

/**
 * Main tracker loop
 */
async function run() {
  console.log('🛩️  Flight Tracker Starting...');
  console.log(`📍 Location: ${CONFIG.lat}, ${CONFIG.lon}`);
  console.log(`📡 Radius: ${CONFIG.radiusNm}NM`);
  console.log(`⏱️  Poll: every ${CONFIG.pollIntervalSec}s`);
  console.log(`📝 Log: ${CONFIG.flightsLogPath}\n`);

  // Load flight history
  loadFlightHistory();
  
  // Load aircraft DB stats (triggers lazy load)
  const dbStats = getDBStats();
  console.log(`📚 Aircraft DB: ${dbStats.totalAircraft.toLocaleString()} aircraft`);

  // Check AWTRIX health
  const health = await awtrix.health();
  if (health.status !== 'online') {
    console.error('❌ AWTRIX offline');
    process.exit(1);
  }
  console.log(`✅ AWTRIX connected (${health.ip})`);
  console.log('⏰ Native time app will auto-disable when flights detected\n');

  while (isRunning) {
    try {
      const flights = await fetchFR24Flights(CONFIG.lat, CONFIG.lon, CONFIG.radiusNm);

      if (flights.length === 0) {
        console.log(`[${new Date().toLocaleTimeString()}] No flights`);

        // Clear last flight - zone is empty now
        if (lastFlightCallsign) {
          console.log(`✈️  ${lastFlightCallsign} left the zone\n`);
          // Export final data with completion status
          exportWebData(true);
          // Clear path for next flight
          activeFlightPath = [];
          lastFlightCallsign = null;
          // Record when we last saw a flight
          lastFlightSeen = new Date().toISOString();
          // Re-enable native time app when no flights
          await awtrix.enableNativeApps();
          console.log('⏰ Native time app restored');
        }

        await sleep(CONFIG.pollIntervalSec * 1000);
        continue;
      }

      // Sort by distance, get closest
      flights.sort((a, b) => (a.distance || 999) - (b.distance || 999));
      const closest = flights[0];

      // Track this flight (update history)
      trackFlight(closest);
      
      // Record path snapshot for web export
      recordPathSnapshot(closest);
      
      // Export web data (throttled internally)
      exportWebData(false);

      // Check if flight is within 1.5NM radius (close flight = 3 cycles)
      const isCloseFlight = closest.distance <= 1.5;
      
      // Update last flight seen time
      lastFlightSeen = new Date().toISOString();
      
      // Show flight if NEW, or re-show same flight to keep it visible
      if (closest.callsign !== lastFlightCallsign) {
        console.log(`\n🆕 New flight detected! ${isCloseFlight ? '(Close flight - 3 cycles)' : ''}`);
        // Disable native time app for flight display
        await awtrix.disableTimeApp();
        await notifyFlight(closest, isCloseFlight);
        lastFlightCallsign = closest.callsign;
        lastNotifiedCallsign = closest.callsign;
        // Reset path tracking for new flight
        activeFlightPath = [activeFlightPath[activeFlightPath.length - 1]].filter(Boolean);
      } else {
        // Same flight still overhead - check if we need to cycle again for close flights
        const shouldNotify = !isCloseFlight || cyclesRemaining > 0;
        if (isCloseFlight && cyclesRemaining > 0) {
          cyclesRemaining--;
        }
        console.log(`[${new Date().toLocaleTimeString()}] Overhead: ${closest.callsign} @ ${closest.distance?.toFixed(1)}NM, ${activeFlightPath.length} path snaps ${isCloseFlight ? '(close)' : ''}`);
        if (shouldNotify) {
          await notifyFlight(closest, isCloseFlight && cyclesRemaining >= 0);
        }
      }

    } catch (err) {
      console.error(`Error: ${err.message}`);
    }

    await sleep(CONFIG.pollIntervalSec * 1000);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function shutdown() {
  console.log('\n🛑 Stopping flight tracker...');
  isRunning = false;
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start
run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
