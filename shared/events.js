// Variable: gemeinsamer Event-Bus für die Kommunikation zwischen
// Minecraft-Bridge, Discord und Server (Socket.IO).

import { EventEmitter } from 'node:events';

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
  }

  /**
   * Sende ein Event vom Server an Dashboard/Clients (via Socket.IO im Server verbunden).
   * @param {string} event
   * @param {unknown} payload
   */
  emitToDashboard(event, payload) {
    this.emit('dashboard', { event, payload });
  }
}

export const eventBus = new EventBus();
export default eventBus;