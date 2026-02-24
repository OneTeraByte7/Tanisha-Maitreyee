/**
 * proximity.service.js
 * Computes pairwise distances between all active devices and
 * identifies dangerous proximity pairs.
 */

const { SAFETY_DISTANCE_METERS, WARNING_DISTANCE_METERS } = require('../config/app.config');
const { getActiveDevices, distanceBetween } = require('./positioning.service');

/**
 * Scan all active device pairs and return proximity results.
 * @returns {Array} Array of proximity events:
 *   { deviceA, deviceB, distanceM, severity: 'safe' | 'warning' | 'collision' }
 */
function scanProximity() {
  const devices = getActiveDevices();
  const results = [];

  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      const a = devices[i];
      const b = devices[j];
      const distM = distanceBetween(a, b);

      let severity = 'safe';
      if (distM < SAFETY_DISTANCE_METERS)   severity = 'collision';
      else if (distM < WARNING_DISTANCE_METERS) severity = 'warning';

      // Only emit non-safe events to reduce noise
      if (severity !== 'safe') {
        results.push({
          deviceA:   a.deviceId,
          deviceB:   b.deviceId,
          distanceM: Math.round(distM * 100) / 100,
          severity,
        });
      }
    }
  }

  return results;
}

/**
 * Get proximity info for a specific device vs all others.
 * @param {string} deviceId
 * @returns {Array} proximity events involving this device
 */
function scanProximityForDevice(deviceId) {
  return scanProximity().filter(
    e => e.deviceA === deviceId || e.deviceB === deviceId
  );
}

module.exports = { scanProximity, scanProximityForDevice };
