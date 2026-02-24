/**
 * sensorFusion.service.js
 * Fuses accelerometer, gyroscope, and magnetometer data into a unified
 * motion state (heading, velocity, orientation) using dead reckoning + smoothing.
 */

const { SMOOTHING_WINDOW, SENSOR_CONFIDENCE_THRESHOLD } = require('../config/app.config');

// ── Sliding-window smoothing buffers per device ───────────────────────────────
const smoothingBuffers = {};  // deviceId -> { accel: [], gyro: [], mag: [] }

/**
 * Apply moving-average smoothing to a new sensor reading.
 * @param {string} deviceId
 * @param {string} axis  - 'accel' | 'gyro' | 'mag'
 * @param {object} reading - { x, y, z }
 * @returns {object} smoothed { x, y, z }
 */
function smooth(deviceId, axis, reading) {
  if (!smoothingBuffers[deviceId]) {
    smoothingBuffers[deviceId] = { accel: [], gyro: [], mag: [] };
  }
  const buf = smoothingBuffers[deviceId][axis];
  buf.push(reading);
  if (buf.length > SMOOTHING_WINDOW) buf.shift();

  // Average over the window
  const avg = buf.reduce(
    (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y, z: acc.z + v.z }),
    { x: 0, y: 0, z: 0 }
  );
  return { x: avg.x / buf.length, y: avg.y / buf.length, z: avg.z / buf.length };
}

/**
 * Derive heading (degrees, 0–360) from magnetometer + accelerometer tilt correction.
 * @param {object} mag   - smoothed magnetometer { x, y, z }
 * @param {object} accel - smoothed accelerometer { x, y, z }
 * @returns {number} heading in degrees
 */
function computeHeading(mag, accel) {
  // Normalize accelerometer to get roll/pitch
  const norm = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2) || 1;
  const ax = accel.x / norm;
  const ay = accel.y / norm;

  const pitch = Math.asin(-ax);
  const roll = Math.atan2(ay, Math.cos(pitch));

  // Tilt-compensated magnetic components
  const Mx = mag.x * Math.cos(pitch) + mag.z * Math.sin(pitch);
  const My =
    mag.x * Math.sin(roll) * Math.sin(pitch) +
    mag.y * Math.cos(roll) -
    mag.z * Math.sin(roll) * Math.cos(pitch);

  let heading = Math.atan2(-My, Mx) * (180 / Math.PI);
  if (heading < 0) heading += 360;
  return heading;
}

/**
 * Estimate scalar speed from accelerometer magnitude (simple integration proxy).
 * In a real system, integrate over dt; here we return instantaneous magnitude.
 * @param {object} accel - smoothed { x, y, z }
 * @returns {number} approximate speed proxy (m/s²)
 */
function estimateSpeed(accel) {
  return Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
}

/**
 * Compute a sensor confidence score [0..1] based on data variance.
 * Low variance in accel → likely stationary or reliable → high confidence.
 * @param {string} deviceId
 * @returns {number} confidence score
 */
function computeConfidence(deviceId) {
  const buf = smoothingBuffers[deviceId]?.accel || [];
  if (buf.length < 2) return 0.5;

  // Variance in Z-axis (gravity axis when device is flat)
  const values = buf.map(v => v.z);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;

  // High variance → noisy/unreliable → low confidence
  const confidence = Math.max(0, 1 - variance / 10);
  return Math.min(1, confidence);
}

/**
 * Main fusion function — call this with each incoming sensor packet.
 * @param {string} deviceId
 * @param {object} sensorData - raw sensor payload from device
 * @returns {object} fusedState { heading, speed, confidence, smoothedAccel, shouldUseGPS }
 */
function fuseSensors(deviceId, sensorData) {
  const { accelerometer, gyroscope, magnetometer } = sensorData;

  // Smooth each sensor stream
  const smoothAccel = smooth(deviceId, 'accel', accelerometer);
  const smoothGyro  = smooth(deviceId, 'gyro',  gyroscope);
  const smoothMag   = smooth(deviceId, 'mag',   magnetometer);

  const heading    = computeHeading(smoothMag, smoothAccel);
  const speed      = estimateSpeed(smoothAccel);
  const confidence = computeConfidence(deviceId);

  return {
    heading,
    speed,
    confidence,
    smoothedAccel: smoothAccel,
    smoothedGyro:  smoothGyro,
    smoothedMag:   smoothMag,
    shouldUseGPS:  confidence < SENSOR_CONFIDENCE_THRESHOLD,
  };
}

/**
 * Clean up buffers for a device (call on disconnect).
 */
function clearDevice(deviceId) {
  delete smoothingBuffers[deviceId];
}

module.exports = { fuseSensors, clearDevice };
