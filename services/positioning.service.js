/**
 * positioning.service.js
 * Maintains and updates per-device position using dead reckoning and GPS fallback.
 * Also handles indoor trilateration from RSSI beacons.
 */

const config = require('../config/config');
const deviceStore = require('../models/deviceStore');

/**
 * DeviceState shape:
 * {
 *   deviceId, lat, lng, altitudeM, heading, speedMps,
 *   lastUpdate (timestamp ms), isBaseStation, confidence,
 *   indoorPosition: { x, y } | null
 * }
 */

// ── Utility: Haversine distance (meters) between two lat/lng points ───────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Dead reckoning: advance position by (speed, heading, dt).
 * @param {number} lat - current latitude
 * @param {number} lng - current longitude
 * @param {number} heading - degrees from North
 * @param {number} speedMps - speed in m/s
 * @param {number} dtMs - elapsed time in milliseconds
 * @returns {{ lat, lng }}
 */
function deadReckon(lat, lng, heading, speedMps, dtMs) {
  const dtS = dtMs / 1000;
  const distM = speedMps * dtS;
  const R = 6371000;
  const headingRad = (heading * Math.PI) / 180;

  const newLat = lat + (distM / R) * (180 / Math.PI) * Math.cos(headingRad);
  const newLng =
    lng +
    ((distM / R) * (180 / Math.PI) * Math.sin(headingRad)) /
      Math.cos((lat * Math.PI) / 180);

  return { lat: newLat, lng: newLng };
}

/**
 * Convert RSSI to estimated distance in meters using log-distance path loss model.
 * @param {number} rssi - received signal strength (negative dBm)
 * @returns {number} estimated distance in meters
 */
function rssiToDistance(rssi) {
  const ref = config.INDOOR?.RSSI_MEASURED_AT_1M ?? -40;
  const n = config.INDOOR?.RSSI_PATH_LOSS_EXPONENT ?? 2.0;
  return Math.pow(10, (ref - rssi) / (10 * n));
}

/**
 * 2D trilateration from 3 beacons: returns { x, y } in relative meters.
 * Uses algebraic least-squares approach.
 * @param {Array} beacons - [{ x, y, dist }, { x, y, dist }, { x, y, dist }]
 * @returns {{ x, y } | null}
 */
function trilaterate(beacons) {
  if (beacons.length < 3) return null;

  const [A, B, C] = beacons;
  // Translate so A is origin
  const ex = [(B.x - A.x), (B.y - A.y)];
  const d  = Math.sqrt(ex[0] ** 2 + ex[1] ** 2);
  if (d === 0) return null;

  const i  = [(C.x - A.x) * ex[0] + (C.y - A.y) * ex[1]] / d;
  const ey = [
    (C.x - A.x) - i * ex[0] / d,
    (C.y - A.y) - i * ex[1] / d,
  ];
  const j  = Math.sqrt(ey[0] ** 2 + ey[1] ** 2);
  if (j === 0) return null;

  const x = (A.dist ** 2 - B.dist ** 2 + d ** 2) / (2 * d);
  const y = (A.dist ** 2 - C.dist ** 2 + i ** 2 + j ** 2 - 2 * i * x) / (2 * j);

  return {
    x: A.x + x * (ex[0] / d) + y * (ey[0] / j),
    y: A.y + x * (ex[1] / d) + y * (ey[1] / j),
  };
}

/**
 * Update or create a device's position state.
 * @param {string} deviceId
 * @param {object} payload - incoming sensor/location data
 * @param {object} fusedState - output from sensorFusion.service
 * @returns {object} updated DeviceState
 */
function updateDevicePosition(deviceId, payload, fusedState) {
  const now = Date.now();
  const existing = deviceStore.get(deviceId) || {};

  let lat = existing?.lat ?? payload.gps?.lat ?? 0;
  let lng = existing?.lng ?? payload.gps?.lng ?? 0;

  if (fusedState.shouldUseGPS && payload.gps) {
    // GPS is authoritative when sensor confidence is low
    lat = payload.gps.lat;
    lng = payload.gps.lng;
  } else if (existing) {
    // Dead reckoning from previous position
    const dt = now - existing.lastUpdate;
    const pos = deadReckon(lat, lng, fusedState.heading, fusedState.speed, dt);
    lat = pos.lat;
    lng = pos.lng;
  }

  // Indoor positioning via RSSI beacons
  let indoorPosition = null;
  if (payload.rssiBeacons && payload.rssiBeacons.length >= 3) {
    const beaconsWithDist = payload.rssiBeacons.map(b => ({
      x:    b.position.x,
      y:    b.position.y,
      dist: rssiToDistance(b.rssi),
    }));
    indoorPosition = trilaterate(beaconsWithDist);
  }

  const state = {
    deviceId,
    lat,
    lng,
    heading:       fusedState.heading,
    speedMps:      fusedState.speed,
    confidence:    fusedState.confidence,
    lastUpdate:    now,
    isBaseStation: payload.isBaseStation ?? false,
    indoorPosition,
  };

  // Persist via deviceStore (this will also save to disk)
  const persisted = deviceStore.update(deviceId, state);
  return persisted;
}

/**
 * Get all currently active devices (prune stale ones first).
 * @returns {Array<DeviceState>}
 */
function getActiveDevices() {
  // deviceStore handles pruning; return all active devices
  return deviceStore.getAll();
}

/** Get a single device state by ID */
function getDevice(deviceId) {
  return deviceStore.get(deviceId) || null;
}

/** Remove a device from the map */
function removeDevice(deviceId) {
  deviceStore.remove(deviceId);
}

/** Euclidean distance between two devices in meters (uses lat/lng Haversine) */
function distanceBetween(stateA, stateB) {
  return haversineDistance(stateA.lat, stateA.lng, stateB.lat, stateB.lng);
}

module.exports = {
  updateDevicePosition,
  getActiveDevices,
  getDevice,
  removeDevice,
  distanceBetween,
};
