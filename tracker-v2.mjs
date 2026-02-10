#!/usr/bin/env node
/**
 * Flight Tracker v2 - AWTRIX Custom App
 *
 * Uses /api/custom?name=flight for smooth in-place updates (no blanking).
 * 3-screen rotation with visual effects: proximity colors, progress bars,
 * gradients, rainbow text, and push icons.
 *
 * Run: node tracker-v2.mjs
 * Revert: node tracker.mjs (original unchanged)
 */

import { fetchFR24Flights } from './api-fr24.mjs';
import * as awtrix from './channel.mjs';
import { enrichFlight, getAircraftName, getAirlineCode, getDBStats } from './aircraft-db.mjs';
import fs from 'fs';
import path from 'path';

const CONFIG = {
  lat: parseFloat(process.env.TRACKER_LAT) || 40.748817,   // Default: Empire State Building
  lon: parseFloat(process.env.TRACKER_LON) || -73.985428,
  radiusNm: parseFloat(process.env.TRACKER_RADIUS_NM) || 0.70,   // Tightened from 1.5NM
  pollIntervalSec: parseInt(process.env.POLL_INTERVAL) || 10,
  screenDurationMs: 4000,    // 4 seconds per screen
  flightsLogPath: process.env.FLIGHTS_LOG_PATH || './flights.json',
  webExportPath: process.env.WEB_EXPORT_PATH || './flights-web.json',
  appName: 'flight'          // AWTRIX custom app name
};

let lastFlightCallsign = null;
let isRunning = true;
let flightHistory = new Map();
let activeFlightPath = [];
let lastWebExport = 0;
let lastFlightSeen = null;
let screenRotationTimer = null;
let currentScreenIndex = 0;
let latestFlightData = null;  // Latest formatted flight data for screen rotation

// ============================================================================
// Flight data helpers (same logic as tracker.mjs)
// ============================================================================

function getBestCallsign(flight) {
  const callsign = flight.callsign?.trim().toUpperCase();
  const registration = flight.registration?.trim().toUpperCase();
  const aircraftType = flight.aircraftType?.trim().toUpperCase();

  const isValid = (cs) => {
    if (!cs || cs.length < 3) return false;
    if (!/^[A-Z]/.test(cs)) return false;
    if (/^\d+$/.test(cs)) return false;
    if (aircraftType && cs === aircraftType) return false;
    const badTypes = ['PC12', 'DA42', 'DA62', 'PA28', 'PA32', 'C172', 'C182', 'C206', 'C210', 'C310', 'C414', 'C421', 'BE36', 'BE58', 'BE20', 'SR20', 'SR22', 'C25A', 'C25B', 'C56X', 'E50P', 'E55P', 'FA50', 'G100', 'G200', 'TBM7', 'TBM8', 'TBM9'];
    if (badTypes.includes(cs)) return false;
    return true;
  };

  const isValidReg = (reg) => reg && /^N[0-9A-Z]+$/.test(reg);

  if (isValid(callsign)) return callsign;
  if (isValidReg(registration)) return registration;
  return callsign || registration || 'UNKNOWN';
}

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

