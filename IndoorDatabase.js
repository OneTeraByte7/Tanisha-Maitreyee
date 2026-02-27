// IndoorDatabase.js
// Manages all Firestore reads/writes for INDOOR sessions.
// Collection: "indoorSessions"
//
// Called automatically when a user enters indoor mode.
// Saves: session info, floor/position history, step count,
//        Bluetooth beacon checkpoints, and collision events.

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

const INDOOR_SESSIONS   = 'indoorSessions';    // one document per session
const INDOOR_USERS      = 'indoorUsers';       // latest snapshot per user (for live tracking)

// ─────────────────────────────────────────────────────────────────────────────
// SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called the moment a user enters indoor mode (on login or mode switch).
 * Creates a new session document and returns its ID.
 *
 * @param {string} uid         - Firebase auth user ID
 * @param {string} displayName - User's display name
 * @param {string} email       - User's email
 * @param {object} entryPos    - { x, y, floor } — where they entered the building
 * @returns {string} sessionId
 */
export async function startIndoorSession(uid, displayName, email, entryPos = { x: 0, y: 0, floor: 1 }) {
  const sessionRef = await addDoc(collection(db, INDOOR_SESSIONS), {
    uid,
    displayName,
    email,
    startedAt: serverTimestamp(),
    endedAt: null,
    entryPosition: entryPos,
    currentPosition: entryPos,
    currentFloor: entryPos.floor,
    totalSteps: 0,
    totalDistanceM: 0,
    floorsVisited: [entryPos.floor],
    positionHistory: [
      {
        x: entryPos.x,
        y: entryPos.y,
        floor: entryPos.floor,
        heading: 0,
        timestamp: Date.now(),
      },
    ],
    beaconCheckpoints: [],   // Bluetooth beacons the user passed
    collisionEvents: [],     // near-miss events recorded this session
    deviceInfo: {
      platform: 'mobile',
      sensors: ['accelerometer', 'magnetometer', 'bluetooth'],
    },
  });

  // Also update the live indoorUsers snapshot for real-time tracking
  await setDoc(doc(db, INDOOR_USERS, uid), {
    uid,
    displayName,
    email,
    sessionId: sessionRef.id,
    isOnline: true,
    mode: 'indoor',
    currentPosition: entryPos,
    currentFloor: entryPos.floor,
    heading: 0,
    speed: 0,
    lastSeen: serverTimestamp(),
  });

  return sessionRef.id;
}

/**
 * Called when the user leaves indoor mode or signs out.
 * Closes out the session with an end timestamp and final stats.
 *
 * @param {string} uid       - Firebase auth user ID
 * @param {string} sessionId - The session ID returned by startIndoorSession
 * @param {object} finalStats - { totalSteps, totalDistanceM }
 */
