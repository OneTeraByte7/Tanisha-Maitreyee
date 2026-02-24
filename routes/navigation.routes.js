/**
 * navigation.routes.js
 * REST endpoints for outdoor and indoor navigation context.
 * Primarily returns state / config for the frontend.
 */

const router = require('express').Router();
const { getActiveDevices } = require('../services/positioning.service');
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

// POST /navigation/external — receive a one-shot sensor update via REST (non-WS fallback)
router.post('/external/update', (req, res) => {
  // Minimal REST fallback — real-time updates should use WebSocket
  res.json({ received: true, note: 'Prefer WebSocket (sensor:update) for real-time updates.' });
});

module.exports = router;
