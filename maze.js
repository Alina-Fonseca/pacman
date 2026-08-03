

const RAW_MAZE = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "     #.##### ## #####.#     ",
  "     #.##          ##.#     ",
  "     #.## ###--### ##.#     ",
  "######.## #      # ##.######",
  "      .   #      #   .      ",
  "######.## #      # ##.######",
  "     #.## ######## ##.#     ",
  "     #.##          ##.#     ",
  "     #.## ######## ##.#     ",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##................##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

const MAZE_COLS = 28;
const MAZE_ROWS = RAW_MAZE.length; // 31
const TUNNEL_ROW = 14;

// Posiciones especiales dentro del laberinto (en coordenadas de tile: col, row)
const GHOST_HOUSE = {
  door: { col: 13.5, row: 12 },
  center: { col: 13.5, row: 14 },
  // Posiciones de "parqueo" dentro de la casa para cada fantasma
  slots: {
    blinky: { col: 13.5, row: 11 }, // Blinky arranca justo afuera de la puerta
    pinky: { col: 13.5, row: 14 },
    inky: { col: 11.5, row: 14 },
    clyde: { col: 15.5, row: 14 },
  },
  exit: { col: 13.5, row: 11 }, // tile justo arriba de la puerta, punto de salida
};

const PACMAN_START = { col: 13.5, row: 23 };


const SCATTER_TARGETS = {
  blinky: { col: MAZE_COLS - 1, row: 0 },
  pinky: { col: 0, row: 0 },
  inky: { col: MAZE_COLS - 1, row: MAZE_ROWS - 1 },
  clyde: { col: 0, row: MAZE_ROWS - 1 },
};

// Construye la grilla lógica a partir del texto crudo.
// Cada celda: { wall, pellet, power, door }
function buildMazeGrid() {
  const grid = [];
  for (let r = 0; r < MAZE_ROWS; r++) {
    const row = [];
    for (let c = 0; c < MAZE_COLS; c++) {
      const ch = RAW_MAZE[r][c];
      row.push({
        wall: ch === "#",
        door: ch === "-",
        pellet: ch === ".",
        power: ch === "o",
        eaten: false,
      });
    }
    grid.push(row);
  }
  return grid;
}

function countTotalPellets(grid) {
  let total = 0;
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      if (grid[r][c].pellet || grid[r][c].power) total++;
    }
  }
  return total;
}
