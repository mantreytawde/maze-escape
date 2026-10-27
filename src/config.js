export const CELL = 3;
export const WALL_T = 0.3;
export const WALL_H = 3;

export const MAZE_W = 22;
export const MAZE_H = 22;
export const MAZE_SEED = 1435;

// Route is measured in cells walked from start, through all three keys, to the exit.
// At 3 m per cell this keeps a hint-following run above five minutes in a headset.
export const MIN_ROUTE_CELLS = 240;
export const MAX_ROUTE_CELLS = 320;
export const GATE_FRACTIONS = [0.3, 0.56, 0.8];
export const KEY_MIN_DEPTH = 7;
export const KEY_MAX_DEPTH = 24;

export const EYE_HEIGHT = 1.65;
export const PLAYER_RADIUS = 0.28;
export const WALK_SPEED = 1.8;
export const TELEPORT_SPEED = 6.2;
export const TELEPORT_COOLDOWN = 0.35;
export const SNAP_ANGLE = Math.PI / 6;

export const HINT_COOLDOWN = 25;
export const TRAIL_CELLS = 8;
export const TRAIL_SECONDS = 30;

export const LIGHT_POOL = 6;