export async function endIndoorSession(uid, sessionId, finalStats = {}) {
  if (!sessionId) return;

  await updateDoc(doc(db, INDOOR_SESSIONS, sessionId), {
    endedAt: serverTimestamp(),
    totalSteps: finalStats.totalSteps || 0,
    totalDistanceM: finalStats.totalDistanceM || 0,
  });

  // Mark user offline in the live snapshot
  await setDoc(
    doc(db, INDOOR_USERS, uid),
    { isOnline: false, lastSeen: serverTimestamp() },
    { merge: true }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE POSITION UPDATES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called every broadcast interval (~1.5s) while the user is indoors.
 * Updates both the live snapshot (for real-time tracking) and appends
 * to the session's position history (for route replay).
 *
 * @param {string} uid       - Firebase auth user ID
 * @param {string} sessionId - Active session ID
 * @param {object} pos       - { x, y, floor, heading, speed, stepCount }
 */
export async function updateIndoorPosition(uid, sessionId, pos) {
  if (!uid || !sessionId) return;

  const posEntry = {
    x: pos.x,
    y: pos.y,
    floor: pos.floor,
    heading: pos.heading || 0,
    speed: pos.speed || 0,
    timestamp: Date.now(),
  };

  // Update live snapshot (other users see this for collision detection)
  await setDoc(
    doc(db, INDOOR_USERS, uid),
    {
      currentPosition: { x: pos.x, y: pos.y, floor: pos.floor },
      currentFloor: pos.floor,
      heading: pos.heading || 0,
      speed: pos.speed || 0,
      totalSteps: pos.stepCount || 0,
      lastSeen: serverTimestamp(),
      isOnline: true,
    },
    { merge: true }
  );

  // Append to session history (every 3 seconds to avoid excessive writes)
  const now = Date.now();
  if (!updateIndoorPosition._lastHistoryWrite ||
      now - updateIndoorPosition._lastHistoryWrite > 3000) {
    await updateDoc(doc(db, INDOOR_SESSIONS, sessionId), {
      currentPosition: { x: pos.x, y: pos.y, floor: pos.floor },
      currentFloor: pos.floor,
      totalSteps: pos.stepCount || 0,
      positionHistory: arrayUnion(posEntry),
      floorsVisited: arrayUnion(pos.floor),
    });
    updateIndoorPosition._lastHistoryWrite = now;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BEACON CHECKPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when the user passes a known Bluetooth beacon.
 * Logs it as a verified position checkpoint (corrects dead reckoning drift).
 *
 * @param {string} sessionId  - Active session ID
 * @param {object} beacon     - { uuid, label, x, y, floor, rssi }
 */
export async function logBeaconCheckpoint(sessionId, beacon) {
  if (!sessionId) return;
  await updateDoc(doc(db, INDOOR_SESSIONS, sessionId), {
    beaconCheckpoints: arrayUnion({
      uuid: beacon.uuid,
      label: beacon.label,
      x: beacon.x,
      y: beacon.y,
      floor: beacon.floor,
      rssi: beacon.rssi,
      timestamp: Date.now(),
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// COLLISION EVENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called whenever a CRITICAL or DANGER risk level is detected.
 * Saves the near-miss event to both users' session records.
 *
 * @param {string} mySessionId    - Current user's session ID
 * @param {string} myUid          - Current user's UID
 * @param {object} otherVehicle   - { uid, displayName, x, y, floor }
 * @param {object} riskData       - { riskLevel, distance, tca, riskLabel }
 * @param {object} myPos          - { x, y, floor }
 */
export async function logIndoorCollisionEvent(mySessionId, myUid, otherVehicle, riskData, myPos) {
  const event = {
    timestamp: Date.now(),
    riskLevel: riskData.riskLevel,
    riskLabel: riskData.riskLabel,
    distanceM: riskData.distance,
    timeToImpactS: riskData.tca,
    myPosition: myPos,
    otherUid: otherVehicle.uid,
    otherDisplayName: otherVehicle.displayName,
    otherPosition: { x: otherVehicle.x, y: otherVehicle.y, floor: otherVehicle.floor },
    floor: myPos.floor,
  };

  // Log to my session
  if (mySessionId) {
    await updateDoc(doc(db, INDOOR_SESSIONS, mySessionId), {
      collisionEvents: arrayUnion(event),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// READ / QUERY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all indoor sessions for a specific user.
 * @param {string} uid
 * @returns {Array} array of session objects
 */
export async function getUserIndoorSessions(uid) {
  const q = query(
    collection(db, INDOOR_SESSIONS),
    where('uid', '==', uid),
    orderBy('startedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch a single indoor session by ID.
 * @param {string} sessionId
 * @returns {object|null}
 */
export async function getIndoorSession(sessionId) {
  const snap = await getDoc(doc(db, INDOOR_SESSIONS, sessionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Fetch all indoor collision events for a user across all sessions.
 * @param {string} uid
 * @returns {Array}
 */
export async function getUserIndoorCollisions(uid) {
  const sessions = await getUserIndoorSessions(uid);
  return sessions.flatMap((s) =>
    (s.collisionEvents || []).map((e) => ({ ...e, sessionId: s.id }))
  );
}
