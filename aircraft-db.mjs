#!/usr/bin/env node
/**
 * Aircraft Database Enrichment
 * Uses OpenSky aircraft database (520k+ aircraft)
 */

import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Load full aircraft database (520k+ entries)
let FULL_DB = null;
let DB_LOADED = false;

// Type code → friendly name
const TYPE_NAMES = {
  'A319': 'A319', 'A320': 'A320', 'A321': 'A321',
  'A332': 'A330', 'A333': 'A330', 'A359': 'A350', 'A35K': 'A350',
  'A388': 'A380',
  'A20N': 'A320', 'A21N': 'A321',
  'B38M': '737 MAX', 'B738': '737', 'B739': '737',
  'B752': '757', 'B763': '767', 'B772': '777', 'B773': '777', 'B77W': '777',
  'B788': '787', 'B789': '787', 'B78X': '787',
  'B744': '747', 'B748': '747',
  'E75L': 'E175', 'E75S': 'E175', 'E190': 'E190', 'E195': 'E195',
  'CRJ2': 'CRJ', 'CRJ7': 'CRJ', 'CRJ9': 'CRJ',
  'C172': 'C172', 'C182': 'C182', 'C208': 'Caravan',
  'C56X': 'Citation', 'CL60': 'Challenger', 'GLEX': 'Global',
  'PC12': 'PC-12', 'SR22': 'SR22', 'BE20': 'King Air',
  'GLF4': 'Gulfstream', 'GLF5': 'Gulfstream', 'GLF6': 'Gulfstream',
  'FA7X': 'Falcon', 'FA8X': 'Falcon',
  'B190': 'Beech 1900', 'SW4': 'Metroliner',
  'DH8A': 'Dash 8', 'DH8B': 'Dash 8', 'DH8C': 'Dash 8', 'DH8D': 'Dash 8 Q400',
  'AT75': 'ATR-72', 'AT76': 'ATR-72',
  'BE36': 'Bonanza', 'PA31': 'Navajo', 'PA32': 'Cherokee',
  'C25A': 'Citation', 'C25B': 'Citation', 'C25C': 'Citation',
  'C680': 'Citation', 'C700': 'Citation', 'C750': 'Citation',
};

// Airline codes by callsign prefix
const AIRLINE_CODES = {
  'UAL': 'UA', 'AAL': 'AA', 'DAL': 'DL', 'SWA': 'WN',
  'ASA': 'AS', 'JBU': 'B6', 'FFT': 'F9', 'NKS': 'NK',
  'SKW': 'OO', 'ENY': 'MQ', 'RPA': 'YX', 'EDV': '9E',
  'AAY': 'G4', 'BAW': 'BA', 'VIR': 'VS', 'AFR': 'AF',
  'DLH': 'LH', 'KLM': 'KL', 'ACA': 'AC', 'QFA': 'QF',
  'CPA': 'CX', 'JAL': 'JL', 'ANA': 'NH', 'CES': 'MU',
  'CSN': 'CZ', 'ETH': 'ET', 'UAE': 'EK', 'QTR': 'QR',
  'BA': 'BA', 'LH': 'LH', 'AF': 'AF', 'KL': 'KL',
  'UAL': 'UA', 'GTI': '5Y', 'ATN': '8C', 'FDX': 'FX',
  'UPS': '5X', 'DHL': 'D0', 'ABX': 'GB',
};

/**
 * Load full aircraft database
 */
function loadFullDB() {
  if (DB_LOADED) return FULL_DB;
  
  try {
    const dbPath = new URL('./aircraft_db.json', import.meta.url);
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      FULL_DB = JSON.parse(data);
      DB_LOADED = true;
      console.log(`📚 Loaded ${Object.keys(FULL_DB).length.toLocaleString()} aircraft from database`);
    }
  } catch (e) {
    console.error('⚠️  Could not load full aircraft DB:', e.message);
    FULL_DB = {};
    DB_LOADED = true;
  }
  
  return FULL_DB;
}

/**
 * Lookup aircraft by ICAO 24-bit address
 */
export function lookupByICAO(icao) {
  if (!icao) return null;
  
  const hex = icao.toLowerCase().trim();
  const db = loadFullDB();
  
  const entry = db[hex];
  if (entry) {
    return {
      type: entry.typecode,
      registration: entry.reg,
      manufacturer: entry.manufacturer,
      model: entry.model
    };
  }
  
  return null;
}

/**
 * Get friendly aircraft name from type code
 */
export function getAircraftName(typeCode) {
  if (!typeCode) return null;
  const code = typeCode.toUpperCase().trim();
  return TYPE_NAMES[code] || code;
}

/**
 * Get airline code from callsign
 */
export function getAirlineCode(callsign) {
  if (!callsign) return null;
  const cs = callsign.toUpperCase().trim();
  
  // Check full callsign match
  for (const [prefix, code] of Object.entries(AIRLINE_CODES)) {
    if (cs.startsWith(prefix)) {
      return code;
    }
  }
  
  // Extract 2-3 letter prefix as fallback
  const match = cs.match(/^([A-Z]{2,3})/);
  return match ? match[1] : cs.slice(0, 3);
}

/**
 * Enrich flight data with aircraft details
 */
export function enrichFlight(flight) {
  if (!flight) return flight;
  
  const enriched = { ...flight };
  
  // Try ICAO lookup first (most accurate)
  if (flight.icao) {
    const icaoInfo = lookupByICAO(flight.icao);
    if (icaoInfo) {
      enriched.aircraftType = flight.aircraftType || icaoInfo.type;
      enriched.registration = icaoInfo.registration || flight.registration;
      enriched.manufacturer = icaoInfo.manufacturer;
      enriched.model = icaoInfo.model;
    }
  }
  
  // Get aircraft name from type code
  if (enriched.aircraftType) {
    enriched.aircraftName = getAircraftName(enriched.aircraftType);
  }
  
  // Get airline code
  if (flight.callsign || flight.flightNumber) {
    enriched.airlineCode = getAirlineCode(flight.callsign || flight.flightNumber);
  }
  
  return enriched;
}

/**
 * Export database stats
 */
export function getDBStats() {
  const db = loadFullDB();
  return {
    totalAircraft: Object.keys(db).length,
    typeCodes: Object.keys(TYPE_NAMES).length
  };
}
