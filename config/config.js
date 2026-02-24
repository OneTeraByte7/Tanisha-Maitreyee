/**
 * config/config.js - Central configuration and constants
 */

module.exports = {
  PORT: process.env.PORT || 3000,

  // ── Safety Thresholds ─────────────────────────────────────────────────────
  SAFETY: {
    COLLISION_DISTANCE_METERS: 2.0,      // Alert if devices < 2m apart
    WARNING_DISTANCE_METERS: 5.0,        // Warn if devices < 5m apart
    MAX_SPEED_MS: 15,                    // Alert if speed > 15 m/s (~54 km/h)
    SENSOR_CONFIDENCE_THRESHOLD: 0.6,   // Below this, fall back to GPS
  },

  // ── Sensor Fusion ─────────────────────────────────────────────────────────
  FUSION: {
    SMOOTHING_WINDOW: 5,                 // Moving average window size
    DEAD_RECKONING_MAX_DRIFT_SEC: 30,    // Max time before forcing GPS sync
    ACCEL_NOISE_THRESHOLD: 0.05,        // Ignore accelerometer noise below this (m/s²)
  },

  // ── Indoor Positioning ────────────────────────────────────────────────────
  INDOOR: {
    RSSI_PATH_LOSS_EXPONENT: 2.0,        // Free space path loss (2.0–4.0)
    RSSI_MEASURED_AT_1M: -40,           // Expected RSSI at 1 meter (dBm)
    MIN_BASE_STATIONS: 3,               // Minimum stations for trilateration
  },

  // ── Device TTL ────────────────────────────────────────────────────────────
  DEVICE_TTL_MS: 30000,                  // Remove device if no update for 30s
};