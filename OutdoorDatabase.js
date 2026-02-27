// OutdoorDatabase.js
// Manages all Firestore reads/writes for OUTDOOR sessions.
// Collection: "outdoorSessions"
//
// Called automatically when a user enters outdoor mode.
// Saves: session info, GPS route history, speed, heading,
//        and collision events.

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

const OUTDOOR_SESSIONS = 'outdoorSessions';   // one document per session
const OUTDOOR_USERS    = 'outdoorUsers';      // latest snapshot per user (for live tracking)

// ─────────────────────────────────────────────────────────────────────────────
// SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called the moment a user enters outdoor mode (on login or mode switch).
 * Creates a new session document and returns its ID.
 *
 * @param {string} uid          - Firebase auth user ID
 * @param {string} displayName  - User's display name
 * @param {string} email        - User's email
 * @param {object} entryGps     - { lat, lon } — first GPS fix
 * @returns {string} sessionId
 */
export async function startOutdoorSession(uid, displayName, email, entryGps = { lat: 0, lon: 0 }) {
  const sessionRef = await addDoc(collection(db, OUTDOOR_SESSIONS), {
    uid,
    displayName,
    email,
    startedAt: serverTimestamp(),
    endedAt: null,
    entryLocation: entryGps,
    currentLocation: entryGps,
    currentHeading: 0,
    currentSpeedKmh: 0,
    maxSpeedKmh: 0,
    totalDistanceM: 0,
    gpsHistory: [
      {
        lat: entryGps.lat,
        lon: entryGps.lon,
        heading: 0,
        speedKmh: 0,
        timestamp: Date.now(),
      },
    ],
    collisionEvents: [],     // near-miss events recorded this session
    deviceInfo: {
      platform: 'mobile',
      sensors: ['gps', 'accelerometer', 'magnetometer', 'bluetooth'],
    },
  });

  // Update the live outdoorUsers snapshot for real-time tracking
  await setDoc(doc(db, OUTDOOR_USERS, uid), {
    uid,
    displayName,
    email,
    sessionId: sessionRef.id,
    isOnline: true,
    mode: 'outdoor',
    location: entryGps,
    heading: 0,
    speed: 0,
    lastSeen: serverTimestamp(),
  });

  return sessionRef.id;
}

/**
 * Called when the user leaves outdoor mode or signs out.
 * Closes out the session with final stats.
 *
 * @param {string} uid        - Firebase auth user ID
 * @param {string} sessionId  - The session ID returned by startOutdoorSession
 * @param {object} finalStats - { totalDistanceM, maxSpeedKmh }
 */
export async function endOutdoorSession(uid, sessionId, finalStats = {}) {
  if (!sessionId) return;

  await updateDoc(doc(db, OUTDOOR_SESSIONS, sessionId), {
    endedAt: serverTimestamp(),
    totalDistanceM: finalStats.totalDistanceM || 0,
    maxSpeedKmh: finalStats.maxSpeedKmh || 0,
  });

  // Mark user offline in the live snapshot
  await setDoc(
    doc(db, OUTDOOR_USERS, uid),
    { isOnline: false, lastSeen: serverTimestamp() },
    { merge: true }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE POSITION UPDATES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called every broadcast interval (~1.5s) while the user is outdoors.
 * Updates the live snapshot (for real-time collision detection) and
 * appends to the session's GPS history (for route replay).
 *
 * @param {string} uid        - Firebase auth user ID
 * @param {string} sessionId  - Active session ID
 * @param {object} gps        - { lat, lon, heading, speedKmh, totalDistanceM, maxSpeedKmh }
 */
export async function updateOutdoorPosition(uid, sessionId, gps) {
  if (!uid || !sessionId) return;

  const speedKmh = (gps.speed || 0) * 3.6; // convert m/s to km/h

  const gpsEntry = {
    lat: gps.lat,
    lon: gps.lon,
    heading: gps.heading || 0,
    speedKmh,
    timestamp: Date.now(),
  };

  // Update live snapshot (other users see this for collision detection)
  await setDoc(
    doc(db, OUTDOOR_USERS, uid),
    {
      location: { lat: gps.lat, lon: gps.lon },
      heading: gps.heading || 0,
      speed: gps.speed || 0,
      lastSeen: serverTimestamp(),
      isOnline: true,
    },
    { merge: true }
  );

  // Append to GPS history every 3 seconds to avoid excessive Firestore writes
  const now = Date.now();
  if (!updateOutdoorPosition._lastHistoryWrite ||
      now - updateOutdoorPosition._lastHistoryWrite > 3000) {
    await updateDoc(doc(db, OUTDOOR_SESSIONS, sessionId), {
      currentLocation: { lat: gps.lat, lon: gps.lon },
      currentHeading: gps.heading || 0,
      currentSpeedKmh: speedKmh,
      totalDistanceM: gps.totalDistanceM || 0,
      maxSpeedKmh: gps.maxSpeedKmh || 0,
      gpsHistory: arrayUnion(gpsEntry),
    });
    updateOutdoorPosition._lastHistoryWrite = now;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COLLISION EVENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called whenever a CRITICAL or DANGER risk level is detected outdoors.
 * Saves the near-miss event to the session record.
 *
 * @param {string} mySessionId   - Current user's session ID
 * @param {object} otherVehicle  - { uid, displayName, lat, lon }
 * @param {object} riskData      - { riskLevel, distance, tca, riskLabel }
 * @param {object} myGps         - { lat, lon }
 */
export async function logOutdoorCollisionEvent(mySessionId, otherVehicle, riskData, myGps) {
  if (!mySessionId) return;

  const event = {
    timestamp: Date.now(),
    riskLevel: riskData.riskLevel,
    riskLabel: riskData.riskLabel,
    distanceM: riskData.distance,
    timeToImpactS: riskData.tca,
    myLocation: myGps,
    otherUid: otherVehicle.uid,
    otherDisplayName: otherVehicle.displayName,
    otherLocation: { lat: otherVehicle.lat, lon: otherVehicle.lon },
  };

  await updateDoc(doc(db, OUTDOOR_SESSIONS, mySessionId), {
    collisionEvents: arrayUnion(event),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// READ / QUERY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all outdoor sessions for a specific user.
 * @param {string} uid
 * @returns {Array} array of session objects
 */
export async function getUserOutdoorSessions(uid) {
  const q = query(
    collection(db, OUTDOOR_SESSIONS),
    where('uid', '==', uid),
    orderBy('startedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch a single outdoor session by ID.
 * @param {string} sessionId
 * @returns {object|null}
 */
export async function getOutdoorSession(sessionId) {
  const snap = await getDoc(doc(db, OUTDOOR_SESSIONS, sessionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Fetch all outdoor collision events for a user across all sessions.
 * @param {string} uid
 * @returns {Array}
 */
export async function getUserOutdoorCollisions(uid) {
  const sessions = await getUserOutdoorSessions(uid);
  return sessions.flatMap((s) =>
    (s.collisionEvents || []).map((e) => ({ ...e, sessionId: s.id }))
  );
}
