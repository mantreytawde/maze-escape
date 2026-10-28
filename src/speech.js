const ONES = {
  zero: 0, oh: 0, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, tree: 3, four: 4, for: 4, fore: 4,
  five: 5, six: 6, sex: 6, seven: 7, eight: 8, ate: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// Every number said in `text`, from digits ("12") or words ("twenty one", "a hundred").
export function parseNumbers(text) {
  const out = [];
  const words = text.toLowerCase().replace(/-/g, ' ').match(/[a-z]+|\d+/g) ?? [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^\d+$/.test(w)) {
      out.push(Number(w));
    } else if (w === 'hundred' && (i === 0 || !(words[i - 1] in ONES))) {
      out.push(100);
    } else if (w in TENS) {
      const next = words[i + 1];
      if (next in ONES && ONES[next] > 0 && ONES[next] < 10) {
        out.push(TENS[w] + ONES[next]);
        i++;
      } else {
        out.push(TENS[w]);
      }
    } else if (w in ONES) {
      out.push(ONES[w]);
    }
  }
  return out;
}

const LETTERS = { a: 0, ay: 0, b: 1, be: 1, bee: 1, c: 2, see: 2, sea: 2 };

// Which option (0-2) the speaker picked, or -1.
export function matchAnswer(transcripts, options) {
  for (const t of transcripts) {
    const nums = parseNumbers(t);
    for (let k = nums.length - 1; k >= 0; k--) {
      const idx = options.indexOf(nums[k]);
      if (idx >= 0) return idx;
    }
    const m = t.toLowerCase().match(/\b(?:option|answer|letter)\s+([a-z]+)/);
    if (m && m[1] in LETTERS) return LETTERS[m[1]];
  }
  return -1;
}

export class Voice {
  constructor() {
    this.Rec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    this.supported = !!this.Rec;
    this.rec = null;
    this.wanted = false;
    this.failed = false;
  }

  // Calls onHeard(transcripts) for every phrase; onState('listening' | 'unavailable' | 'denied').
  start(onHeard, onState) {
    this.stop();
    if (!this.supported || this.failed) {
      onState?.('unavailable');
      return;
    }
    this.wanted = true;
    this.onHeard = onHeard;
    this.onState = onState;
    this.restarts = 0;
    this.open();
  }

  open() {
    let rec;
    try {
      rec = new this.Rec();
    } catch {
      this.failed = true;
      this.onState?.('unavailable');
      return;
    }
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.onstart = () => this.onState?.('listening');
    rec.onresult = (e) => {
      const list = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        for (let j = 0; j < e.results[i].length; j++) list.push(e.results[i][j].transcript);
      }
      if (list.length) this.onHeard?.(list);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.failed = true;
        this.wanted = false;
        this.onState?.('denied');
      } else if (e.error === 'audio-capture' || e.error === 'network') {
        this.failed = true;
        this.wanted = false;
        this.onState?.('unavailable');
      }
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      if (this.wanted && this.restarts++ < 20) setTimeout(() => this.wanted && this.open(), 150);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.failed = true;
      this.onState?.('unavailable');
    }
  }

  stop() {
    this.wanted = false;
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
  }
}

// Asks for the microphone once from the flat page so the headset never has to show a prompt.
export async function requestMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}
