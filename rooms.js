const rooms = {};

// 🏠 สร้างห้อง
function createRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: [],
      nicknames: {},
      hands: {},
      deck: [],
      turn: 0,
      table: [],
      started: false
    };
  }
  return rooms[roomId];
}

// 🔍 ดึงห้อง
function getRoom(roomId) {
  return rooms[roomId];
}

// 👥 เพิ่ม player
function addPlayer(roomId, socketId, nickname) {
  const room = createRoom(roomId);

  if (!room.players.includes(socketId)) {
    room.players.push(socketId);
  }
  room.nicknames[socketId] = nickname || socketId.slice(0, 6);

  return room;
}

// ❌ ลบ player
function removePlayer(roomId, socketId) {
  const room = rooms[roomId];
  if (!room) return;

  room.players = room.players.filter(id => id !== socketId);
  delete room.hands[socketId];

  // ถ้าห้องว่าง → ลบห้อง
  if (room.players.length === 0) {
    delete rooms[roomId];
  }
}

// 📊 debug (optional)
function getAllRooms() {
  return rooms;
}

module.exports = {
  createRoom,
  getRoom,
  addPlayer,
  removePlayer,
  getAllRooms
};