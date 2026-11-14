/**
 * Pure logic of "Where are we?": where the party is, which pins lead to that place on the maps above it, and the
 * trail of places the party visited. No Foundry globals, so it can be tested alone.
 */

/** The most places the trail keeps. */
export const TRAIL_MAX = 40;

/** The most places the trail draws on one map. */
export const TRAIL_DRAWN = 12;

/** How many maps above a place are followed (a dungeon in a town on a region on a world map). */
export const CHAIN_DEPTH = 6;

/**
 * The trail from a stored value: places with a scene id and the world time of the arrival, at most TRAIL_MAX of them.
 * @param {*} value
 * @returns {{scene: string, time: number}[]}
 */
export function cleanTrail(value) {
  const list = [];
  for ( const item of Array.isArray(value) ? value : [] ) {
    const scene = String(item?.scene ?? "");
    const time = Number(item?.time);
    if ( !scene || !Number.isFinite(time) ) continue;
    list.push({scene, time});
  }
  return list.slice(-TRAIL_MAX);
}

/**
 * The trail after the party arrived somewhere. Staying in the same place adds nothing.
 * @param {{scene: string, time: number}[]} trail
 * @param {string} sceneId
 * @param {number} time   The world time of the arrival
 * @returns {{scene: string, time: number}[]}
 */
export function addToTrail(trail, sceneId, time) {
  const list = cleanTrail(trail);
  if ( !sceneId || (list.at(-1)?.scene === sceneId) ) return list;
  list.push({scene: sceneId, time: Number.isFinite(Number(time)) ? Number(time) : 0});
  return list.slice(-TRAIL_MAX);
}

/**
 * Where the party is. In this order: the place the GM set by hand, the scene all online players look at (the GM pulled
 * them there, or they all went), the active scene, the scene with the most player character tokens.
 * @param {object} data
 * @param {string} [data.manual]               The scene the GM set by hand ("" for automatic)
 * @param {(string|null)[]} [data.viewed]      The scene each online player looks at (null when none)
 * @param {string} [data.active]               The active scene
 * @param {Record<string, number>} [data.tokens]   Player character tokens per scene
 * @param {Set<string>} data.valid             The ids of the scenes that exist
 * @returns {{scene: string, source: "manual"|"players"|"active"|"tokens"}|null}
 */
export function pickPartyScene({manual = "", viewed = [], active = "", tokens = {}, valid}) {
  if ( manual && valid.has(manual) ) return {scene: manual, source: "manual"};
  const seen = viewed.filter(id => id && valid.has(id));
  if ( seen.length && seen.every(id => id === seen[0]) ) return {scene: seen[0], source: "players"};
  if ( active && valid.has(active) ) return {scene: active, source: "active"};
  const best = Object.entries(tokens).filter(([id, n]) => valid.has(id) && (n > 0))
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0];
  return best ? {scene: best[0], source: "tokens"} : null;
}

/**
 * The scene links of all pins: the pins that open another scene.
 * @param {{id: string, scene: string, target?: string, x: number, y: number}[]} pins   `scene` is the scene the pin is
 *   on, `target` the scene it opens
 * @returns {{id: string, scene: string, target: string, x: number, y: number}[]}
 */
export function buildLinks(pins) {
  return pins.filter(p => p.target && p.scene && (p.target !== p.scene))
    .map(p => ({id: p.id, scene: p.scene, target: p.target, x: p.x, y: p.y}));
}

/**
 * The pins that open a scene (the pins on the maps directly above it).
 * @param {object[]} links   From buildLinks
 * @param {string} sceneId
 * @returns {object[]}
 */
export function linksTo(links, sceneId) {
  return links.filter(l => l.target === sceneId);
}

/**
 * The pins that lead to a place, on the map above it and on the maps above that: a dungeon is opened by a pin on the
 * town map, the town by a pin on the region map. Every scene is followed once, so circles end.
 * @param {object[]} links
 * @param {string} sceneId
 * @param {number} [maxDepth=CHAIN_DEPTH]
 * @returns {{id: string, scene: string, target: string, depth: number, x: number, y: number}[]}   depth 0 is the pin
 *   that opens the place itself
 */
export function pinChain(links, sceneId, maxDepth = CHAIN_DEPTH) {
  const result = [];
  const seen = new Set([sceneId]);
  let level = [sceneId];
  for ( let depth = 0; (depth < maxDepth) && level.length; depth++ ) {
    const next = [];
    for ( const id of level ) {
      for ( const link of linksTo(links, id) ) {
        result.push({id: link.id, scene: link.scene, target: link.target, depth, x: link.x, y: link.y});
        if ( !seen.has(link.scene) ) {
          seen.add(link.scene);
          next.push(link.scene);
        }
      }
    }
    level = next;
  }
  return result;
}

/**
 * Where a place shows on one map: the pin on that map that leads to it, directly or over other maps.
 * @param {object[]} links
 * @param {string} placeId   The scene of the place
 * @param {string} mapId     The map
 * @returns {{id: string, x: number, y: number, depth: number}|null}   The nearest such pin
 */
