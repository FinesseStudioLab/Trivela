import WebSocketServer from './server.js';

let wsServerInstance = null;

/**
 * Initialize WebSocket server
 * @param {import('http').Server} httpServer
 * @param {Object} options
 * @returns {WebSocketServer}
 */
function initializeWebSocket(httpServer, options = {}) {
  if (wsServerInstance) {
    throw new Error('WebSocket server already initialized');
  }

  wsServerInstance = new WebSocketServer(httpServer, {
    path: options.path || '/ws',
    verifyClient: options.verifyClient,
  });

  return wsServerInstance;
}

/**
 * Get the WebSocket server instance
 * @returns {WebSocketServer|null}
 */
function getWebSocketServer() {
  return wsServerInstance;
}

/**
 * Close the WebSocket server
 */
function closeWebSocket() {
  if (wsServerInstance) {
    wsServerInstance.close();
    wsServerInstance = null;
  }
}

export { initializeWebSocket, getWebSocketServer, closeWebSocket, WebSocketServer };
