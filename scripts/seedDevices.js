#!/usr/bin/env node
/**
 * scripts/seedDevices.js
 * Simple CLI to seed device data from `utils/samplePayloads.json` into the
 * persistent `data/info.json` via the application's `deviceStore`.
 */

const path = require('path');
const file = path.join(__dirname, '..', 'utils', 'samplePayloads.json');
const deviceStore = require('../models/deviceStore');

function toDeviceState(entry) {
  const p = entry.payload || {};
  const base = {
    deviceId: p.deviceId || `device_${Math.random().toString(36).slice(2,8)}`,
    isBaseStation: p.isBaseStation || false,
    position: p.knownPosition || (p.gps ? { lat: p.gps.lat, lng: p.gps.lng, alt: p.gps.alt } : null),
    velocity: { speed: p.speed || 0 },
    heading: p.heading || 0,
    sensorConfidence: p.confidence || 1.0,
    lastRawSensor: p.sensors || null,
    rssi: Array.isArray(p.rssiReadings) ? p.rssiReadings.reduce((acc, r) => (acc[r.deviceId]=r.rssi, acc), {}) : {},
  };
  return base;
}

function main() {
  let payloads;
  try {
    payloads = require(file);
  } catch (err) {
    console.error('Failed to load sample payloads:', err.message);
    process.exit(1);
  }

  const keys = Object.keys(payloads);
  for (const k of keys) {
    const entry = payloads[k];
    if (!entry || !entry.payload) continue;

    // Only register events or sensor updates that include a deviceId
    const did = entry.payload.deviceId;
    if (!did) continue;

    const state = toDeviceState(entry);
    deviceStore.update(state.deviceId, {
      position: state.position,
      velocity: state.velocity,
      heading: state.heading,
      sensorConfidence: state.sensorConfidence,
      lastRawSensor: state.lastRawSensor,
      isBaseStation: state.isBaseStation,
      rssi: state.rssi,
    });

    console.log('Seeded device:', state.deviceId, 'baseStation=', state.isBaseStation);
  }

  console.log('Seeding complete. Persisted to data/info.json');
}

if (require.main === module) main();
