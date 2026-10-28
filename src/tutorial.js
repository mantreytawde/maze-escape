const HANDS = [
  {
    demo: 'wave',
    title: 'Welcome to Maze Escape',
    text: "I'm your guide. Copy what I do: I'm your mirror, so my hand on your right is your right hand. Point at a button and pinch, or just poke it with a finger.",
  },
  {
    demo: 'forward',
    title: 'Walk forward',
    text: 'Hold one open hand straight out in front of you, at chest height. Lower it to stop.',
    practice: (d) => d.forward >= 1.5,
    goal: 'Walk forward a few steps',
  },
  {
    demo: 'back',
    title: 'Walk backwards',
    text: 'Pull an open hand back beside your shoulder, palm forward, to step backwards.',
    practice: (d) => d.back >= 0.6,
    goal: 'Back up a little',
  },
  {
    demo: 'turn',
    title: 'Turn',
    text: 'Stretch an arm straight out to the side to turn that way. Bring it back in, then out again to keep turning.',
    practice: (d) => d.turns >= 1,
    goal: 'Turn once',
  },
  {
    demo: 'teleport',
    title: 'Jump ahead (teleport)',
    text: 'Pinch with your right hand, aim the blue arc at the floor, then let go to jump there.',
    practice: (d) => d.teleports >= 1,
    goal: 'Teleport once',
  },
  {
    demo: 'collect',
    title: 'Keys and gates',
    text: 'You never have to hold anything. Walk up to a glowing key and it goes into your pocket. Walk up to its gate and it unlocks by itself.',
  },
  {
    demo: 'quiz',
    title: 'Quick questions',
    text: 'Every so often a simple math question appears. Say the answer out loud, or point and pinch. Answer right and the arrows show you the way for a while. Answer wrong and you are on your own.',
    quiz: { text: '7 + 5 = ?', options: [11, 12, 13], answer: 1 },
  },
  {
    demo: 'danger',
    title: 'Danger zones and lights',
    text: 'When the lights turn red and an alarm sounds, you are in a danger zone. Follow the arrows out before the clock runs out. Flickering lights just make it harder to see. Keep going.',
  },
  {
    demo: 'menu',
    title: 'Hearts and the menu',
    text: 'You have three red hearts. The zombie lives off the right path, and each catch costs a heart. To open the menu, turn your left palm toward your face and pinch.',
    menu: true,
    goal: 'Open the menu once',
  },
  {
    demo: 'cheer',
    title: "You're ready",
    text: 'Find three keys, open three gates, get out. Good luck.',
    last: true,
  },
];

const CONTROLLERS = [
  { ...HANDS[0], text: "I'm your guide. Point at a button and pull the trigger to press it." },
  { ...HANDS[1], text: 'Push the left stick forward to walk. Where you look is forward.' },
  { ...HANDS[2], text: 'Pull the left stick back to step backwards.' },
  { ...HANDS[3], text: 'Flick the right stick left or right to turn.' },
  { ...HANDS[4], text: 'Push the right stick forward, aim the arc at the floor, then let go to jump there.' },
  HANDS[5],
  { ...HANDS[6], text: HANDS[6].text.replace('point and pinch', 'point and pull the trigger') },
  HANDS[7],
  { ...HANDS[8], text: 'You have three red hearts. The zombie lives off the right path, and each catch costs a heart. Press A, B, X or Y to open the menu.' },
  HANDS[9],
];

const SKIP_AFTER = 8;

export class Tutorial {
  constructor({ panel, guide, player, audio }) {
    Object.assign(this, { panel, guide, player, audio });
    this.active = false;
    this.onFinish = null;
    this.onExit = null;
  }

  start(hands) {
    this.steps = hands ? HANDS : CONTROLLERS;
    this.hands = hands;
    this.active = true;
    this.go(0);
  }

  stop() {
    this.active = false;
    this.panel.hide();
  }

  get step() {
    return this.steps[this.index];
  }

  go(i) {
    this.index = Math.max(0, Math.min(this.steps.length - 1, i));
    this.t = 0;
    this.done = false;
    this.doneAt = 0;
    this.picked = -1;
    this.base = { ...this.player.stats };
    this.guide.play(this.step.demo);
    this.render();
  }

  get needsPractice() {
    const s = this.step;
    return !!(s.practice || s.menu || s.quiz);
  }

  complete() {
    if (this.done) return;
    this.done = true;
    this.doneAt = this.t;
    this.audio.play('correct', 0.5);
    this.render();
  }

  render() {
    const s = this.step;
    const buttons = [];
    if (s.quiz && !this.done) {
      s.quiz.options.forEach((o, i) => buttons.push({ id: `opt${i}`, label: String(o), size: 56, color: this.picked === i ? '#ff6a5a' : undefined }));
    } else {
      if (this.index > 0) buttons.push({ id: 'back', label: 'Back' });
      if (this.needsPractice && !this.done && this.t > SKIP_AFTER) buttons.push({ id: 'skip', label: 'Skip' });
      if (!this.needsPractice || this.done) buttons.push({ id: s.last ? 'start' : 'next', label: s.last ? 'Start game' : 'Next', color: s.last ? '#7fe08a' : undefined });
    }
    let status = '';
    let statusColor;
    if (this.done) {
      status = 'Nice!';
    } else if (s.goal) {
      status = `Try it: ${s.goal}`;
      statusColor = '#ffd27a';
    } else if (s.quiz) {
      status = `${s.quiz.text}   Say it, or pick one`;
      statusColor = '#9fe7ff';
    }
    this.renderedSkip = this.t > SKIP_AFTER;
    this.panel.show({
      badge: `Step ${this.index + 1} of ${this.steps.length}`,
      title: s.title,
      titleSize: 60,
      lines: [s.text],
      textSize: 40,
      status,
      statusColor,
      buttons,
      footer: this.index === 0 ? 'Main menu is always one gesture away' : '',
    });
  }

  press(id) {
    if (id === 'next') this.go(this.index + 1);
    else if (id === 'back') this.go(this.index - 1);
    else if (id === 'skip') this.go(this.index + 1);
    else if (id === 'start') {
      this.stop();
      this.onFinish?.();
    } else if (id.startsWith('opt')) this.answer(Number(id.slice(3)));
  }

  answer(i) {
    const q = this.step.quiz;
    if (!q || this.done) return;
    if (i === q.answer) this.complete();
    else {
      this.picked = i;
      this.audio.play('wrong', 0.5);
      this.render();
    }
  }

  menuOpened() {
    if (this.active && this.step.menu) {
      this.complete();
      return true;
    }
    return false;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const s = this.step;
    if (!this.done && s.practice) {
      const now = this.player.stats;
      const d = {
        forward: now.forward - this.base.forward,
        back: now.back - this.base.back,
        turns: now.turns - this.base.turns,
        teleports: now.teleports - this.base.teleports,
      };
      if (s.practice(d)) this.complete();
    }
    if (this.done && this.needsPractice && this.t - this.doneAt > 1.4) this.go(this.index + 1);
    if (!this.renderedSkip && this.t > SKIP_AFTER && this.needsPractice && !this.done) this.render();
  }
}
