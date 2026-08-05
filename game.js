
const TILE = 24;
const CANVAS_WIDTH = MAZE_COLS * TILE;
const CANVAS_HEIGHT = MAZE_ROWS * TILE;

const DIRS = {
  UP: { x: 0, y: -1, name: "UP" },
  DOWN: { x: 0, y: 1, name: "DOWN" },
  LEFT: { x: -1, y: 0, name: "LEFT" },
  RIGHT: { x: 1, y: 0, name: "RIGHT" },
};
const REVERSE = { UP: DIRS.DOWN, DOWN: DIRS.UP, LEFT: DIRS.RIGHT, RIGHT: DIRS.LEFT };
const TURN_PRIORITY = [DIRS.UP, DIRS.LEFT, DIRS.DOWN, DIRS.RIGHT];

const PACMAN_BASE_SPEED = 8.4; // tiles/seg
const GHOST_BASE_SPEED = 7.6;
const GHOST_FRIGHT_SPEED = 4.4;
const GHOST_EATEN_SPEED = 13;
const GHOST_HOUSE_SPEED = 3.2;

const POINTS_PELLET = 10;
const POINTS_POWER = 50;
const GHOST_EAT_SCORES = [200, 400, 800, 1600];
const EXTRA_LIFE_SCORE = 10000;

// Duraciones de scatter/chase (segundos) - patrón clásico simplificado
const MODE_SCHEDULE = [
  { mode: "SCATTER", duration: 7 },
  { mode: "CHASE", duration: 20 },
  { mode: "SCATTER", duration: 7 },
  { mode: "CHASE", duration: 20 },
  { mode: "SCATTER", duration: 5 },
  { mode: "CHASE", duration: 20 },
  { mode: "SCATTER", duration: 5 },
  { mode: "CHASE", duration: Infinity },
];

const GHOST_RELEASE_DELAY = { blinky: 0, pinky: 1, inky: 5, clyde: 9 };

// ---------- Estado global ----------
let grid = buildMazeGrid();
let totalPellets = countTotalPellets(grid);
let pelletsRemaining = totalPellets;

let score = 0;
let highScore = parseInt(localStorage.getItem("pacman_high_score") || "0", 10);
let lives = 3;
let level = 1;
let extraLifeAwarded = false;

const GAME_STATE = {
  START: "START",
  READY: "READY",
  PLAYING: "PLAYING",
  DYING: "DYING",
  LEVEL_COMPLETE: "LEVEL_COMPLETE",
  GAME_OVER: "GAME_OVER",
};
let gameState = GAME_STATE.START;
let stateTimer = 0;

let freezeTimer = 0; // pausa breve al comer fantasma
const floatingTexts = [];

let globalModeIndex = 0;
let globalModeTimer = MODE_SCHEDULE[0].duration;
let frightTimer = 0;
let frightDuration = 6;
let ghostEatCombo = 0;

// ---------- Utilidades de grilla ----------
function wrapCol(c) {
  if (c < 0) return MAZE_COLS - 1;
  if (c >= MAZE_COLS) return 0;
  return c;
}

function cellAt(col, row) {
  const r = Math.round(row);
  let c = Math.round(col);
  if (r < 0 || r >= MAZE_ROWS) return { wall: true };
  c = wrapCol(c);
  return grid[r][c];
}

function isOpen(col, row, forGhost) {
  const cell = cellAt(col, row);
  if (cell.wall) return false;
  if (cell.door && !forGhost) return false;
  return true;
}

function distSq(aCol, aRow, bCol, bRow) {
  const dx = aCol - bCol;
  const dy = aRow - bRow;
  return dx * dx + dy * dy;
}

const CENTER_EPS = 1e-6;
function isAtCenter(entity) {
  return (
    Math.abs(entity.col - Math.round(entity.col)) < CENTER_EPS &&
    Math.abs(entity.row - Math.round(entity.row)) < CENTER_EPS
  );
}


