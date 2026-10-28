import { QUIZ_FIRST, QUIZ_INTERVAL, QUIZ_TIMEOUT } from './config.js';

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

function question() {
  const kind = randInt(0, 3);
  let a;
  let b;
  let text;
  let answer;
  if (kind === 0) {
    a = randInt(2, 19);
    b = randInt(2, 19);
    text = `${a} + ${b}`;
    answer = a + b;
  } else if (kind === 1) {
    a = randInt(6, 25);
    b = randInt(1, a - 1);
    text = `${a} − ${b}`;
    answer = a - b;
  } else if (kind === 2) {
    a = randInt(2, 9);
    b = randInt(2, 9);
    text = `${a} × ${b}`;
    answer = a * b;
  } else {
    b = randInt(2, 9);
    answer = randInt(2, 9);
    a = b * answer;
    text = `${a} ÷ ${b}`;
  }
  const options = new Set([answer]);
  while (options.size < 3) {
    const off = randInt(1, Math.max(3, Math.round(answer * 0.25))) * (Math.random() < 0.5 ? -1 : 1);
    if (answer + off >= 0) options.add(answer + off);
  }
  const list = [...options].sort(() => Math.random() - 0.5);
  return { text: `${text} = ?`, options: list, answer, correct: list.indexOf(answer), timeLeft: QUIZ_TIMEOUT };
}

export class Quiz {
  constructor() {
    this.reset();
  }

  reset() {
    this.timer = QUIZ_FIRST;
    this.current = null;
    this.asked = 0;
    this.right = 0;
  }

  get nextIn() {
    return Math.max(0, this.timer);
  }

  // Counts down while the game runs; returns a new question when one is due and allowed.
  update(dt, canAsk) {
    if (this.current) return null;
    this.timer -= dt;
    if (this.timer > 0 || !canAsk) return null;
    this.current = question();
    this.asked++;
    return this.current;
  }

  answer(index) {
    const q = this.current;
    if (!q) return false;
    const ok = index === q.correct;
    if (ok) this.right++;
    this.current = null;
    this.timer = QUIZ_INTERVAL;
    return ok;
  }
}