function saveFlightHistory() {
  try {
    const data = Array.from(flightHistory.values());
    fs.writeFileSync(CONFIG.flightsLogPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving flight history:', err.message);
  }
}

function exportWebData(flightJustLeft = false) {
  const now = Date.now();
  if (!flightJustLeft && now - lastWebExport < 5000) return;
  lastWebExport = now;

  try {
    let closestFlight = null;
    let minDistance = Infinity;

    if (activeFlightPath.length > 0) {
      for (const snapshot of activeFlightPath) {
        if (snapshot.distance < minDistance) {
          minDistance = snapshot.distance;
          closestFlight = snapshot;
        }
      }
    }

    if (!closestFlight && flightHistory.size > 0) {
      for (const f of flightHistory.values()) {
        if (f.closestDistance < minDistance) {
          minDistance = f.closestDistance;
          closestFlight = {
            distance: f.closestDistance,
            altitude: f.closestAltitude,
            lat: CONFIG.lat,
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
      fs.writeFileSync(CONFIG.webExportPath, JSON.stringify({
        status: 'waiting',
        message: 'No flights detected yet',
        timestamp: new Date().toISOString()
      }, null, 2));
      return;
    }

    const overheadScore = closestFlight.distance;
    const isOverhead = overheadScore < 1.0;
    const precision = activeFlightPath.length >= 3 ? 'high' :
                      activeFlightPath.length > 0 ? 'tracked' : 'estimated';
    const closestSnapshot = activeFlightPath.find(s => s.distance === closestFlight.distance);
    const speed = closestSnapshot?.speed || closestFlight.speed || 0;
    const aircraftType = closestSnapshot?.aircraftName ||
                         closestSnapshot?.aircraftType ||
                         closestFlight.aircraftType ||
                         closestFlight.type || null;

    const bestCallsign = getBestCallsign({
      callsign: closestFlight.callsign,
      registration: closestFlight.registration,
      aircraftType: aircraftType
    });
    if (bestCallsign !== closestFlight.callsign) {
      closestFlight.callsign = bestCallsign;
    }

    const historyEntry = flightHistory.get(closestFlight.callsign);
    const firstSeen = historyEntry?.firstSeen || closestFlight.timestamp || new Date().toISOString();

    const webData = {
      closestApproach: {
        distance: Math.round(closestFlight.distance * 100) / 100,
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

function trackFlight(flight) {
  const bestCallsign = getBestCallsign(flight);
  if (bestCallsign !== flight.callsign) {
    console.log(`📝 Fixed callsign: ${flight.callsign || '(empty)'} → ${bestCallsign}`);
    flight.callsign = bestCallsign;
  }

  const existing = flightHistory.get(flight.callsign);
  const now = new Date().toISOString();

  if (existing) {
    existing.lastSeen = now;
    existing.duration = Math.round((new Date(now) - new Date(existing.firstSeen)) / 1000);
    if (flight.distance < existing.closestDistance) {
      existing.closestDistance = flight.distance;
      existing.closestAltitude = flight.altitude;
      existing.closestSpeed = flight.speed;
    }
    if (flight.origin && !existing.origin) existing.origin = flight.origin;
    if (flight.destination && !existing.destination) existing.destination = flight.destination;
    if (flight.flightNumber && !existing.flightNumber) existing.flightNumber = flight.flightNumber;
    if (flight.aircraftType && !existing.aircraftType) existing.aircraftType = flight.aircraftType;
    if (flight.icao && !existing.icao) existing.icao = flight.icao;
    if (flight.registration && !existing.registration) existing.registration = flight.registration;
  } else {
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

function recordPathSnapshot(flight) {
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

  if (activeFlightPath.length > 100) {
    activeFlightPath.shift();
  }
}

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
  if (types[typeCode]) return types[typeCode];
  if (typeCode) return typeCode.substring(0, 4);
  return '?';
}

function detectFlightType(callsign, aircraftType) {
  if (!callsign) return 'unknown';
  const cs = callsign.toUpperCase();

  const gaTypes = ['C172', 'C182', 'C208', 'SR22', 'PC12', 'BE20', 'BE36', 'PA31', 'PA32',
                   'C56X', 'CL60', 'GLEX', 'GLF4', 'GLF5', 'GLF6', 'FA7X', 'FA8X',
                   'C25A', 'C25B', 'C25C', 'C680', 'C700', 'C750'];
  if (gaTypes.includes(aircraftType?.toUpperCase())) return 'private';
  if (/^N[0-9]/.test(cs)) return 'private';
  if (/^C-[FG]/.test(cs)) return 'private';
  if (/^G-/.test(cs)) return 'private';
  if (/^[A-Z]{3}[0-9]/.test(cs)) return 'commercial';
  if (/^[A-Z]{2}[0-9]/.test(cs)) return 'commercial';
  return 'unknown';
}

function formatFlight(flight) {
  const enriched = enrichFlight(flight);

  const route = enriched.origin && enriched.destination
    ? `${enriched.origin}→${enriched.destination}`
    : 'UNKNOWN';

  const fullFlightNum = enriched.flightNumber || enriched.callsign || '';
  const airlineCodeRaw = enriched.airlineCode || getAirlineCode(fullFlightNum, enriched.callsign);
  const distNm = enriched.distance ? enriched.distance.toFixed(1) : '?';
  const altKft = enriched.altitude ? (enriched.altitude / 1000).toFixed(1) : '?';
  const speedKt = enriched.speed ? Math.round(enriched.speed) : '?';
  let aircraftType = enriched.aircraftType || '?';
  const flightType = detectFlightType(enriched.callsign, enriched.aircraftType);

  return {
    airlineCode: airlineCodeRaw,
    distNm,
    distanceRaw: enriched.distance || 0,
    flightType,
    route,
    altKft,
    speedKt,
    aircraftType,
    enriched
  };
}

// ============================================================================
// Proximity color + progress helpers
// ============================================================================

/**
 * Get color based on proximity (for v2 enhanced display)
 * Returns hex string for AWTRIX
 */
function getProximityColor(distanceNm) {
  const r = CONFIG.radiusNm;
  if (distanceNm < r * 0.43) return '#FF0000';    // Red - very close
  if (distanceNm < r * 0.71) return '#FFA500';    // Orange - close
  return '#00D9FF';                                 // Cyan - in zone
}

/**
 * Get proximity color as RGB array for progress bar
 */
function getProximityColorRGB(distanceNm) {
  const r = CONFIG.radiusNm;
  if (distanceNm < r * 0.43) return [255, 0, 0];
  if (distanceNm < r * 0.71) return [255, 165, 0];
  return [0, 217, 255];
}

/**
 * Calculate progress bar value from distance
 * radiusNm → 0%, 0NM → 100%
 */
function getProximityProgress(distanceNm) {
  const clamped = Math.max(0, Math.min(CONFIG.radiusNm, distanceNm));
  return Math.round((1 - clamped / CONFIG.radiusNm) * 100);
}

// ============================================================================
// Screen builders (3 screens with visual effects)
// ============================================================================

function buildScreen1_Distance(data) {
  const icon = data.flightType === 'private' ? 'helicopter' : 'plane';
  return {
    text: data.distNm,
    icon: icon,
    pushIcon: 2,                                    // Icon bounces in
    color: getProximityColor(data.distanceRaw),
    progress: getProximityProgress(data.distanceRaw),
    progressC: getProximityColorRGB(data.distanceRaw),
    progressBC: [30, 30, 30],
    noScroll: true,
    lifetime: 30
  };
}

function buildScreen2_Route(data) {
  const [departure, arrival] = data.route !== 'UNKNOWN'
    ? data.route.split('→')
    : ['?', '?'];
  return {
    text: `${departure}-${arrival}`,
    pushIcon: 1,                                     // Icon slides with text
    gradient: ['#00D9FF', '#FFD700'],                // Cyan-to-gold gradient
    noScroll: true,
    lifetime: 30
  };
}

function buildScreen3_FlightID(data) {
  const icon = data.flightType === 'private' ? 'helicopter' : 'plane';
  const isCommercial = data.flightType === 'commercial';
  return {
    text: `${data.airlineCode}${data.aircraftType}`,
    icon: icon,
    pushIcon: 2,                                     // Icon bounces in
    ...(isCommercial ? { rainbow: true } : { color: '#FFD700' }),
    noScroll: true,
    lifetime: 30
  };
}

// ============================================================================
// Screen rotation engine
// ============================================================================

function startScreenRotation(data) {
  // Store latest data so rotation always uses fresh info
  latestFlightData = data;
  currentScreenIndex = 0;

  // If already rotating, just update data — timer continues
  if (screenRotationTimer) return;

  // Send first screen immediately
  sendCurrentScreen();

  // Rotate every 4 seconds
  screenRotationTimer = setInterval(() => {
    currentScreenIndex = (currentScreenIndex + 1) % 3;
    sendCurrentScreen();
  }, CONFIG.screenDurationMs);
}

async function sendCurrentScreen() {
  if (!latestFlightData) return;

  const builders = [buildScreen1_Distance, buildScreen2_Route, buildScreen3_FlightID];
  const payload = builders[currentScreenIndex](latestFlightData);

  const result = await awtrix.sendApp(CONFIG.appName, payload);
  if (!result.success) {
    console.error(`  ⚠️ Screen ${currentScreenIndex + 1} send failed: ${result.error}`);
  }
}

async function stopScreenRotation() {
  if (screenRotationTimer) {
    clearInterval(screenRotationTimer);
    screenRotationTimer = null;
  }
  latestFlightData = null;
  currentScreenIndex = 0;
  await awtrix.clearApp(CONFIG.appName);
}

// ============================================================================
// Main loop
// ============================================================================

async function run() {
  console.log('🛩️  Flight Tracker v2 Starting...');
  console.log(`📍 Location: ${CONFIG.lat}, ${CONFIG.lon}`);
  console.log(`📡 Radius: ${CONFIG.radiusNm}NM (tightened)`);
  console.log(`⏱️  Poll: every ${CONFIG.pollIntervalSec}s`);
  console.log(`🖥️  Mode: Custom app (smooth transitions)`);
  console.log(`📝 Log: ${CONFIG.flightsLogPath}\n`);

  loadFlightHistory();

  const dbStats = getDBStats();
  console.log(`📚 Aircraft DB: ${dbStats.totalAircraft.toLocaleString()} aircraft`);

  const health = await awtrix.health();
  if (health.status !== 'online') {
    console.error('❌ AWTRIX offline');
    process.exit(1);
  }
  console.log(`✅ AWTRIX connected (${health.ip})`);
  console.log('🌑 Disabling native apps (User preference: permanent off)\n');
  await awtrix.disableNativeApps();

  while (isRunning) {
    try {
      const flights = await fetchFR24Flights(CONFIG.lat, CONFIG.lon, CONFIG.radiusNm);

      if (flights.length === 0) {
        console.log(`[${new Date().toLocaleTimeString()}] No flights`);

        if (lastFlightCallsign) {
          console.log(`✈️  ${lastFlightCallsign} left the zone\n`);
          exportWebData(true);
          activeFlightPath = [];
          lastFlightCallsign = null;
          lastFlightSeen = new Date().toISOString();

          // Stop rotation and clear display
          await stopScreenRotation();
          await awtrix.disableNativeApps();
          console.log('🌑 Zone clear (Display kept dark)');
        }

        await sleep(CONFIG.pollIntervalSec * 1000);
        continue;
      }

      // Sort by distance, get closest
      flights.sort((a, b) => (a.distance || 999) - (b.distance || 999));
      const closest = flights[0];

      trackFlight(closest);
      recordPathSnapshot(closest);
      exportWebData(false);

      const isCloseFlight = closest.distance <= CONFIG.radiusNm;
      lastFlightSeen = new Date().toISOString();

      if (!isCloseFlight) {
        console.log(`[${new Date().toLocaleTimeString()}] Flight too far: ${closest.callsign} @ ${closest.distance?.toFixed(2)}NM (skip, need ≤${CONFIG.radiusNm})`);

        // If we were tracking a flight that moved out of range
        if (lastFlightCallsign) {
          console.log(`✈️  ${lastFlightCallsign} left the tight zone\n`);
          exportWebData(true);
          activeFlightPath = [];
          lastFlightCallsign = null;
          await stopScreenRotation();
          await awtrix.disableNativeApps();
          console.log('🌑 Zone clear (Display kept dark)');
        }

        await sleep(CONFIG.pollIntervalSec * 1000);
        continue;
      }

      // Close flight detected — format and start/update rotation
      const data = formatFlight(closest);
      const typeIcon = data.flightType === 'private' ? '🚁' : '✈️';

      if (closest.callsign !== lastFlightCallsign) {
        console.log(`\n🆕 New close flight! ${typeIcon} ${data.distNm}NM | ${data.route} | ${data.airlineCode}${data.aircraftType}`);
        lastFlightCallsign = closest.callsign;
        activeFlightPath = [activeFlightPath[activeFlightPath.length - 1]].filter(Boolean);
      } else {
        console.log(`[${new Date().toLocaleTimeString()}] Overhead: ${closest.callsign} @ ${closest.distance?.toFixed(2)}NM, ${activeFlightPath.length} snaps`);
      }

      // Start or update screen rotation with latest data
      startScreenRotation(data);

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
  console.log('\n🛑 Stopping flight tracker v2...');
  isRunning = false;
  await stopScreenRotation();
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
