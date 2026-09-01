let ioInstance = null;

function initSocket(server) {
  if (ioInstance) return ioInstance;

  const { Server } = require("socket.io");
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.emit("connected", { ok: true, time: Date.now() });
  });

  ioInstance = io;
  return io;
}

function getSocketIo() {
  return ioInstance;
}

function emitPlatformStats(stats) {
  if (!ioInstance) return;
  ioInstance.emit("platformStats:update", stats);
}

function emitUserStateUpdate(userId, payload = {}) {
  if (!ioInstance || !userId) return;
  ioInstance.emit("userState:update", { userId, payload });
}

module.exports = { initSocket, getSocketIo, emitPlatformStats, emitUserStateUpdate };
