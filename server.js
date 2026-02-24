/**
 * server.js - Main entry point for the Autonomous Navigation Backend
 * Initializes Express + Socket.IO and wires all routes/sockets
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { PORT, CORS_ORIGIN } = require('./config/app.config');
const landingRoutes = require('./routes/landing.routes');
const navigationRoutes = require('./routes/navigation.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const initRealtimeSocket = require('./sockets/realtime.socket');

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// ── REST Routes ───────────────────────────────────────────────────────────────
app.use('/landing', landingRoutes);
app.use('/navigation', navigationRoutes);
app.use('/dashboard', dashboardRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ── WebSocket ─────────────────────────────────────────────────────────────────
initRealtimeSocket(io);

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`🚀 Navigation backend running on http://localhost:${PORT}`);
});

module.exports = { app, io };