function advanceAlongAxis(entity, step) {
  if (entity.dir.x !== 0) {
    const sign = entity.dir.x;
    const next = sign > 0 ? Math.floor(entity.col) + 1 : Math.ceil(entity.col) - 1;
    let newCol = entity.col + sign * step;
    newCol = sign > 0 ? Math.min(newCol, next) : Math.max(newCol, next);
    entity.col = newCol;
  } else if (entity.dir.y !== 0) {
    const sign = entity.dir.y;
    const next = sign > 0 ? Math.floor(entity.row) + 1 : Math.ceil(entity.row) - 1;
    let newRow = entity.row + sign * step;
    newRow = sign > 0 ? Math.min(newRow, next) : Math.max(newRow, next);
    entity.row = newRow;
  }
  entity.col = wrapAroundValue(entity.col);
}


class Pacman {
  constructor() {
    this.reset();
  }
  reset() {
    this.col = PACMAN_START.col;
    this.row = PACMAN_START.row;
    this.dir = DIRS.LEFT;
    this.queuedDir = DIRS.LEFT;
    this.speed = PACMAN_BASE_SPEED;
    this.mouthAngle = 0;
    this.mouthDir = 1;
    this.moving = true;
    this.alive = true;
    this.deathTimer = 0;
  }
  update(dt) {
    if (!this.alive) return;
    this.mouthAngle += this.mouthDir * dt * 14;
    if (this.mouthAngle > 0.9) { this.mouthAngle = 0.9; this.mouthDir = -1; }
    if (this.mouthAngle < 0) { this.mouthAngle = 0; this.mouthDir = 1; }

    if (isAtCenter(this)) {
      this.col = Math.round(this.col);
      this.row = Math.round(this.row);
      if (this.queuedDir !== this.dir && isOpen(this.col + this.queuedDir.x, this.row + this.queuedDir.y, false)) {
        this.dir = this.queuedDir;
      }
      this.moving = isOpen(this.col + this.dir.x, this.row + this.dir.y, false);
    }

    if (this.moving) {
      advanceAlongAxis(this, this.speed * dt);
    }

    this.eatPellets();
  }
  eatPellets() {
    const c = Math.round(this.col);
    const r = Math.round(this.row);
    if (Math.abs(this.col - c) < 0.25 && Math.abs(this.row - r) < 0.25) {
      const cell = cellAt(c, r);
      if (cell.pellet && !cell.eaten) {
        cell.eaten = true;
        cell.pellet = false;
        pelletsRemaining--;
        addScore(POINTS_PELLET);
        SFX.chomp();
      } else if (cell.power && !cell.eaten) {
        cell.eaten = true;
        cell.power = false;
        pelletsRemaining--;
        addScore(POINTS_POWER);
        SFX.powerPellet();
        startFrightMode();
      }
    }
  }
}

function wrapAroundValue(col) {
  if (col < -0.5) return MAZE_COLS - 0.5;
  if (col > MAZE_COLS - 0.5) return -0.5;
  return col;
}


