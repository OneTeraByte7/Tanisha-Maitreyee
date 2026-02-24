/**
 * samplePayloads.js
 * Example JSON payloads for testing the backend via WebSocket or REST.
 * Use these with a tool like Postman, wscat, or your Android app.
 */

// 1. Register a mobile device
const registerDevice = {
  event: 'register',
  payload: {
    deviceId: 'device_android_001',
    isBaseStation: false,
  },
};

// 2. Register an indoor base station with known position
const registerBaseStation = {
  event: 'register',
  payload: {
    deviceId: 'base_station_A',
    isBaseStation: true,
    knownPosition: { x: 0, y: 0, z: 0 },
  },
};

// 3. Send a sensor update (typical Android payload)
const sensorUpdate = {
  event: 'sensor_update',
  payload: {
    deviceId: 'device_android_001',
    dt: 0.1, // seconds since last update
    speed: 1.2, // m/s (from GPS or calculated)
    sensors: {
      accel: { x: 0.12, y: -0.05, z: 9.81 },  // m/s²
      gyro: { x: 0.01, y: -0.02, z: 0.003 },  // rad/s
      mag: { x: 22.5, y: -4.1, z: 43.2 },     // µT
    },
    gps: {
      lat: 28.6139,  // optional — fallback only
      lng: 77.2090,
      alt: 220,
    },
    // Indoor RSSI readings from nearby base stations
    rssiReadings: [
      { deviceId: 'base_station_A', rssi: -55 },
      { deviceId: 'base_station_B', rssi: -70 },
      { deviceId: 'base_station_C', rssi: -80 },
    ],
  },
};

// 4. Dashboard client joining the monitor room
const joinMonitors = {
  event: 'join_monitors',
  payload: {},
};

module.exports = { registerDevice, registerBaseStation, sensorUpdate, joinMonitors };
