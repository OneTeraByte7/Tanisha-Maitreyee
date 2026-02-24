/**
 * dashboard.routes.js
 * Provides aggregated system statistics for an admin / monitoring dashboard.
 */

const router = require('express').Router();
const { getActiveDevices } = require('../services/positioning.service');
const { scanProximity }    = require('../services/proximity.service');

// GET /dashboard — full system snapshot
router.get('/', (req, res) => {
  const devices  = getActiveDevices();
  const proxEvents = scanProximity();

  const collisions = proxEvents.filter(e => e.severity === 'collision');
  const warnings   = proxEvents.filter(e => e.severity === 'warning');

  res.json({
    summary: {
      totalActiveDevices: devices.length,
      baseStations:       devices.filter(d => d.isBaseStation).length,
      collisionAlerts:    collisions.length,
      proximityWarnings:  warnings.length,
    },
    devices,
    activeAlerts: proxEvents,
    timestamp: new Date().toISOString(),
  });
});

// GET /dashboard/devices — list all active devices
router.get('/devices', (req, res) => {
  res.json(getActiveDevices());
});

// GET /dashboard/alerts — current proximity/collision events
router.get('/alerts', (req, res) => {
  res.json(scanProximity());
});

module.exports = router;