class Ghost {
  constructor(name, color, slot, scatterTarget) {
    this.name = name;
    this.color = color;
    this.slot = slot;
    this.scatterTarget = scatterTarget;
    this.reset();
  }
  reset() {
    this.col = this.slot.col;
    this.row = this.slot.row;
    this.dir = DIRS.LEFT;
    this.state = "HOUSE"; // HOUSE, EXITING, SCATTER, CHASE, FRIGHTENED, EATEN
    this.releaseTimer = GHOST_RELEASE_DELAY[this.name];
    this.bob = Math.random() * Math.PI * 2;
    this.frightFlash = false;
  }
  currentSpeed() {
    if (this.state === "FRIGHTENED") return GHOST_FRIGHT_SPEED;
    if (this.state === "EATEN") return GHOST_EATEN_SPEED;
    if (this.state === "HOUSE" || this.state === "EXITING") return GHOST_HOUSE_SPEED;
    return GHOST_BASE_SPEED * (1 + (level - 1) * 0.02);
  }
  getTarget(pacman, blinky) {
    if (this.state === "EATEN") return GHOST_HOUSE.center;
    if (this.state === "FRIGHTENED") return null; // movimiento aleatorio
    if (this.state === "SCATTER") return this.scatterTarget;
    // CHASE: comportamiento según personalidad
    switch (this.name) {
      case "blinky":
        return { col: pacman.col, row: pacman.row };
      case "pinky": {
        let tc = pacman.col + pacman.dir.x * 4;
        let tr = pacman.row + pacman.dir.y * 4;
        if (pacman.dir === DIRS.UP) tc -= 4; // réplica del bug clásico
        return { col: tc, row: tr };
      }
      case "inky": {
        const px = pacman.col + pacman.dir.x * 2;
        const py = pacman.row + pacman.dir.y * 2;
        const vx = px - blinky.col;
        const vy = py - blinky.row;
        return { col: blinky.col + 2 * vx, row: blinky.row + 2 * vy };
      }
      case "clyde": {
        const d = distSq(this.col, this.row, pacman.col, pacman.row);
        if (d > 64) return { col: pacman.col, row: pacman.row };
        return this.scatterTarget;
      }
      default:
        return { col: pacman.col, row: pacman.row };
    }
  }
  update(dt, pacman, blinky) {
    this.bob += dt * 4;

    if (this.state === "HOUSE") {
      this.releaseTimer -= dt;
      this.row = this.slot.row + Math.sin(this.bob) * 0.08;
      if (this.releaseTimer <= 0) {
        this.state = "EXITING";
        this.col = this.slot.col;
      }
      return;
    }

    const speed = this.currentSpeed();

    if (this.state === "EXITING") {
      const targetCol = GHOST_HOUSE.exit.col;
      const targetRow = GHOST_HOUSE.exit.row;
      if (Math.abs(this.col - targetCol) > 0.05) {
        this.col += Math.sign(targetCol - this.col) * speed * dt;
      } else {
        this.col = targetCol;
        this.row -= speed * dt;
        if (this.row <= targetRow) {
          this.row = targetRow;
          this.state = currentGlobalMode();
          this.dir = DIRS.LEFT;
        }
      }
      return;
    }

    if (this.state === "EATEN") {
      const dCol = GHOST_HOUSE.center.col - this.col;
      const dRow = GHOST_HOUSE.center.row - this.row;
      if (Math.abs(dCol) < 0.15 && Math.abs(dRow) < 0.15) {
        this.state = "HOUSE";
        this.releaseTimer = 1.2;
        this.col = GHOST_HOUSE.center.col;
        this.row = GHOST_HOUSE.center.row;
        return;
      }
    }

    if (isAtCenter(this)) {
      this.col = Math.round(this.col);
      this.row = Math.round(this.row);
      this.chooseDirection(pacman, blinky);
    }

    advanceAlongAxis(this, speed * dt);
  }
  chooseDirection(pacman, blinky) {
    const options = [];
    for (const d of TURN_PRIORITY) {
      if (d === REVERSE[this.dir.name]) continue;
      const nc = this.col + d.x;
      const nr = this.row + d.y;
      if (isOpen(nc, nr, true)) options.push(d);
    }
    if (options.length === 0) {
      // callejón sin salida: permitir reversa
      const back = REVERSE[this.dir.name];
      if (isOpen(this.col + back.x, this.row + back.y, true)) options.push(back);
      else return;
    }

    if (this.state === "FRIGHTENED") {
      this.dir = options[Math.floor(Math.random() * options.length)];
      return;
    }

    const target = this.getTarget(pacman, blinky);
    let best = options[0];
    let bestDist = Infinity;
    for (const d of options) {
      const nc = this.col + d.x;
      const nr = this.row + d.y;
      const dd = distSq(nc, nr, target.col, target.row);
      if (dd < bestDist) {
        bestDist = dd;
        best = d;
      }
    }
    this.dir = best;
  }
}

