#!/usr/bin/env node
/**
 * Enrich flight history with aircraft types
 * Uses multiple strategies: FR24 API lookup, callsign patterns, airline defaults
 */

import fs from 'fs';
import path from 'path';

const FLIGHTS_PATH = process.env.FLIGHTS_LOG_PATH || './flights.json';

// Common aircraft types by airline (based on typical fleet composition)
const AIRLINE_FLEET_DEFAULTS = {
  'AA': 'A321',      // American - mostly A321s for domestic
  'AS': 'B739',      // Alaska - mostly 737-900s  
  'DL': 'B739',      // Delta - mixed fleet, 739 common
  'UA': 'B738',      // United - mixed fleet, 738 common
  'WN': 'B738',      // Southwest - all 737s
  'B6': 'A320',      // JetBlue - mostly A320s
  'F9': 'A320',      // Frontier - all A320 family
  'NK': 'A320',      // Spirit - all A320 family
  'OO': 'E75L',      // SkyWest - lots of E175s
  'MQ': 'E75L',      // Envoy - lots of E175s
  'YX': 'E75L',      // Republic - lots of E175s
  '9E': 'CRJ9',      // Endeavor - lots of CRJ900s
  'G4': 'A320',      // Allegiant - mostly A320s
  'FX': 'B763',      // FedEx - lots of 767 freighters
  '5X': 'B763',      // UPS - lots of 767 freighters
  '8C': 'B763',      // ATN - lots of 767 freighters
  'SY': 'B738',      // Sun Country - 737s
  'WN': 'B738',      // Southwest - 737s
  'BA': 'B772',      // British Airways - long haul
  'LH': 'A333',      // Lufthansa - A330s common
  'AF': 'A333',      // Air France - A330s common
  'KL': 'B772',      // KLM - 777s
  'AC': 'A320',      // Air Canada - A320s domestic
  'VS': 'A35K',      // Virgin Atlantic - A350s
  'EK': 'A388',      // Emirates - A380s
  'QR': 'A35K',      // Qatar - A350s
  'JL': 'B789',      // JAL - 787s
  'NH': 'B789',      // ANA - 787s
};

// Aircraft type hints from callsign patterns
const CALLSIGN_PATTERNS = {
  // Cargo
  '^FDX': 'B763',    // FedEx
  '^UPS': 'B763',    // UPS  
  '^ATN': 'B763',    // Air Transport International
  '^GTI': 'B748',    // Atlas Air (747s common)
  '^ABX': 'B763',    // ABX Air
  '^DHL': 'B752',    // DHL
  
  // Regional
  '^SKW': 'E75L',    // SkyWest
  '^ENY': 'E75L',    // Envoy
  '^RPA': 'E75L',    // Republic
  '^EDV': 'CRJ9',    // Endeavor
  '^QXE': 'E75L',    // Horizon (Alaska regional)
  
  // Charter/Cargo
  '^SCX': 'B738',    // Sun Country
  '^AMF': 'BE99',    // Ameriflight (Beech 1900s)
  
  // Private/GA - N-numbers
  '^N[0-9]': 'GA',   // US registered
  
  // Volaris
  '^VOI': 'A320',    // Volaris
};

/**
 * Guess aircraft type from callsign pattern
 */
function guessFromCallsign(callsign) {
  if (!callsign) return null;
  const cs = callsign.toUpperCase();
  
  for (const [pattern, type] of Object.entries(CALLSIGN_PATTERNS)) {
    const regex = new RegExp(pattern);
    if (regex.test(cs)) {
      return type;
    }
  }
  
  return null;
}

/**
 * Extract airline code from flight number
 */
function getAirlineFromFlightNumber(flightNum) {
  if (!flightNum) return null;
  const match = flightNum.match(/^([A-Z0-9]{2})/);
  return match ? match[1] : null;
}

/**
 * Guess aircraft type from airline fleet defaults
 */
function guessFromAirline(flightNumber) {
  const airline = getAirlineFromFlightNumber(flightNumber);
  if (!airline) return null;
  return AIRLINE_FLEET_DEFAULTS[airline] || null;
}

/**
 * Smart aircraft type inference
 */
function inferAircraftType(flight) {
  // 1. Try callsign pattern matching (most specific)
  const fromCallsign = guessFromCallsign(flight.callsign);
  if (fromCallsign) return fromCallsign;
  
  // 2. Try airline fleet defaults
  const fromAirline = guessFromAirline(flight.flightNumber);
  if (fromAirline) return fromAirline;
  
  // 3. Check if it's a GA/private flight
  if (flight.callsign && /^N[0-9]/.test(flight.callsign)) {
    return 'GA'; // General Aviation - unknown type
  }
  
  return null;
}

/**
 * Enrich a single flight record
 */
function enrichFlight(flight) {
  const enriched = { ...flight };
  
  // Only enrich if aircraftType is missing
  if (!enriched.aircraftType) {
    const inferred = inferAircraftType(flight);
    if (inferred) {
      enriched.aircraftType = inferred;
      enriched._enriched = true;
      enriched._enrichMethod = 'inferred';
    }
  }
  
  return enriched;
}

/**
 * Load and enrich flight history
 */
function enrichHistory() {
  console.log('🔍 Enriching flight history...\n');
  
  if (!fs.existsSync(FLIGHTS_PATH)) {
    console.error('❌ Flights file not found:', FLIGHTS_PATH);
    process.exit(1);
  }
  
  const flights = JSON.parse(fs.readFileSync(FLIGHTS_PATH, 'utf8'));
  console.log(`📚 Loaded ${flights.length} flights`);
  
  let enriched = 0;
  let alreadyHadType = 0;
  let stillMissing = 0;
  
  const enrichedFlights = flights.map(flight => {
    if (flight.aircraftType) {
      alreadyHadType++;
      return flight;
    }
    
    const result = enrichFlight(flight);
    if (result._enriched) {
      enriched++;
      console.log(`✅ ${flight.callsign} → ${result.aircraftType} (${flight.flightNumber || 'no flight#'})`);
    } else {
      stillMissing++;
      console.log(`❓ ${flight.callsign} - could not infer type (${flight.flightNumber || 'no flight#'})`);
    }
    return result;
  });
  
  // Save enriched data
  fs.writeFileSync(FLIGHTS_PATH, JSON.stringify(enrichedFlights, null, 2));
  
  console.log(`\n📊 Results:`);
  console.log(`   Already had type: ${alreadyHadType}`);
  console.log(`   Enriched: ${enriched}`);
  console.log(`   Still missing: ${stillMissing}`);
  console.log(`\n💾 Saved to ${FLIGHTS_PATH}`);
}

// Run enrichment
enrichHistory();
