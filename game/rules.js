const valueOrder = ["3","4","5","6","7","8","9","10","J","Q","K","A","2"];
const suitOrder  = ["♣","♦","♥","♠"];

function getValueRank(card) { return valueOrder.indexOf(card.value); }
function getSuitRank(card)  { return suitOrder.indexOf(card.suit); }

// เทียบไพ่ 2 ใบ (ค่าก่อน, ถ้าเท่ากันเทียบดอก)
function compareCards(a, b) {
  const vd = getValueRank(a) - getValueRank(b);
  if (vd !== 0) return vd;
  return getSuitRank(a) - getSuitRank(b);
}

// ไพ่ที่ใหญ่สุดในกลุ่ม (ใช้เทียบระหว่างชุด)
function getHighCard(cards) {
  return cards.reduce((best, c) => compareCards(c, best) > 0 ? c : best, cards[0]);
}

// ประเภทของชุดไพ่ที่ลง
function getPlayType(cards) {
  if (!cards || cards.length === 0) return "invalid";
  if (cards.length === 1) return "single";
  if (cards.length === 2 && cards[0].value === cards[1].value) return "pair";
  if (cards.length === 3 && cards.every(c => c.value === cards[0].value)) return "tong";
  if (cards.length === 4 && cards.every(c => c.value === cards[0].value)) return "quad";
  return "invalid";
}

// ตารางว่า playType ใดชนะ tableType ได้
//   tong  ชนะ single
//   quad  ชนะ pair
//   ประเภทเดียวกัน → เทียบ highCard
function isValidMove(cards, table) {
  if (!Array.isArray(cards) || cards.length === 0) return false;

  const playType = getPlayType(cards);
  if (playType === "invalid") return false;

  if (table.length === 0) return true;

  const lastPlay  = table[table.length - 1];
  const tableType = getPlayType(lastPlay);

  // กฎพิเศษ: ชนะข้ามประเภท
  if (playType === "tong" && tableType === "single") return true;
  if (playType === "quad" && tableType === "pair")   return true;

  // ถ้าต่างประเภท (และไม่ใช่กรณีพิเศษ) → ลงไม่ได้
  if (playType !== tableType) return false;

  // ประเภทเดียวกัน → เทียบ high card
  return compareCards(getHighCard(cards), getHighCard(lastPlay)) > 0;
}

// ใช้ใน frontend: ไพ่ใบนี้ลงได้ไหม (คนเดียวหรือเป็นส่วนหนึ่งของชุด)
function canCardPlay(card, hand, table) {
  const sameVal = hand.filter(c => c.value === card.value);

  // เช็คแบบ single
  if (isValidMove([card], table)) return true;
  // เช็คแบบ pair
  if (sameVal.length >= 2 && isValidMove(sameVal.slice(0, 2), table)) return true;
  // เช็คแบบ tong
  if (sameVal.length >= 3 && isValidMove(sameVal.slice(0, 3), table)) return true;
  // เช็คแบบ quad
  if (sameVal.length >= 4 && isValidMove(sameVal.slice(0, 4), table)) return true;

  return false;
}

module.exports = { isValidMove, getPlayType, compareCards, getHighCard, canCardPlay };