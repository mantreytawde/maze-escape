export const CELL = 3.3;
export const WALL_T = 0.3;
export const WALL_H = 3;

export const MAZE_W = 12;
export const MAZE_H = 12;
export const MAZE_SEED = 1448;

// Route is measured in cells walked from start, through all three keys, to the exit.
// At 3.3 m per cell and walking pace, 82-100 cells is a two and a half to three minute perfect run.
export const MIN_ROUTE_CELLS = 82;
export const MAX_ROUTE_CELLS = 100;
export const GATE_FRACTIONS = [0.3, 0.56, 0.8];
export const KEY_MIN_DEPTH = 3;
export const KEY_MAX_DEPTH = 8;

export const EYE_HEIGHT = 1.65;
export const DESKTOP_FOV = 80;
export const PLAYER_RADIUS = 0.28;
export const WALK_SPEED = 1.8;
export const TELEPORT_SPEED = 6.2;
export const TELEPORT_COOLDOWN = 0.35;
export const SNAP_ANGLE = Math.PI / 6;

export const LIVES = 3;
export const KEY_PICKUP = 1.1;
export const GATE_REACH = 1.6;

// Questions: the first comes shortly after the start, then one every interval.
export const QUIZ_FIRST = 6;
export const QUIZ_INTERVAL = 35;
export const QUIZ_TIMEOUT = 20;
export const ARROW_SECONDS = 22;

export const DANGER_MAX_CELLS = 11;
export const DANGER_SLACK = 1.45;
export const FLICKER_CELLS = 4;

export const ZOMBIE_SPEED = 2.5;
export const ZOMBIE_REACH = 0.75;

export const LIGHT_POOL = 6;
