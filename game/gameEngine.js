const { createDeck } = require("./deck");

const RANKS       = ["king", "queen", "viceslave", "slave"];
const RANK_LABELS = { king: "👑 คิง", queen: "👸 ควีน", viceslave: "รองสลาฟ", slave: "😓 สลาฟ" };
const TURN_TIMEOUT_MS = 300_000; // 60 วินาที

function startGame(room) {
  // ✅ ล้าง timeout เก่าก่อนเสมอ
  clearTurnTimeout(room);

  const deck = createDeck();
  room.hands         = {};
  room.table         = [];
  room.turn          = 0;
  room.started       = true;
  room.firstTurn     = true;
  room.finished      = [];
  room.passCount     = 0;
  room.passedPlayers = new Set();
  room.direction     = 1;
  room.lastPlayerId  = null;
  room.swapInfo      = null;
  room.turnTimer     = null;

  const players = room.players;

  // ✅ แจกไพ่ตาม dealOrder ถ้ามี prevRanking
  if (room.prevRanking && room.prevRanking.length === 4) {
    const [prevKing, prevQueen, prevVice, prevSlave] = room.prevRanking;
    const dealOrder = [prevSlave, prevVice, prevQueen, prevKing];
    // ✅ ป้องกัน id ที่ไม่อยู่ใน players แล้ว (เช่น disconnect)
    const validOrder = dealOrder.filter(id => players.includes(id));
    if (validOrder.length === 4) {
      validOrder.forEach((id, i) => {
        room.hands[id] = deck.slice(i * 13, i * 13 + 13);
      });
    } else {
      players.forEach((id, i) => {
        room.hands[id] = deck.slice(i * 13, i * 13 + 13);
      });
    }
  } else {
    players.forEach((id, i) => {
      room.hands[id] = deck.slice(i * 13, i * 13 + 13);
    });
  }

  // หาคนที่มี 3♣
  room.turn = 0;
  for (let i = 0; i < players.length; i++) {
    if (room.hands[players[i]]?.some(c => c.value === "3" && c.suit === "♣")) {
      room.turn = i;
      break;
    }
  }

  // แลกไพ่ถ้ามี prevRanking
  if (room.prevRanking && room.prevRanking.every(id => players.includes(id))) {
    applyCardSwap(room);
    room.swapInfo = buildSwapInfo(room);
  }
}

function applyCardSwap(room) {
  const [kingId, queenId, viceId, slaveId] = room.prevRanking;

  if (room.hands[slaveId] && room.hands[kingId]) {
    const slaveBest2 = getBestCards(room.hands[slaveId], 2);
    const kingWorst2 = getWorstCards(room.hands[kingId], 2);
    transferCards(room.hands[slaveId], room.hands[kingId], slaveBest2);
    transferCards(room.hands[kingId],  room.hands[slaveId], kingWorst2);
  }

  if (room.hands[viceId] && room.hands[queenId]) {
    const viceBest1   = getBestCards(room.hands[viceId], 1);
    const queenWorst1 = getWorstCards(room.hands[queenId], 1);
    transferCards(room.hands[viceId],  room.hands[queenId], viceBest1);
    transferCards(room.hands[queenId], room.hands[viceId],  queenWorst1);
  }
}

function buildSwapInfo(room) {
  const [kingId, queenId, viceId, slaveId] = room.prevRanking;
  const name = id => room.nicknames?.[id] || id;
  return [
    { from: name(slaveId), to: name(kingId),  count: 2, type: "ดีสุด"  },
    { from: name(kingId),  to: name(slaveId), count: 2, type: "แย่สุด" },
    { from: name(viceId),  to: name(queenId), count: 1, type: "ดีสุด"  },
    { from: name(queenId), to: name(viceId),  count: 1, type: "แย่สุด" },
  ];
}

function transferCards(from, to, cards) {
  cards.forEach(card => {
    const idx = from.findIndex(c => c.suit === card.suit && c.value === card.value);
    if (idx !== -1) to.push(from.splice(idx, 1)[0]);
  });
}

function getBestCards(hand, n) {
  const { compareCards } = require("./rules");
  return [...hand].sort((a, b) => compareCards(b, a)).slice(0, n);
}

function getWorstCards(hand, n) {
  const { compareCards } = require("./rules");
  return [...hand].sort((a, b) => compareCards(a, b)).slice(0, n);
}

