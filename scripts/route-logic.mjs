/**
 * Pure logic of routes between pins: distance in the scene's units, travel time by pace, the dashed line and the stops
 * a player may see. No Foundry globals.
 */

/** The paces of a journey. */
export const PACES = ["slow", "normal", "fast"];

/** The most stops in a route. */
export const MAX_STOPS = 40;

/** The pace speeds a world starts with, in the scene's units per hour. */
export const DEFAULT_SPEEDS = {slow: 2, normal: 3, fast: 4};

/**
 * A pace from a stored value.
 * @param {*} value
 * @returns {"slow"|"normal"|"fast"}
 */
export function cleanPace(value) {
  return PACES.includes(value) ? value : "normal";
}

/**
 * A positive number, or the fallback.
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
export function positive(value, fallback) {
  const n = Number(value);
  return (Number.isFinite(n) && (n > 0)) ? n : fallback;
}

/**
 * The stops of a route cleaned: ids only, no empty ones, at most MAX_STOPS. A stop may repeat (a return trip).
 * @param {*} list
 * @param {Set<string>|null} [valid]   The ids that exist, others are dropped
 * @returns {string[]}
 */
export function cleanStops(list, valid = null) {
  if ( !Array.isArray(list) ) return [];
  return list.filter(id => (typeof id === "string") && id && (!valid || valid.has(id))).slice(0, MAX_STOPS);
}

/**
 * The stops a user may see: the route ends before the first pin the user must not see, so a shared route never
 * shows where an undiscovered pin lies.
 * @param {string[]} stops
 * @param {(id: string) => boolean} canSee
 * @returns {string[]}
 */
export function visiblePrefix(stops, canSee) {
  const result = [];
  for ( const id of stops ) {
    if ( !canSee(id) ) break;
    result.push(id);
  }
  return result;
}

/**
 * Length, legs and time of a route.
 * @param {{x: number, y: number}[]} points
 * @param {object} scale
 * @param {number} scale.size        Pixels of one grid cell
 * @param {number} scale.distance    Scene units of one grid cell
 * @param {number} [scale.speed]     Scene units per hour of the chosen pace
 * @param {number} [scale.hoursPerDay=8]
 * @returns {{legs: number[], total: number, hours: number}}
 */
export function routeStats(points, {size, distance, speed = 0}) {
  const perPixel = positive(distance, 1) / positive(size, 100);
  const legs = [];
  for ( let i = 1; i < points.length; i++ ) {
    legs.push(Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) * perPixel);
  }
  const total = legs.reduce((a, b) => a + b, 0);
  return {legs, total, hours: (speed > 0) ? total / speed : 0};
}

/**
 * A number for display: no decimals from 100 up, one decimal below, none for whole numbers.
 * @param {number} value
 * @returns {string}
 */
export function roundDistance(value) {
  const n = Number(value) || 0;
  if ( n >= 100 ) return String(Math.round(n));
  const one = Math.round(n * 10) / 10;
  return Number.isInteger(one) ? String(one) : one.toFixed(1);
}

/**
 * Hours as days, hours and minutes. A day has the given number of hours of travel.
 * @param {number} hours
 * @param {number} [hoursPerDay=8]
 * @returns {{days: number, hours: number, minutes: number}}
 */
export function splitTime(hours, hoursPerDay = 8) {
  const day = positive(hoursPerDay, 8);
  let minutes = Math.round(Math.max(Number(hours) || 0, 0) * 60);
  const perDay = Math.round(day * 60);
  const days = Math.floor(minutes / perDay);
  minutes -= days * perDay;
  return {days, hours: Math.floor(minutes / 60), minutes: minutes % 60};
}

/**
 * The pieces of a dashed line along points, as [x1, y1, x2, y2].
 * @param {{x: number, y: number}[]} points
 * @param {number} [dash=24]
 * @param {number} [gap=16]
 * @returns {number[][]}
 */
export function dashSegments(points, dash = 24, gap = 16) {
  const result = [];
  let drawing = true;
  let left = dash;
  for ( let i = 1; i < points.length; i++ ) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if ( !length ) continue;
    const dx = (b.x - a.x) / length;
    const dy = (b.y - a.y) / length;
    let at = 0;
    while ( at < length ) {
      const step = Math.min(left, length - at);
      if ( drawing ) result.push([a.x + (dx * at), a.y + (dy * at), a.x + (dx * (at + step)), a.y + (dy * (at + step))]);
      at += step;
      left -= step;
      if ( left <= 1e-9 ) {
        drawing = !drawing;
        left = drawing ? dash : gap;
      }
    }
  }
  return result;
}
