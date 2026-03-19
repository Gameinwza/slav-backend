function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const values = ["3","4","5","6","7","8","9","10","J","Q","K","A","2"];

  let deck = [];
  for (let s of suits) {
    for (let v of values) {
      deck.push({ suit: s, value: v });
    }
  }

  return shuffle(deck);
}

// ✅ Fisher-Yates — สุ่มสม่ำเสมอกว่า sort(Math.random - 0.5)
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

module.exports = { createDeck };