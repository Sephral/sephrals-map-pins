/**
 * Pure logic of areas: labeled shapes on a map (realms, territories, danger zones) that are Foundry drawings with
 * flags of this module. Geometry of the drawing's shape, the label size, the style from a category and discovery by
 * exploring. No Foundry globals.
 */

import {blockedList, isDiscovered, isHiddenPin} from "./discover-logic.mjs";

/** The flag keys of an area (flags.sephrals-map-pins on the drawing). `area` marks the drawing as an area. */
export const AREA_KEYS = ["area", "category", "entry", "page", "previewText", "hidden", "found", "blocked"];

/** The most characters of an area's own preview text. */
export const AREA_LIMITS = {previewText: 600};

/** The points of a round shape. */
const ELLIPSE_STEPS = 32;

/**
 * Is a drawing an area?
 * @param {object} flags   The module's flags of the drawing
 * @returns {boolean}
 */
export function isArea(flags) {
  return flags?.area === true;
}

/**
 * The corners of a drawing's shape in scene coordinates. Rectangles, ellipses and polygons (also freehand lines), with
 * the drawing's rotation about the middle of its box.
 * @param {object} drawing   {x, y, rotation, shape: {type, width, height, points}}
 * @returns {{x: number, y: number}[]}
 */
export function areaPolygon(drawing) {
  const shape = drawing?.shape ?? {};
  const x = Number(drawing?.x) || 0;
  const y = Number(drawing?.y) || 0;
  const w = Math.max(Number(shape.width) || 0, 0);
  const h = Math.max(Number(shape.height) || 0, 0);
  let local = [];
  if ( shape.type === "e" ) {
    for ( let i = 0; i < ELLIPSE_STEPS; i++ ) {
      const a = (i / ELLIPSE_STEPS) * Math.PI * 2;
      local.push({x: (w / 2) + (Math.cos(a) * w / 2), y: (h / 2) + (Math.sin(a) * h / 2)});
    }
  } else if ( shape.type === "p" ) {
    const flat = Array.isArray(shape.points) ? shape.points : [];
    for ( let i = 0; i + 1 < flat.length; i += 2 ) local.push({x: Number(flat[i]) || 0, y: Number(flat[i + 1]) || 0});
  } else local = [{x: 0, y: 0}, {x: w, y: 0}, {x: w, y: h}, {x: 0, y: h}];
  const angle = ((Number(drawing?.rotation) || 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return local.map(p => {
    const dx = p.x - (w / 2);
    const dy = p.y - (h / 2);
    return {x: x + (w / 2) + (dx * cos) - (dy * sin), y: y + (h / 2) + (dx * sin) + (dy * cos)};
  });
}

/**
 * The box around some points.
 * @param {{x: number, y: number}[]} points
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function boundsOf(points) {
  if ( !points.length ) return {x: 0, y: 0, width: 0, height: 0};
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y};
}

/**
 * Is a point inside a polygon?
 * @param {{x: number, y: number}} point
 * @param {{x: number, y: number}[]} polygon
 * @returns {boolean}
 */
export function pointInPolygon(point, polygon) {
  let inside = false;
  for ( let i = 0, j = polygon.length - 1; i < polygon.length; j = i++ ) {
    const a = polygon[i];
    const b = polygon[j];
    if ( ((a.y > point.y) !== (b.y > point.y)) && (point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The size of a polygon, used to pick the smallest of several areas under the pointer.
 * @param {{x: number, y: number}[]} polygon
 * @returns {number}
 */
export function polygonArea(polygon) {
  let sum = 0;
  for ( let i = 0, j = polygon.length - 1; i < polygon.length; j = i++ ) {
    sum += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
  }
  return Math.abs(sum / 2);
}

/**
 * The smallest area that holds a point. A town inside a realm wins over the realm.
 * @param {{id: string, polygon: {x: number, y: number}[]}[]} areas
 * @param {{x: number, y: number}} point
 * @returns {string|null}   The id
 */
export function areaAt(areas, point) {
  let best = null;
  let size = Infinity;
  for ( const area of areas ) {
    if ( !pointInPolygon(point, area.polygon) ) continue;
    const s = polygonArea(area.polygon);
    if ( s < size ) {
      best = area.id;
      size = s;
    }
  }
  return best;
}

/**
 * Points inside a shape to look at for exploring: a grid over its box and its middle.
 * @param {{x: number, y: number}[]} polygon
 * @param {number} [steps=6]
 * @returns {{x: number, y: number}[]}
 */
export function samplePoints(polygon, steps = 6) {
  const box = boundsOf(polygon);
  const points = [];
  const middle = {x: box.x + (box.width / 2), y: box.y + (box.height / 2)};
  if ( pointInPolygon(middle, polygon) ) points.push(middle);
  for ( let i = 0; i < steps; i++ ) {
    for ( let j = 0; j < steps; j++ ) {
      const p = {x: box.x + (box.width * (i + 0.5)) / steps, y: box.y + (box.height * (j + 0.5)) / steps};
      if ( pointInPolygon(p, polygon) ) points.push(p);
    }
  }
  // A thin shape may hold none of them: its corners and the middle of its box stand in
  if ( !points.length ) points.push(...polygon.slice(0, 8), middle);
  return points;
}

/**
 * Which areas does a player newly cover by exploring? Areas that are hidden, not yet found by the user, not hidden
 * from the user again and where one of the sample points is explored.
 * @param {{id: string, flags: object, samples: {x: number, y: number}[]}[]} areas
 * @param {string} userId
 * @param {(point: {x: number, y: number}) => boolean} explored
 * @param {Set<string>} [pending]   Areas already reported
 * @returns {string[]}
 */
export function newlyExploredAreas(areas, userId, explored, pending = new Set()) {
  const result = [];
  for ( const area of areas ) {
    if ( !isHiddenPin(area.flags) || isDiscovered(area.flags, userId) || pending.has(area.id) ) continue;
    if ( blockedList(area.flags).includes(userId) ) continue;
    if ( area.samples.some(point => explored(point)) ) result.push(area.id);
  }
  return result;
}

/**
 * A readable size for the label of an area: as large as the shape allows, between 24 and 160.
 * @param {number} width
 * @param {number} height
 * @param {string} text
 * @returns {number}
 */
export function labelFontSize(width, height, text) {
  const length = Math.max(String(text ?? "").length, 6);
  const byWidth = (Math.max(width, 0) * 0.85) / (length * 0.55);
  const byHeight = Math.max(height, 0) * 0.25;
  const size = Math.round(Math.min(byWidth, byHeight));
  return Math.min(Math.max(size, 24), 160);
}

/** The look of an area without a category. */
const NEUTRAL = "#8a7a5a";

/**
 * What the drawing of an area looks like for a category color: a soft fill, a strong line, a light label.
 * @param {string|null} color   "#rrggbb" or empty for no category
 * @returns {{fillType: number, fillColor: string, fillAlpha: number, strokeColor: string, strokeAlpha: number,
 *   strokeWidth: number, textColor: string, textAlpha: number}}
 */
export function areaStyle(color) {
  const c = /^#[0-9a-f]{6}$/i.test(String(color ?? "")) ? String(color).toLowerCase() : NEUTRAL;
  return {fillType: 1, fillColor: c, fillAlpha: 0.16, strokeColor: c, strokeAlpha: 0.9, strokeWidth: 6,
    textColor: "#ffffff", textAlpha: 1};
}

/**
 * The module's flags for a new area, from what the dialog collected. Empty values are left out.
 * @param {object} data   {category, entry, page, previewText, hidden}
 * @returns {object}
 */
export function areaFlags(data = {}) {
  const flags = {area: true};
  const category = String(data.category ?? "").trim();
  if ( category ) flags.category = category;
  const entry = String(data.entry ?? "").trim();
  if ( entry ) flags.entry = entry;
  const page = String(data.page ?? "").trim();
  if ( entry && page ) flags.page = page;
  const text = String(data.previewText ?? "").trim().slice(0, AREA_LIMITS.previewText);
  if ( text ) flags.previewText = text;
  if ( data.hidden === true ) flags.hidden = true;
  return flags;
}

/**
 * The name of an area for lists: the label of the drawing, else a fallback.
 * @param {string} text
 * @param {string} fallback
 * @returns {string}
 */
export function areaName(text, fallback) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || fallback;
}
