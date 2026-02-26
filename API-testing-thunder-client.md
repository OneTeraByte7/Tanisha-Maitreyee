# API Testing with Thunder Client

This document explains how to test the Autonomous Navigation backend API using Thunder Client (VS Code extension).

**Prerequisites**
- Node.js installed
- Project dependencies installed: run `npm install` in the repository root
- Server run locally (see Start section)

**Start the server**
- For normal run:

```bash
npm start
```

- For local testing (the server disables automatic listen during `NODE_ENV=test` to allow Jest to control the server):

```bash
# Start with the default port (3000)
npm start
```


**Base URL**
- Default: `http://localhost:3000`
- The port can be overridden by setting the `PORT` environment variable.


**Available endpoints**
The repository exposes the following REST endpoints (paths are relative to the Base URL):

- GET `/health` — returns service status and uptime

Landing
- GET `/landing` — returns available navigation modes and system status

Navigation
- GET `/navigation/external` — outdoor navigation context (active devices, thresholds)
- GET `/navigation/internal` — indoor navigation context + base stations
- POST `/navigation/external/update` — one-shot sensor update (REST fallback)

Dashboard
- GET `/dashboard` — full system snapshot and aggregated stats
- GET `/dashboard/devices` — list all active devices
- GET `/dashboard/alerts` — current proximity/collision events


**Testing steps in Thunder Client**
1. Install the Thunder Client extension in VS Code.
2. Open the Thunder Client sidebar and create a new Collection (e.g., "Navigation API").
3. Add requests for each endpoint you want to test. Examples below.

Request examples

- Health check
  - Method: GET
  - URL: `http://localhost:3000/health`
  - Expected: 200 OK, JSON with `status: 'ok'` and `uptime` number

- Landing
  - Method: GET
  - URL: `http://localhost:3000/landing`
  - Expected: 200 OK, JSON with `status`, `modes`, `version`, `timestamp`

- Navigation external
  - Method: GET
  - URL: `http://localhost:3000/navigation/external`
  - Expected: 200 OK, JSON with `mode: 'outdoor'`, `activeDevices`, and `devices`

- Navigation internal
  - Method: GET
  - URL: `http://localhost:3000/navigation/internal`
  - Expected: 200 OK, JSON with `mode: 'indoor'`, `baseStations`, and `mobileDevices`

- POST sensor update (REST fallback)
  - Method: POST
  - URL: `http://localhost:3000/navigation/external/update`
  - Body (JSON): `{ "deviceId": "dev-123", "lat": 12.34, "lon": 56.78 }`
  - Expected: 200 OK, JSON `{ received: true, note: 'Prefer WebSocket (sensor:update) for real-time updates.' }`

- Dashboard summary
  - Method: GET
  - URL: `http://localhost:3000/dashboard`
  - Expected: 200 OK, JSON with `summary`, `devices`, `activeAlerts`, `timestamp`


**Tips & assertions**
- Use Thunder Client's Tests tab to add basic assertions. Example test for health endpoint:

```javascript
pm.response.to.have.status(200);
pm.response.to.have.json('status', 'ok');
```

- For endpoints that return arrays (`/dashboard/devices`, `/dashboard/alerts`), assert length or presence of expected properties.

- If the server returns empty arrays during development, verify the `services/positioning.service.js` and `services/proximity.service.js` data sources to seed devices.


**WebSocket testing (optional)**
- The project exposes real-time events via Socket.IO. Thunder Client does not support Socket.IO directly; use a small Node script or the browser console to connect:

```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3000');
socket.on('connect', () => console.log('connected'));
// listen to events the server emits (check sockets/realtime.socket.js for event names)
```


**Troubleshooting**
- If Thunder Client shows connection refused:
  - Ensure `npm start` is running and using the expected port.
  - Check firewall or other tooling that might block the port.
- If endpoints return empty data, confirm that device-related services are returning seeded/mock data.


**Quick sanity checklist**
- Server running: `http://localhost:3000/health` → 200 OK
- GET `/landing` → modes array present
- GET `/navigation/external` and `/navigation/internal` → valid JSON shapes
- POST `/navigation/external/update` → receipt response


If you want, I can also generate a Thunder Client collection JSON with the above requests so you can import it directly. Would you like that?