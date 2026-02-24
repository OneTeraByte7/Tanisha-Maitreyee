/**
 * landing.routes.js
 * Provides routing/state data for the app's landing page.
 * Does NOT serve HTML — returns JSON state for the frontend to render.
 */

const router = require('express').Router();

// GET /landing — returns available navigation modes and system status
router.get('/', (req, res) => {
  res.json({
    status: 'online',
    modes: [
      { id: 'external', label: 'Outdoor Navigation', path: '/navigation/external' },
      { id: 'internal', label: 'Indoor Navigation',  path: '/navigation/internal' },
    ],
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
