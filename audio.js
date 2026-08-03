

const SFX = (() => {
  let ctx = null;
  let muted = false;
  let chompToggle = false;
  let sirenOsc = null;
  let sirenGain = null;

  function ensureCtx() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function beep({ freq = 440, duration = 0.08, type = "square", volume = 0.05, slideTo = null, delay = 0 }) {
    if (muted) return;
    const c = ensureCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime + delay);
    if (slideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), c.currentTime + delay + duration);
    }
    gain.gain.setValueAtTime(volume, c.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + delay);
    osc.stop(c.currentTime + delay + duration + 0.02);
  }

  return {
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    chomp() {
      chompToggle = !chompToggle;
      beep({ freq: chompToggle ? 220 : 260, duration: 0.06, type: "square", volume: 0.04 });
    },
    powerPellet() {
      beep({ freq: 150, duration: 0.25, type: "sawtooth", volume: 0.06, slideTo: 60 });
    },
    eatGhost() {
      beep({ freq: 700, duration: 0.18, type: "square", volume: 0.07, slideTo: 1200 });
    },
    death() {
      if (muted) return;
      const c = ensureCtx();
      for (let i = 0; i < 8; i++) {
        beep({ freq: 400 - i * 40, duration: 0.12, type: "sawtooth", volume: 0.06, delay: i * 0.09 });
      }
    },
    extraLife() {
      beep({ freq: 440, duration: 0.1, type: "square", volume: 0.06 });
      beep({ freq: 660, duration: 0.15, type: "square", volume: 0.06, delay: 0.1 });
    },
    levelComplete() {
      for (let i = 0; i < 6; i++) {
        beep({ freq: 300 + i * 90, duration: 0.12, type: "triangle", volume: 0.06, delay: i * 0.11 });
      }
    },
    startJingle() {
      const notes = [392, 523, 659, 784, 659, 523, 392, 330];
      notes.forEach((f, i) => beep({ freq: f, duration: 0.14, type: "square", volume: 0.05, delay: i * 0.14 }));
    },
  };
})();
