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

class DeviceStore {
  constructor() {
    this.devices = new Map();  // deviceId => deviceState

    // Periodically prune stale devices
    setInterval(() => this._pruneStaleDevices(), 10000);
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
}

// Singleton instance shared across the entire app
module.exports = new DeviceStore();