function currentGlobalMode() {
  return MODE_SCHEDULE[globalModeIndex].mode;
}


const pacman = new Pacman();
const blinky = new Ghost("blinky", "#ff0000", GHOST_HOUSE.slots.blinky, SCATTER_TARGETS.blinky);
const pinky = new Ghost("pinky", "#ffb8ff", GHOST_HOUSE.slots.pinky, SCATTER_TARGETS.pinky);
const inky = new Ghost("inky", "#00ffff", GHOST_HOUSE.slots.inky, SCATTER_TARGETS.inky);
const clyde = new Ghost("clyde", "#ffb852", GHOST_HOUSE.slots.clyde, SCATTER_TARGETS.clyde);
const ghosts = [blinky, pinky, inky, clyde];


function addScore(points) {
  score += points;
  if (!extraLifeAwarded && score >= EXTRA_LIFE_SCORE) {
    extraLifeAwarded = true;
    lives++;
    SFX.extraLife();
  }
  if (score > highScore) highScore = score;
  updateHUD();
}

function startFrightMode() {
  frightDuration = Math.max(1.5, 6 - (level - 1) * 0.4);
  frightTimer = frightDuration;
  ghostEatCombo = 0;
  for (const g of ghosts) {
    if (g.state === "SCATTER" || g.state === "CHASE" || g.state === "FRIGHTENED") {
      g.state = "FRIGHTENED";
      g.dir = REVERSE[g.dir.name];
    }
  }
}


function checkGhostCollisions() {
  for (const g of ghosts) {
    if (g.state === "EATEN" || g.state === "HOUSE" || g.state === "EXITING") continue;
    const d = distSq(pacman.col, pacman.row, g.col, g.row);
    if (d < 0.35) {
      if (g.state === "FRIGHTENED") {
        eatGhost(g);
      } else {
        killPacman();
      }
      return;
    }
  }
}

function eatGhost(g) {
  const pts = GHOST_EAT_SCORES[Math.min(ghostEatCombo, GHOST_EAT_SCORES.length - 1)];
  ghostEatCombo++;
  addScore(pts);
  SFX.eatGhost();
  g.state = "EATEN";
  floatingTexts.push({ x: g.col * TILE + TILE / 2, y: g.row * TILE, text: String(pts), timer: 0.8, color: "#00ffff" });
  freezeTimer = 0.4;
}

function killPacman() {
  pacman.alive = false;
  pacman.deathTimer = 1.4;
  gameState = GAME_STATE.DYING;
  stateTimer = 1.4;
  SFX.death();
}


function updateGlobalMode(dt) {
  if (frightTimer > 0) {
    frightTimer -= dt;
    if (frightTimer <= 0) {
      frightTimer = 0;
      for (const g of ghosts) {
        if (g.state === "FRIGHTENED") g.state = currentGlobalMode();
      }
    }
    return;
  }
  if (globalModeTimer === Infinity) return;
  globalModeTimer -= dt;
  if (globalModeTimer <= 0) {
    globalModeIndex = Math.min(globalModeIndex + 1, MODE_SCHEDULE.length - 1);
    globalModeTimer = MODE_SCHEDULE[globalModeIndex].duration;
    const newMode = MODE_SCHEDULE[globalModeIndex].mode;
    for (const g of ghosts) {
      if (g.state === "SCATTER" || g.state === "CHASE") {
        g.state = newMode;
        g.dir = REVERSE[g.dir.name];
      }
    }
  }
}


function resetPositions() {
  pacman.reset();
  for (const g of ghosts) g.reset();
  globalModeIndex = 0;
  globalModeTimer = MODE_SCHEDULE[0].duration;
  frightTimer = 0;
}

