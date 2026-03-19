const { addPlayer, removePlayer, getRoom, getAllRooms } = require("../rooms");
const {
  startGame, nextTurn, reverseDirection,
  startTurnTimeout, clearTurnTimeout,
  checkWin, isGameOver, buildRanking,
  handleDisconnect, TURN_TIMEOUT_MS
} = require("../game/gameEngine");
const { isValidMove } = require("../game/rules");

function emitGameState(io, roomId, room) {
  if (!room.players || room.players.length === 0) return;
  const base = {
    table: room.table,
    turn: room.players[room.turn],
    turnName: room.nicknames?.[room.players[room.turn]] || "",
    firstTurn: room.firstTurn || false,
    direction: room.direction || 1,
    passCount: room.passCount || 0,
    timeoutMs: TURN_TIMEOUT_MS,
    currentRanks: room.finished.map((id, i) => ({
      id, name: room.nicknames?.[id] || id, pos: i + 1
    }))
  };
  room.players.forEach(id => {
    io.to(id).emit("gameState", {
      ...base,
      hasPassed: room.passedPlayers?.has(id) || false
    });
  });
}

function doStartGame(io, room, roomId) {
  // ✅ reset started ก่อนเสมอ เพื่อให้ startGame ทำงานได้
  room.started = false;
  startGame(room);

  room.players.forEach(id => io.to(id).emit("yourHand", room.hands[id]));

  if (room.swapInfo) {
    io.to(roomId).emit("cardSwapInfo", room.swapInfo);
  }

  io.to(roomId).emit("gameStarted");
  emitGameState(io, roomId, room);

  // ✅ เริ่ม turn timeout
  startTurnTimeout(room, (timedOutId) => {
    autoPass(io, room, roomId, timedOutId);
  });
}

// ✅ auto-pass เมื่อหมดเวลา
function autoPass(io, room, roomId, playerId) {
  if (!room.started) return;
  if (room.players[room.turn] !== playerId) return;
  if (room.firstTurn) return; // เทิร์นแรกห้าม auto-pass

  io.to(roomId).emit("autoPass", {
    name: room.nicknames?.[playerId] || playerId
  });

  doPassTurn(io, room, roomId, playerId);
}

// ✅ แยก pass logic ออกมาใช้ร่วมกันได้
function doPassTurn(io, room, roomId, playerId) {
  clearTurnTimeout(room);

  room.passCount = (room.passCount || 0) + 1;
  room.passedPlayers = room.passedPlayers || new Set();
  room.passedPlayers.add(playerId);

  const mustPass = room.players.filter(p =>
    room.hands[p]?.length > 0 && p !== room.lastPlayerId
  );

  if (room.passCount >= mustPass.length) {
    room.passedPlayers = new Set();
    reverseDirection(room);
    const dirLabel = room.direction === 1 ? "⬅️ ซ้าย" : "➡️ ขวา";
    io.to(roomId).emit("tableClear", {
      reversed: true,
      directionLabel: dirLabel,
      nextPlayerName: room.nicknames?.[room.players[room.turn]] || ""
    });
  } else {
    nextTurn(room);
  }

  emitGameState(io, roomId, room);

  // ✅ restart timer สำหรับ turn ถัดไป
  startTurnTimeout(room, (timedOutId) => {
    autoPass(io, room, roomId, timedOutId);
  });
}

