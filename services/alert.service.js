/**
 * alert.service.js
 * Generates and emits alert events based on proximity and speed checks.
 * Maintains a short-term deduplication window to avoid alert spam.
 */

const { MAX_SAFE_SPEED_MPS } = require('../config/app.config');

// Alert deduplication: key -> last emitted timestamp
const recentAlerts = new Map();
const DEDUP_WINDOW_MS = 3000; // don't re-emit same alert within 3 seconds

/**
 * Deduplicate an alert key.
 * @param {string} key - unique alert identifier
 * @returns {boolean} true if alert should be emitted
 */
function shouldEmit(key) {
  const last = recentAlerts.get(key);
  const now = Date.now();
  if (!last || now - last > DEDUP_WINDOW_MS) {
    recentAlerts.set(key, now);
    return true;
  }
  return false;
}

/**
 * Build alert objects from proximity scan results.
 * @param {Array} proximityEvents - output of proximity.service.scanProximity()
 * @returns {Array} alert payloads to broadcast
 */
function buildProximityAlerts(proximityEvents) {
  const alerts = [];

  for (const event of proximityEvents) {
    const key = `proximity:${[event.deviceA, event.deviceB].sort().join(':')}`;
    if (!shouldEmit(key)) continue;

    alerts.push({
      type:      event.severity === 'collision' ? 'COLLISION_WARNING' : 'PROXIMITY_WARNING',
      severity:  event.severity,
      deviceA:   event.deviceA,
      deviceB:   event.deviceB,
      distanceM: event.distanceM,
      message:
        event.severity === 'collision'
          ? `⚠️ COLLISION RISK: Devices ${event.deviceA} and ${event.deviceB} are ${event.distanceM}m apart!`
          : `⚡ WARNING: Devices ${event.deviceA} and ${event.deviceB} are within ${event.distanceM}m`,
      timestamp: new Date().toISOString(),
    });
  }

  return alerts;
}

/**
 * Check if a device's speed exceeds the safe threshold.
 * @param {object} deviceState - from positioning service
 * @returns {object|null} alert payload or null
 */
function buildSpeedAlert(deviceState) {
  if (deviceState.speedMps <= MAX_SAFE_SPEED_MPS) return null;

  const key = `speed:${deviceState.deviceId}`;
  if (!shouldEmit(key)) return null;

  return {
    type:      'SPEED_EXCEEDED',
    severity:  'warning',
    deviceId:  deviceState.deviceId,
    speedMps:  Math.round(deviceState.speedMps * 100) / 100,
    limitMps:  MAX_SAFE_SPEED_MPS,
    message:   `🚨 Device ${deviceState.deviceId} exceeded safe speed: ${deviceState.speedMps.toFixed(1)} m/s`,
    timestamp: new Date().toISOString(),
  };
}

/** Periodically clean up old dedup entries */
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentAlerts) {
    if (now - ts > DEDUP_WINDOW_MS * 2) recentAlerts.delete(key);
  }
}, 10000);

module.exports = { buildProximityAlerts, buildSpeedAlert };
