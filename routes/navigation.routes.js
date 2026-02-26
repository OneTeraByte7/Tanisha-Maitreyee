/**
 * navigation.routes.js
 * REST endpoints for outdoor and indoor navigation context.
 * Primarily returns state / config for the frontend.
 */

const router = require('express').Router();
const { getActiveDevices, updateDevicePosition, getDevice, removeDevice } = require('../services/positioning.service');
const { scanProximity, scanProximityForDevice } = require('../services/proximity.service');
const deviceStore = require('../models/deviceStore');
const { SAFETY_DISTANCE_METERS, WARNING_DISTANCE_METERS } = require('../config/app.config');

// GET /navigation/external — outdoor navigation context
router.get('/external', (req, res) => {
  const devices = getActiveDevices().filter(d => !d.isBaseStation);
  res.json({
    mode: 'outdoor',
    activeDevices: devices.length,
    devices,
    thresholds: { safety: SAFETY_DISTANCE_METERS, warning: WARNING_DISTANCE_METERS },
  });
});

// GET /navigation/internal — indoor navigation context + base stations
router.get('/internal', (req, res) => {
  const all = getActiveDevices();
  const baseStations = all.filter(d => d.isBaseStation);
  const mobileDevices = all.filter(d => !d.isBaseStation);

  res.json({
    mode: 'indoor',
    baseStations,
    mobileDevices,
    trilaterationReady: baseStations.length >= 3,
  });
});

// POST /navigation/register — register a device or base station
router.post('/register', (req, res) => {
  const { deviceId, isBaseStation = false, knownPosition } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

  const state = {
    deviceId,
    isBaseStation,
    position: knownPosition || null,
  };

  deviceStore.update(deviceId, state);
  return res.json({ registered: true, deviceId });
});

// POST /navigation/external/update — accept sensor payload and update device state
router.post('/external/update', (req, res) => {
  const payload = req.body || {};
  const deviceId = payload.deviceId;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required in payload' });

  // Build a minimal fusedState from incoming payload when sensorFusion not available
  const fusedState = {
    heading: payload.heading || 0,
    speed: payload.speed || 0,
    confidence: payload.confidence ?? 1.0,
    shouldUseGPS: !!payload.gps,
  };

  const updated = updateDevicePosition(deviceId, payload, fusedState);
  return res.json({ received: true, device: updated });
});

// GET /navigation/device/:id — get a single device
router.get('/device/:id', (req, res) => {
  const d = getDevice(req.params.id);
  if (!d) return res.status(404).json({ error: 'device not found' });
  res.json(d);
});

// DELETE /navigation/device/:id — remove a device
router.delete('/device/:id', (req, res) => {
  removeDevice(req.params.id);
  res.json({ removed: true, deviceId: req.params.id });
});

// GET /navigation/proximity — all proximity events
router.get('/proximity', (req, res) => {
  res.json(scanProximity());
});

// GET /navigation/proximity/:id — proximity events for a specific device
router.get('/proximity/:id', (req, res) => {
  res.json(scanProximityForDevice(req.params.id));
});

// POST /navigation/external — receive a one-shot sensor update via REST (non-WS fallback)
router.post('/external/update', (req, res) => {
  // Minimal REST fallback — real-time updates should use WebSocket
  res.json({ received: true, note: 'Prefer WebSocket (sensor:update) for real-time updates.' });
});

module.exports = router;
