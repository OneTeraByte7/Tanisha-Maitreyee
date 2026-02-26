/**
 * models/deviceStore.js
 * 
 * In-memory store for all connected devices.
 * Acts as the "database" for real-time positioning data.
 * 
 * Each device entry shape:
 * {
 *   deviceId: string,
 *   position: { lat, lng, x, y, z },       // estimated position
 *   velocity: { vx, vy, speed },
 *   heading: number,                        // degrees 0-360
 *   sensorConfidence: number,               // 0.0 – 1.0
 *   lastRawSensor: { accel, gyro, mag },
 *   isBaseStation: boolean,
 *   rssi: {},                               // { deviceId: dBm } for indoor
 *   lastUpdated: timestamp,
 *   alerts: []                              // recent alerts for this device
 * }
 */

const config = require('../config/config');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INFO_PATH = path.join(DATA_DIR, 'info.json');

class DeviceStore {
  constructor() {
    this.devices = new Map();  // deviceId => deviceState

    // Ensure data directory exists
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (err) {
      console.error('Failed to ensure data directory:', err);
    }

    // Load persisted devices if available
    this._loadFromDisk();

    // Periodically prune stale devices and persist state
    setInterval(() => {
      this._pruneStaleDevices();
      this._saveToDisk();
    }, 10000);
  }

  /** Upsert device state */
  update(deviceId, data) {
    const existing = this.devices.get(deviceId) || { deviceId, alerts: [] };
    const updated = {
      ...existing,
      ...data,
      deviceId,
      lastUpdated: Date.now()
    };
    this.devices.set(deviceId, updated);
    this._saveToDisk();
    return updated;
  }

  get(deviceId) {
    return this.devices.get(deviceId) || null;
  }

  getAll() {
    return Array.from(this.devices.values());
  }

  /** Return only base station devices (used for indoor trilateration) */
  getBaseStations() {
    return this.getAll().filter(d => d.isBaseStation === true);
  }

  addAlert(deviceId, alert) {
    const device = this.get(deviceId);
    if (!device) return;
    device.alerts = [alert, ...(device.alerts || [])].slice(0, 50); // keep last 50
    this.devices.set(deviceId, device);
  }

  remove(deviceId) {
    this.devices.delete(deviceId);
    this._saveToDisk();
  }

  _pruneStaleDevices() {
    const cutoff = Date.now() - config.DEVICE_TTL_MS;
    for (const [id, device] of this.devices.entries()) {
      if (device.lastUpdated < cutoff) {
        console.log(`🧹 Removing stale device: ${id}`);
        this.devices.delete(id);
      }
    }
  }

  getSummary() {
    return {
      totalDevices: this.devices.size,
      baseStations: this.getBaseStations().length,
      devices: this.getAll().map(d => ({
        deviceId: d.deviceId,
        position: d.position,
        speed: d.velocity?.speed,
        isBaseStation: d.isBaseStation,
        lastUpdated: d.lastUpdated
      }))
    };
  }

  /** Persist current devices map to disk (atomic write) */
  _saveToDisk() {
    try {
      const data = { generatedAt: Date.now(), devices: this.getAll() };
      const tmp = INFO_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, INFO_PATH);
    } catch (err) {
      console.error('Failed to save device info to disk:', err);
    }
  }

  /** Load devices from disk if file exists */
  _loadFromDisk() {
    try {
      if (!fs.existsSync(INFO_PATH)) return;
      const raw = fs.readFileSync(INFO_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.devices)) {
        for (const d of parsed.devices) {
          // Refresh lastUpdated to now to avoid immediate pruning on startup
          const restored = { ...d, lastUpdated: Date.now() };
          this.devices.set(restored.deviceId, restored);
        }
        // Persist refreshed timestamps back to disk so subsequent restarts keep them fresh
        this._saveToDisk();
      }
    } catch (err) {
      console.error('Failed to load device info from disk:', err);
    }
  }
}

// Singleton instance shared across the entire app
module.exports = new DeviceStore();
