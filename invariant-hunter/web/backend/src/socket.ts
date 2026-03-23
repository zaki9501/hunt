/**
 * Socket.IO instance — set from index after server creation.
 * Avoids circular import: index → jobs → index (io was undefined at load time).
 */

import type { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function setSocketIo(server: Server): void {
  ioInstance = server;
}

export function getIo(): Server {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized');
  }
  return ioInstance;
}
