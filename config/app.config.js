/**
 * config/app.config.js
 * Compatibility shim required by server.js
 */
const base = require('./config');

module.exports = Object.assign({
  PORT: process.env.PORT || base.PORT || 3000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || base.CORS_ORIGIN || '*',
}, base);