export function locateOnMap(links, placeId, mapId) {
  const hit = pinChain(links, placeId).filter(c => c.scene === mapId).sort((a, b) => a.depth - b.depth)[0];
  return hit ? {id: hit.id, x: hit.x, y: hit.y, depth: hit.depth} : null;
}

/**
 * The places of the trail that show on a map, in order, for drawing. Following places at the same pin are one stop.
 * @param {{scene: string, time: number}[]} trail
 * @param {(sceneId: string) => ({id: string, x: number, y: number}|null)} locate
 * @param {number} [limit=TRAIL_DRAWN]   Only the last stops are drawn
 * @returns {{id: string, x: number, y: number, times: number[]}[]}
 */
export function trailStops(trail, locate, limit = TRAIL_DRAWN) {
  const stops = [];
  for ( const entry of cleanTrail(trail) ) {
    const at = locate(entry.scene);
    if ( !at ) continue;
    const last = stops.at(-1);
    if ( last?.id === at.id ) last.times.push(entry.time);
    else stops.push({id: at.id, x: at.x, y: at.y, times: [entry.time]});
  }
  return stops.slice(-limit);
}

/**
 * Where a scene's picture lies inside the scene rectangle, like Foundry 14 places the texture of a level: sized by the
 * fit mode and the scale, its anchor point put at the middle of the rectangle plus the offset.
 * @param {object|null} config   {fit, scaleX, scaleY, offsetX, offsetY, anchorX, anchorY, rotation} or null for a
 *   picture that simply fills the rectangle (Foundry 13 has moved the rectangle by the offset already)
 * @param {{width: number, height: number}} rect      The scene rectangle
 * @param {{width: number, height: number}} natural   The picture's own size
 * @returns {{left: number, top: number, width: number, height: number, rotation: number, flipX: boolean, flipY: boolean,
 *   originX: number, originY: number}}   Relative to the scene rectangle's corner
 */
export function backgroundBox(config, rect, natural) {
  if ( !config ) {
    return {left: 0, top: 0, width: rect.width, height: rect.height, rotation: 0, flipX: false, flipY: false, originX: 0.5,
      originY: 0.5};
  }
  const c = config;
  const fit = c.fit ?? "fill";
  const scaleX = Number.isFinite(Number(c.scaleX)) && Number(c.scaleX) !== 0 ? Number(c.scaleX) : 1;
  const scaleY = Number.isFinite(Number(c.scaleY)) && Number(c.scaleY) !== 0 ? Number(c.scaleY) : 1;
  const nw = Math.max(natural?.width || 0, 1);
  const nh = Math.max(natural?.height || 0, 1);
  let sx = rect.width / nw;
  let sy = rect.height / nh;
  if ( fit === "cover" ) sx = sy = Math.max(sx, sy);
  else if ( fit === "contain" ) sx = sy = Math.min(sx, sy);
  else if ( fit === "width" ) sy = sx;
  else if ( fit === "height" ) sx = sy;
  const width = Math.abs(sx * scaleX * nw);
  const height = Math.abs(sy * scaleY * nh);
  const anchorX = Number(c.anchorX) || 0;
  const anchorY = Number(c.anchorY) || 0;
  const left = (rect.width / 2) + (Number(c.offsetX) || 0) - (anchorX * width);
  const top = (rect.height / 2) + (Number(c.offsetY) || 0) - (anchorY * height);
  return {left, top, width, height, rotation: Number(c.rotation) || 0, flipX: scaleX < 0, flipY: scaleY < 0,
    originX: anchorX, originY: anchorY};
}

/**
 * Trail rows with the same date together: one date, the places after it.
 * @param {{date: string, name: string, known: boolean}[]} entries   In display order
 * @returns {{date: string, names: string, unknown: boolean}[]}
 */
export function groupByDate(entries) {
  const rows = [];
  for ( const entry of entries ) {
    const last = rows.at(-1);
    if ( last && (last.date === entry.date) ) {
      last.list.push(entry);
    } else rows.push({date: entry.date, list: [entry]});
  }
  return rows.map(r => ({date: r.date, names: r.list.map(e => e.name).join(", "), unknown: r.list.every(e => !e.known)}));
}

/**
 * A world time as a date. A calendar's own formatter is used when there is one, else the day counted from time zero.
 * The plain timestamp of a world that never set a calendar year (it starts with year 0) reads badly, so it becomes a
 * counted day with the time of day.
 * @param {number} seconds
 * @param {(seconds: number) => string} [format]          The calendar's formatter
 * @param {(day: number, clock: string) => string} [dayLabel]  Builds "Day 3, 08:30" in the user's language
 * @returns {string}
 */
export function formatWorldTime(seconds, format, dayLabel) {
  const time = Number(seconds) || 0;
  const day = Math.floor(Math.max(time, 0) / 86400) + 1;
  if ( typeof format === "function" ) {
    try {
      const text = String(format(time) ?? "").trim();
      const plain = /^0{1,4}-\d{2}-\d{2} (\d{2}:\d{2})(:\d{2})?$/.exec(text);
      if ( plain && (typeof dayLabel === "function") ) return dayLabel(day, plain[1]);
      if ( text ) return text.replace(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}):\d{2}$/, "$1");
    } catch(err) {
      // A calendar that cannot format: count the days
    }
  }
  return `#${day}`;
}