function nextTurn(room) {
  const total = room.players.length;
  const dir   = room.direction || 1;
  let next     = (room.turn + dir + total) % total;
  let attempts = 0;
  // ✅ ข้ามคนที่หมดไพ่ และคนที่ pass แล้ว
  while (
    (room.hands[room.players[next]]?.length === 0 ||
     room.passedPlayers?.has(room.players[next])) &&
    attempts < total
  ) {
    next = (next + dir + total) % total;
    attempts++;
  }
  room.turn = next;
}

function reverseDirection(room) {
  room.direction = room.direction === 1 ? -1 : 1;
  room.table     = [];
  room.passCount = 0;

  const lastIdx = room.players.indexOf(room.lastPlayerId);
  if (lastIdx === -1) return;

  if (room.hands[room.lastPlayerId]?.length > 0) {
    room.turn = lastIdx;
    return;
  }

  // lastPlayer หมดไพ่แล้ว → หาคนถัดไปตามทิศใหม่
  const total = room.players.length;
  const dir   = room.direction;
  let next     = (lastIdx + dir + total) % total;
  let attempts = 0;
  while (room.hands[room.players[next]]?.length === 0 && attempts < total) {
    next = (next + dir + total) % total;
    attempts++;
  }
  room.turn = next;
}

// ✅ Turn timeout system
function startTurnTimeout(room, onTimeout) {
  clearTurnTimeout(room);
  room.turnTimer = setTimeout(() => {
    if (!room.started) return;
    // auto-pass สำหรับคนที่หมดเวลา
    onTimeout(room.players[room.turn]);
  }, TURN_TIMEOUT_MS);
}

function clearTurnTimeout(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

function checkWin(room, playerId) {
  if (room.hands[playerId]?.length === 0) {
    if (!room.finished.includes(playerId)) room.finished.push(playerId);
    return true;
  }
  return false;
}

function isGameOver(room) {
  const stillPlaying = room.players.filter(p => room.hands[p]?.length > 0);
  if (stillPlaying.length <= 1) {
    if (stillPlaying.length === 1 && !room.finished.includes(stillPlaying[0])) {
      room.finished.push(stillPlaying[0]);
    }
    return true;
  }
  return false;
}

function buildRanking(room) {
  const ranking = room.finished.map((id, i) => ({
    id,
    name:  room.nicknames?.[id] || id,
    rank:  RANKS[i]             || "slave",
    label: RANK_LABELS[RANKS[i]]|| "😓 สลาฟ"
  }));
  room.prevRanking = room.finished.slice();
  return ranking;
}

// ✅ จัดการ disconnect กลางเกม
function handleDisconnect(room, socketId) {
  const idx = room.players.indexOf(socketId);
  if (idx === -1) return;

  // ถ้าหมดไพ่แล้วหรือเกมยังไม่เริ่ม → ลบได้เลย
  if (!room.started) return;

  // ✅ ถ้าเป็น turn ของคนที่ disconnect → เลื่อน turn ก่อน
  if (room.turn === idx) {
    // ลบออกก่อนแล้วค่อย clamp
    room.players.splice(idx, 1);
    delete room.hands[socketId];
    room.passedPlayers?.delete(socketId);
    if (room.turn >= room.players.length) room.turn = 0;
  } else {
    room.players.splice(idx, 1);
    delete room.hands[socketId];
    room.passedPlayers?.delete(socketId);
    // ✅ ถ้า index เลื่อนหลัง splice → ปรับ turn
    if (idx < room.turn) room.turn = Math.max(0, room.turn - 1);
  }

  // ✅ ถ้า lastPlayerId คือคนที่ disconnect → reset
  if (room.lastPlayerId === socketId) room.lastPlayerId = null;

  // ✅ ถ้าเหลือ < 2 คน → จบเกมทันที
  const stillPlaying = room.players.filter(p => room.hands[p]?.length > 0);
  if (stillPlaying.length < 2) {
    room.started = false;
    return "abort";
  }
  return "continue";
}

module.exports = {
  startGame, nextTurn, reverseDirection,
  startTurnTimeout, clearTurnTimeout,
  checkWin, isGameOver, buildRanking,
  handleDisconnect, RANK_LABELS, TURN_TIMEOUT_MS
};