function socketHandler(io) {
  io.on("connection", (socket) => {

    socket.on("joinRoom", ({ roomId, nickname }) => {
      // ✅ ป้องกัน join ซ้ำ
      const existing = getRoom(roomId);
      if (existing?.started) {
        io.to(socket.id).emit("error", "เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้");
        return;
      }
      // ✅ ไม่รับเกิน 4 คน
      if (existing && existing.players.length >= 4 && !existing.players.includes(socket.id)) {
        io.to(socket.id).emit("error", "ห้องเต็มแล้ว (4/4)");
        return;
      }

      const room = addPlayer(roomId, socket.id, nickname);
      socket.join(roomId);
      // ✅ เก็บ roomId ไว้ใน socket เพื่อ disconnect
      socket.currentRoom = roomId;

      const playerList = room.players.map(id => ({ id, name: room.nicknames[id] }));
      io.to(roomId).emit("players", playerList);
    });

    socket.on("startGame", (roomId) => {
      const room = getRoom(roomId);
      if (!room || room.started) return;
      if (room.players.length !== 4) {
        io.to(socket.id).emit("error", "ต้องมีผู้เล่น 4 คนพอดี");
        return;
      }
      doStartGame(io, room, roomId);
    });

    socket.on("playAgain", (roomId) => {
      const room = getRoom(roomId);
      // ✅ ตรวจ started จาก room ไม่ใช่ parameter
      if (!room || room.started) return;
      if (room.players.length !== 4) {
        io.to(socket.id).emit("error", "ต้องมีผู้เล่น 4 คนพอดี");
        return;
      }
      doStartGame(io, room, roomId);
    });

    socket.on("playCard", ({ roomId, cards }) => {
      const room = getRoom(roomId);
      if (!room || !room.started) return;
      if (room.players[room.turn] !== socket.id) return;

      // ✅ ป้องกัน cards เป็น null/undefined/ไม่ใช่ array
      if (!Array.isArray(cards) || cards.length === 0) return;
      if (room.passedPlayers?.has(socket.id)) return;
      if (!isValidMove(cards, room.table)) return;

      // ✅ ตรวจว่าไพ่ที่ส่งมามีอยู่ในมือจริง (ป้องกัน cheat)
      const hand = room.hands[socket.id];
      const tempHand = [...hand];
      for (const card of cards) {
        const idx = tempHand.findIndex(c => c.suit === card.suit && c.value === card.value);
        if (idx === -1) return; // ไพ่ไม่มีในมือ
        tempHand.splice(idx, 1);
      }

      if (room.firstTurn) {
        if (!cards.some(c => c.value === "3" && c.suit === "♣")) return;
        room.firstTurn = false;
      }

      clearTurnTimeout(room);

      // ลบไพ่ออกจากมือ
      cards.forEach(card => {
        room.hands[socket.id] = room.hands[socket.id].filter(
          c => !(c.suit === card.suit && c.value === card.value)
        );
      });

      room.table.push(cards);
      room.passCount = 0;
      room.passedPlayers = new Set();
      room.lastPlayerId = socket.id;

      io.to(socket.id).emit("yourHand", room.hands[socket.id]);

      const won = checkWin(room, socket.id);
      if (won) {
        io.to(roomId).emit("playerFinished", {
          playerId: socket.id,
          name: room.nicknames?.[socket.id],
          rank: room.finished.length
        });
      }

      if (isGameOver(room)) {
        clearTurnTimeout(room);
        const ranking = buildRanking(room);
        io.to(roomId).emit("gameOver", { ranking });
        room.started = false;
        return;
      }

      nextTurn(room);
      emitGameState(io, roomId, room);

      // ✅ restart timer
      startTurnTimeout(room, (timedOutId) => {
        autoPass(io, room, roomId, timedOutId);
      });
    });

    socket.on("passTurn", (roomId) => {
      const room = getRoom(roomId);
      if (!room || !room.started) return;
      if (room.players[room.turn] !== socket.id) return;
      if (room.firstTurn) return;

      doPassTurn(io, room, roomId, socket.id);
    });

    socket.on("leaveRoom", (roomId) => {
      const room = getRoom(roomId);
      if (!room) return;

      removePlayer(roomId, socket.id);
      socket.leave(roomId);
      socket.currentRoom = null;

      const playerList = room.players.map(id => ({ id, name: room.nicknames?.[id] || id }));
      io.to(roomId).emit("players", playerList);
    });

    socket.on("disconnect", () => {
      // ✅ ใช้ socket.currentRoom แทน loop ทุก room
      const roomId = socket.currentRoom;
      if (!roomId) return;

      const room = getRoom(roomId);
      if (!room) return;

      const wasInRoom = room.players.includes(socket.id);
      if (!wasInRoom) return;

      clearTurnTimeout(room);

      const result = handleDisconnect(room, socket.id);

      // sync nicknames/players
      const playerList = room.players.map(id => ({ id, name: room.nicknames?.[id] || id }));
      io.to(roomId).emit("players", playerList);

      if (result === "abort") {
        // ✅ เกมค้าง เพราะเหลือ < 2 คน
        io.to(roomId).emit("gameAborted", {
          reason: room.nicknames?.[socket.id] + " ออกจากเกม — เกมถูกยกเลิก"
        });
        room.started = false;
      } else if (room.started && room.players.length > 0) {
        emitGameState(io, roomId, room);
        // ✅ restart timer สำหรับคนที่รับ turn ต่อ
        startTurnTimeout(room, (timedOutId) => {
          autoPass(io, room, roomId, timedOutId);
        });
      }
    });

  });
}

module.exports = socketHandler;