function startLevel(newLevel) {
  level = newLevel;
  grid = buildMazeGrid();
  totalPellets = countTotalPellets(grid);
  pelletsRemaining = totalPellets;
  resetPositions();
  gameState = GAME_STATE.READY;
  stateTimer = 2;
  updateHUD();
}

function startNewGame() {
  score = 0;
  lives = 3;
  level = 1;
  extraLifeAwarded = false;
  startLevel(1);
  SFX.startJingle();
}


const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("high-score");
const levelEl = document.getElementById("level");
const livesIconsEl = document.getElementById("lives-icons");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlay-title");
const overlayMessageEl = document.getElementById("overlay-message");
const overlayControlsEl = document.getElementById("overlay-controls");
const nameEntryEl = document.getElementById("name-entry");
const nameInputEl = document.getElementById("name-input");
const submitScoreBtnEl = document.getElementById("submit-score-btn");
const leaderboardPanelEl = document.getElementById("leaderboard-panel");
const leaderboardListEl = document.getElementById("leaderboard-list");
const leaderboardNoteEl = document.getElementById("leaderboard-note");
const closeLeaderboardBtnEl = document.getElementById("close-leaderboard-btn");
const rankingBtnEl = document.getElementById("ranking-btn");
const restartHintEl = document.getElementById("restart-hint");

function updateHUD() {
  scoreEl.textContent = String(score).padStart(2, "0");
  highScoreEl.textContent = String(Math.max(score, highScore)).padStart(2, "0");
  levelEl.textContent = String(level);
  livesIconsEl.innerHTML = "";
  for (let i = 0; i < Math.max(lives - 1, 0); i++) {
    const icon = document.createElement("div");
    icon.className = "life-icon";
    livesIconsEl.appendChild(icon);
  }
}


const canvas = document.getElementById("game-canvas");
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const ctx = canvas.getContext("2d");

function neighborIsWall(r, c) {
  if (r === TUNNEL_ROW && (c < 0 || c >= MAZE_COLS)) return false;
  if (r < 0 || r >= MAZE_ROWS) return true;
  const cc = wrapCol(c);
  return grid[r][cc].wall;
}

function drawMaze() {
  ctx.strokeStyle = "#2222ff";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const inset = 3;

  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      if (!grid[r][c].wall) continue;
      const x = c * TILE;
      const y = r * TILE;
      ctx.beginPath();
      if (!neighborIsWall(r - 1, c)) {
        ctx.moveTo(x + inset, y + inset);
        ctx.lineTo(x + TILE - inset, y + inset);
      }
      if (!neighborIsWall(r + 1, c)) {
        ctx.moveTo(x + inset, y + TILE - inset);
        ctx.lineTo(x + TILE - inset, y + TILE - inset);
      }
      if (!neighborIsWall(r, c - 1)) {
        ctx.moveTo(x + inset, y + inset);
        ctx.lineTo(x + inset, y + TILE - inset);
      }
      if (!neighborIsWall(r, c + 1)) {
        ctx.moveTo(x + TILE - inset, y + inset);
        ctx.lineTo(x + TILE - inset, y + TILE - inset);
      }
      ctx.stroke();
    }
  }


  const doorY = GHOST_HOUSE.door.row * TILE;
  ctx.strokeStyle = "#ffb8ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(12 * TILE, doorY);
  ctx.lineTo(16 * TILE, doorY);
  ctx.stroke();

  // Pellets
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const cell = grid[r][c];
      const cx = c * TILE + TILE / 2;
      const cy = r * TILE + TILE / 2;
      if (cell.pellet) {
        ctx.fillStyle = "#ffd9a0";
        ctx.beginPath();
        ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell.power) {
        const pulse = 4 + Math.sin(performance.now() / 150) * 2;
        ctx.fillStyle = "#ffd9a0";
        ctx.beginPath();
        ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawPacman() {
  const x = pacman.col * TILE + TILE / 2;
  const y = pacman.row * TILE + TILE / 2;
  const radius = TILE / 2 - 1;

  if (!pacman.alive) {
    const progress = 1 - Math.max(pacman.deathTimer, 0) / 1.4;
    ctx.fillStyle = "#ffff00";
    ctx.beginPath();
    const startA = -0.5 * Math.PI + progress * Math.PI;
    const endA = 1.5 * Math.PI - progress * Math.PI;
    if (progress < 0.98) {
      ctx.moveTo(x, y);
      ctx.arc(x, y, radius, startA, endA);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  let rotation = 0;
  if (pacman.dir === DIRS.RIGHT) rotation = 0;
  if (pacman.dir === DIRS.DOWN) rotation = Math.PI / 2;
  if (pacman.dir === DIRS.LEFT) rotation = Math.PI;
  if (pacman.dir === DIRS.UP) rotation = -Math.PI / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = "#ffff00";
  ctx.beginPath();
  const mouth = pacman.moving ? pacman.mouthAngle : 0.35;
  ctx.arc(0, 0, radius, mouth * Math.PI, (2 - mouth) * Math.PI);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGhost(g) {
  const x = g.col * TILE + TILE / 2;
  const y = g.row * TILE + TILE / 2;
  const r = TILE / 2 - 1;

  if (g.state === "EATEN") {
    drawEyes(x, y, g.dir);
    return;
  }

  let bodyColor = g.color;
  if (g.state === "FRIGHTENED") {
    const flashing = frightTimer < 1.5 && Math.floor(frightTimer * 6) % 2 === 0;
    bodyColor = flashing ? "#ffffff" : "#2121ff";
  }

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(x, y - 1, r, Math.PI, 0);
  ctx.lineTo(x + r, y + r);
  const waveCount = 4;
  const waveW = (r * 2) / waveCount;
  for (let i = 0; i < waveCount; i++) {
    const wx = x + r - waveW * (i + 0.5);
    const wy = i % 2 === 0 ? y + r : y + r - 4;
    ctx.lineTo(wx, wy);
  }
  ctx.lineTo(x - r, y + r);
  ctx.closePath();
  ctx.fill();

  if (g.state === "FRIGHTENED") {
    ctx.strokeStyle = "#ffb8a0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x - 5, y + 2, 2, 0, Math.PI * 2);
    ctx.arc(x + 5, y + 2, 2, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    drawEyes(x, y, g.dir);
  }
}

function drawEyes(x, y, dir) {
  const offsets = { RIGHT: [2, 0], LEFT: [-2, 0], UP: [0, -2], DOWN: [0, 2] };
  const [ox, oy] = offsets[dir.name] || [0, 0];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - 4, y - 2, 3, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2121ff";
  ctx.beginPath();
  ctx.arc(x - 4 + ox, y - 2 + oy, 1.4, 0, Math.PI * 2);
  ctx.arc(x + 4 + ox, y - 2 + oy, 1.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawFloatingTexts(dt) {
  ctx.font = "12px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i];
    t.timer -= dt;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
    if (t.timer <= 0) floatingTexts.splice(i, 1);
  }
}

let flashOn = false;
let flashTimer = 0;

function draw(dt) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (gameState === GAME_STATE.LEVEL_COMPLETE) {
    flashTimer += dt;
    if (flashTimer > 0.2) {
      flashTimer = 0;
      flashOn = !flashOn;
    }
    if (flashOn) {
      ctx.fillStyle = "#ffffff";
      for (let r = 0; r < MAZE_ROWS; r++) {
        for (let c = 0; c < MAZE_COLS; c++) {
          if (grid[r][c].wall) ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    } else {
      drawMaze();
    }
    drawPacman();
    return;
  }

  drawMaze();
  drawFloatingTexts(dt);

  for (const g of ghosts) drawGhost(g);
  drawPacman();

  if (gameState === GAME_STATE.READY) {
    ctx.fillStyle = "#ffff00";
    ctx.font = "16px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillText("READY!", CANVAS_WIDTH / 2, PACMAN_START.row * TILE - 14);
  }
}


function setDirection(name) {
  const d = DIRS[name];
  if (!d) return;
  pacman.queuedDir = d;
  if (gameState === GAME_STATE.START) {
    startNewGame();
  } else if (gameState === GAME_STATE.GAME_OVER) {
    startNewGame();
  }
}

window.addEventListener("keydown", (e) => {
  if (document.activeElement === nameInputEl) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScoreSubmit();
    }
    return;
  }

  const key = e.key.toLowerCase();
  if (["arrowup", "w"].includes(key)) setDirection("UP");
  else if (["arrowdown", "s"].includes(key)) setDirection("DOWN");
  else if (["arrowleft", "a"].includes(key)) setDirection("LEFT");
  else if (["arrowright", "d"].includes(key)) setDirection("RIGHT");
  else if (key === "enter") {
    if (gameState === GAME_STATE.START || gameState === GAME_STATE.GAME_OVER) startNewGame();
  } else if (key === "m") {
    const muted = SFX.toggleMute();
    overlayMessageEl.dataset.muted = muted;
  }
});

for (const btn of document.querySelectorAll(".tc-btn")) {
  btn.addEventListener("click", () => setDirection(btn.dataset.dir.toUpperCase()));
}

document.getElementById("canvas-wrapper").addEventListener("click", (e) => {
  if (e.target.closest("#name-entry, #leaderboard-panel, #ranking-btn")) return;
  if (gameState === GAME_STATE.START || gameState === GAME_STATE.GAME_OVER) startNewGame();
});

// ---------- Overlay ----------
function showOverlay(title, message) {
  overlayTitleEl.textContent = title;
  overlayMessageEl.textContent = message;
  overlayEl.classList.remove("hidden");
}
function hideOverlay() {
  overlayEl.classList.add("hidden");
}

// ---------- Ranking (Supabase) ----------
function showNameEntry() {
  overlayControlsEl.classList.add("hidden");
  rankingBtnEl.classList.add("hidden");
  leaderboardPanelEl.classList.add("hidden");
  nameEntryEl.classList.remove("hidden");
  nameInputEl.value = localStorage.getItem("pacman_player_name") || "";
  submitScoreBtnEl.disabled = false;
  submitScoreBtnEl.textContent = "GUARDAR";
  setTimeout(() => nameInputEl.focus(), 50);
}

async function handleScoreSubmit() {
  const raw = nameInputEl.value.trim().toUpperCase();
  const name = (raw || "JUGADOR").slice(0, 10);
  const finalScore = score;
  localStorage.setItem("pacman_player_name", name);
  submitScoreBtnEl.disabled = true;
  submitScoreBtnEl.textContent = "GUARDANDO...";
  await Leaderboard.submitScore(name, finalScore);
  await showLeaderboardPanel({ name, score: finalScore });
}

async function showLeaderboardPanel(highlight) {
  overlayControlsEl.classList.add("hidden");
  rankingBtnEl.classList.add("hidden");
  nameEntryEl.classList.add("hidden");
  leaderboardPanelEl.classList.remove("hidden");
  leaderboardNoteEl.classList.add("hidden");
  leaderboardListEl.innerHTML = "";
  const loading = document.createElement("li");
  loading.className = "lb-loading";
  loading.textContent = "Cargando...";
  leaderboardListEl.appendChild(loading);

  const rows = await Leaderboard.getTopScores(10);
  leaderboardListEl.innerHTML = "";

  if (!rows || rows.length === 0) {
    const li = document.createElement("li");
    li.className = "lb-empty";
    li.textContent = rows === null ? "No se pudo cargar el ranking" : "Sin puntajes todavía";
    leaderboardListEl.appendChild(li);
    return;
  }

  let found = false;
  rows.forEach((row, i) => {
    const li = document.createElement("li");
    li.className = "lb-row";
    if (highlight && !found && row.name === highlight.name && row.score === highlight.score) {
      li.classList.add("lb-me");
      found = true;
    }
    const rank = document.createElement("span");
    rank.className = "lb-rank";
    rank.textContent = String(i + 1);
    const name = document.createElement("span");
    name.className = "lb-name";
    name.textContent = row.name;
    const sc = document.createElement("span");
    sc.className = "lb-score";
    sc.textContent = row.score;
    li.append(rank, name, sc);
    leaderboardListEl.appendChild(li);
  });

  if (highlight && !found) {
    leaderboardNoteEl.textContent = `Tu puntaje (${highlight.score}) no alcanzó el Top 10, ¡sigue intentando!`;
    leaderboardNoteEl.classList.remove("hidden");
  }
}

function hideLeaderboardPanel() {
  leaderboardPanelEl.classList.add("hidden");
  if (gameState !== GAME_STATE.GAME_OVER) {
    overlayControlsEl.classList.remove("hidden");
    rankingBtnEl.classList.remove("hidden");
  }
}

submitScoreBtnEl.addEventListener("click", handleScoreSubmit);
closeLeaderboardBtnEl.addEventListener("click", hideLeaderboardPanel);
rankingBtnEl.addEventListener("click", () => showLeaderboardPanel());

// ---------- Loop principal ----------
let lastTime = performance.now();

function loop(now) {
  let dt = (now - lastTime) / 1000;
  dt = Math.min(dt, 0.05);
  lastTime = now;

  update(dt);
  draw(dt);

  requestAnimationFrame(loop);
}

function update(dt) {
  switch (gameState) {
    case GAME_STATE.START:
      hideOverlayIfNeeded(false);
      break;
    case GAME_STATE.READY:
      overlayEl.classList.add("hidden");
      stateTimer -= dt;
      if (stateTimer <= 0) gameState = GAME_STATE.PLAYING;
      break;
    case GAME_STATE.PLAYING:
      updatePlaying(dt);
      break;
    case GAME_STATE.DYING:
      pacman.deathTimer -= dt;
      stateTimer -= dt;
      if (stateTimer <= 0) {
        lives--;
        updateHUD();
        if (lives <= 0) {
          gameState = GAME_STATE.GAME_OVER;
          if (score > highScore) {
            highScore = score;
            localStorage.setItem("pacman_high_score", String(highScore));
          }
          showOverlay("GAME OVER", `Puntaje final: ${score}`);
          restartHintEl.classList.remove("hidden");
          showNameEntry();
        } else {
          resetPositions();
          gameState = GAME_STATE.READY;
          stateTimer = 2;
        }
      }
      break;
    case GAME_STATE.LEVEL_COMPLETE:
      stateTimer -= dt;
      if (stateTimer <= 0) startLevel(level + 1);
      break;
    case GAME_STATE.GAME_OVER:
      break;
  }
}

function hideOverlayIfNeeded() {}

function updatePlaying(dt) {
  if (freezeTimer > 0) {
    freezeTimer -= dt;
    drawFloatingOnly(dt);
    return;
  }

  pacman.update(dt);
  updateGlobalMode(dt);
  for (const g of ghosts) g.update(dt, pacman, blinky);
  checkGhostCollisions();

  if (pelletsRemaining <= 0) {
    gameState = GAME_STATE.LEVEL_COMPLETE;
    stateTimer = 2;
    SFX.levelComplete();
  }
}

function drawFloatingOnly(dt) {
  
}


updateHUD();
showOverlay("PAC-MAN", "Presiona ENTER o toca la pantalla para jugar");
requestAnimationFrame(loop);
