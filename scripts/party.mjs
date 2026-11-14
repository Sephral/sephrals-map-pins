/**
 * Where are we? The module knows where the party is and shows it on the maps above: a pin that opens the scene the
 * party is in gets a marker ("The party is here" for the GM, "You are here" for players), and so do the pins that lead
 * to that pin over other maps. A light trail of the places visited, with the world time of each arrival, is drawn on
 * the map. From inside a scene, a small window shows the map above it, centered on the pin that opens the scene.
 *
 * Where the party is, in this order (see pickPartyScene):
 * 1. the place the GM set by hand,
 * 2. the scene that all online players look at (the GM pulled them there, or they all went),
 * 3. the active scene,
 * 4. the scene with the most player character tokens.
 *
 * Only the active GM works it out and writes it to a world setting, so every client reads the same answer. Without a
 * GM online the last answer stays.
 */

import {MODULE_ID, flagsOf, setting, t} from "./config.mjs";
import {addToTrail, buildLinks, cleanTrail, formatWorldTime, groupByDate, locateOnMap, pickPartyScene, pinChain, trailStops}
  from "./party-logic.mjs";
import {dashSegments} from "./route-logic.mjs";
import {focusPin} from "./list-app.mjs";
import {mayViewScene} from "./open-pin.mjs";
import {pinVisible, categoryOff} from "./visibility.mjs";
import {openWhere} from "./where-app.mjs";
import {isHiddenPin, isDiscovered} from "./discover-logic.mjs";
import {revealPin} from "./discover.mjs";
import {countFeature} from "./usage.mjs";

/** How often the active GM looks where the party is, in milliseconds. */
const POLL = 4000;

/** The pins of the viewed scene that lead to the party: note id to depth. */
let here = new Map();

/** The markers on the pins, and those that pulse. */
const markers = new WeakMap();
const pulsing = new Set();
let ticking = false;

/** What the trail drew on the canvas. */
let trailLayer = null;

/** The place the GM's next check found, waiting to be seen twice in a row. */
let candidate = {key: "", count: 0};

let pollTimer = 0;

/* -------------------------------------------- */
/*  Data                                        */
/* -------------------------------------------- */

/**
 * Where the party is now.
 * @returns {{manual: string, scene: string, source: string, since: number}}
 */
export function partyState() {
  const data = setting("party") ?? {};
  return {manual: String(data.manual ?? ""), scene: String(data.scene ?? ""), source: String(data.source ?? ""),
    since: Number(data.since) || 0};
}

/**
 * The scene the party is in, or null.
 * @returns {Scene|null}
 */
export function partyScene() {
  return game.scenes.get(partyState().scene) ?? null;
}

/**
 * The pins of all scenes that open another scene.
 * @returns {{id: string, scene: string, target: string, x: number, y: number}[]}
 */
export function sceneLinks() {
  const pins = [];
  for ( const scene of game.scenes ) {
    for ( const doc of scene.notes ) {
      const target = flagsOf(doc).scene;
      if ( target && game.scenes.has(target) ) pins.push({id: doc.id, scene: scene.id, target, x: doc.x, y: doc.y});
    }
  }
  return buildLinks(pins);
}

/**
 * May this user see the name of a scene?
 * @param {Scene} scene
 * @returns {boolean}
 */
export function mayNameScene(scene) {
  return !!scene && mayViewScene(scene);
}

/**
 * The pins on a map that this user may see and that lead to the party's place.
 * @param {string} mapId
 * @returns {Map<string, number>}   Note id to depth (0 opens the party's scene itself)
 */
export function partyPinsOn(mapId) {
  const state = partyState();
  const result = new Map();
  if ( !state.scene || !mapId || !setting("whereOn") ) return result;
  const map = game.scenes.get(mapId);
  for ( const link of pinChain(sceneLinks(), state.scene) ) {
    if ( link.scene !== mapId ) continue;
    const doc = map?.notes.get(link.id);
    if ( !doc || !pinVisible(doc) || categoryOff(flagsOf(doc)) ) continue;
    if ( !result.has(link.id) || (result.get(link.id) > link.depth) ) result.set(link.id, link.depth);
  }
  return result;
}

/**
 * The pins on the maps above a scene that open it and that this user may use for a look: the user may see the pin and
 * the map.
 * @param {string} sceneId
 * @returns {{scene: Scene, doc: NoteDocument}[]}
 */
export function parentPins(sceneId) {
  const result = [];
  for ( const link of sceneLinks().filter(l => l.target === sceneId) ) {
    const scene = game.scenes.get(link.scene);
    const doc = scene?.notes.get(link.id);
    if ( !scene || !doc || !mayViewScene(scene) || !pinVisible(doc) ) continue;
    result.push({scene, doc});
  }
  return result.sort((a, b) => a.scene.name.localeCompare(b.scene.name, game.i18n.lang));
}

/**
 * A world time as a date, with the calendar of the world when it has one.
 * @param {number} seconds
 * @returns {string}
 */
export function timeLabel(seconds) {
  const calendar = game.time?.calendar;
  return formatWorldTime(seconds, (typeof calendar?.format === "function") ? time => calendar.format(time, "timestamp") : null,
    (day, clock) => game.i18n.format("SMP.Where.dayAt", {day, clock}));
}

/**
 * The places the party visited, newest first, with a date and a name this user may read.
 * @returns {{scene: string, name: string, date: string, known: boolean}[]}
 */
export function trailList() {
  return cleanTrail(setting("trail")).map(entry => {
    const scene = game.scenes.get(entry.scene);
    const known = mayNameScene(scene);
    return {scene: entry.scene, name: known ? scene.name : t("SMP.Where.unknownPlace"), date: timeLabel(entry.time), known};
  }).reverse();
}

/**
 * The trail with places of the same date together, newest first.
 * @returns {{date: string, names: string, unknown: boolean}[]}
 */
export function trailGroups() {
  return groupByDate(trailList());
}

/* -------------------------------------------- */
/*  The GM works out where the party is         */
/* -------------------------------------------- */

/**
 * The number of player character tokens in each scene.
 * @returns {Record<string, number>}
 */
function partyTokens() {
  const result = {};
  for ( const scene of game.scenes ) {
    const n = scene.tokens.filter(token => !token.hidden && token.actor?.hasPlayerOwner).length;
    if ( n ) result[scene.id] = n;
  }
  return result;
}

/**
 * Look where the party is and write it down when it changed (the active GM only). A change must show twice in a row, so
 * a player who is only passing through a scene does not move the party.
 * @param {object} [options]
 * @param {boolean} [options.force=false]   Write at once
 * @returns {Promise<boolean>} Whether something was written
 */
export async function updateParty({force = false} = {}) {
  if ( !game.user.isGM || !game.users.activeGM?.isSelf || !setting("whereOn") ) return false;
  const state = partyState();
  const valid = new Set(game.scenes.map(s => s.id));
  const picked = pickPartyScene({manual: state.manual, active: game.scenes.active?.id ?? "", tokens: partyTokens(), valid,
    viewed: game.users.filter(u => u.active && !u.isGM).map(u => u.viewedScene)});
  const scene = picked?.scene ?? "";
  const source = picked?.source ?? "";
  const key = `${scene}|${source}`;
  if ( (scene === state.scene) && (source === state.source) ) {
    candidate = {key: "", count: 0};
    return false;
  }
  candidate = (candidate.key === key) ? {key, count: candidate.count + 1} : {key, count: 1};
  if ( !force && (candidate.count < 2) ) return false;
  candidate = {key: "", count: 0};
  const time = game.time.worldTime;
  await game.settings.set(MODULE_ID, "party", {manual: state.manual, scene, source, since: time});
  if ( scene && (scene !== state.scene) ) await revealOnArrival(scene).catch(err => console.warn(`${MODULE_ID} | Arrival reveal failed`, err));
  if ( scene && (scene !== state.scene) && setting("partyTrail") ) {
    await game.settings.set(MODULE_ID, "trail", addToTrail(setting("trail"), scene, time));
  }
  return true;
}

/**
 * The players whose characters are part of the party in a scene: owners of an actor with a token there. When that
 * cannot be told (no such token), all players.
 * @param {Scene} scene
 * @returns {string[]}   User ids
 */
export function partyMembers(scene) {
  const players = game.users.filter(u => !u.isGM);
  const members = players.filter(user => scene.tokens.some(token => !token.hidden && token.actor?.testUserPermission(user, "OWNER")));
  return (members.length ? members : players).map(u => u.id);
}

/**
 * The party arrived in a scene: the pins that open it become discovered for the party's players, so the marker shows.
 * Active GM only. Areas are not touched, they stay discovery by exploring.
 * @param {string} sceneId
 * @returns {Promise<number>} How many pins were revealed
 */
export async function revealOnArrival(sceneId) {
  const target = game.scenes.get(sceneId);
  if ( !target ) return 0;
  const members = partyMembers(target);
  let count = 0;
  for ( const link of sceneLinks().filter(l => l.target === sceneId) ) {
    const doc = game.scenes.get(link.scene)?.notes.get(link.id);
    if ( !doc || !isHiddenPin(flagsOf(doc)) ) continue;
    const users = members.filter(id => !isDiscovered(flagsOf(doc), id) && !(flagsOf(doc).blocked ?? []).includes(id));
    if ( !users.length ) continue;
    await revealPin(doc, {users});
    count++;
  }
  return count;
}

/**
 * Set the place of the party by hand, or follow it automatically again (GM).
 * @param {Scene|string|null} target   A scene, its id, or null for automatic
 * @returns {Promise<void>}
 */
export async function setParty(target) {
  if ( !game.user.isGM ) return;
  const id = target ? String(target.id ?? target) : "";
  if ( id && !game.scenes.has(id) ) return;
  const state = partyState();
  await game.settings.set(MODULE_ID, "party", {...state, manual: id});
  if ( id ) countFeature(MODULE_ID, "partyPlaced");
  await updateParty({force: true});
}

/**
 * Clear the trail (GM).
 * @returns {Promise<void>}
 */
export async function clearTrail() {
  if ( game.user.isGM ) await game.settings.set(MODULE_ID, "trail", []);
}

/** Start the GM's regular look. Call on "ready". */
export function startParty() {
  clearInterval(pollTimer);
  if ( !game.user.isGM ) return;
  pollTimer = setInterval(() => updateParty().catch(err => console.warn(`${MODULE_ID} | Party check failed`, err)), POLL);
  updateParty({force: false}).catch(() => {});
}

/* -------------------------------------------- */
/*  Marker on the pins                          */
/* -------------------------------------------- */

/**
 * Work out which pins of the viewed scene lead to the party and mark them. Call when the canvas is ready and when the
 * party, the trail or a scene link changed.
 */
export function refreshParty() {
  here = canvas?.ready ? partyPinsOn(canvas.scene?.id) : new Map();
  for ( const note of canvas?.notes?.placeables ?? [] ) markNote(note);
  drawTrail();
}

/**
 * Put the marker on a pin or take it away. Called after a pin was drawn or refreshed.
 * @param {Note} note
 */
export function markNote(note) {
  if ( !note?.document || note.destroyed || !note.controlIcon ) return;
  const old = markers.get(note);
  if ( !here.has(note.id) ) {
    if ( old ) {
      pulsing.delete(old);
      if ( !old.box.destroyed ) old.box.destroy({children: true});
      markers.delete(note);
    }
    return;
  }
  const size = note.document.iconSize;
  const text = t(game.user.isGM ? "SMP.Where.partyHere" : "SMP.Where.youHere");
  const key = `${size}|${text}`;
  if ( old && (old.key === key) && !old.box.destroyed && (old.box.parent === note) ) return;
  if ( old ) {
    pulsing.delete(old);
    if ( !old.box.destroyed ) old.box.destroy({children: true});
  }
  const state = {key, box: build(size, text), ring: null};
  state.ring = state.box.children[0];
  note.addChild(state.box);
  markers.set(note, state);
  pulsing.add(state);
  startTicker();
}

/**
 * The marker: a ring around the pin and a banner above it.
 * @param {number} size   The size of the pin
 * @param {string} text
 * @returns {PIXI.Container}
 */
function build(size, text) {
  const box = new PIXI.Container();
  box.eventMode = "none";
  const ring = new PIXI.Graphics();
  ring.lineStyle({width: 6, color: 0xffcf40, alpha: 1});
  ring.drawCircle(0, 0, size * 0.78);
  ring.lineStyle({width: 2, color: 0x2b1d0e, alpha: 0.9});
  ring.drawCircle(0, 0, (size * 0.78) + 4);
  box.addChild(ring);
  const fontSize = Math.round(Math.min(Math.max(size * 0.38, 16), 34));
  const style = CONFIG.canvasTextStyle.clone();
  style.fontSize = fontSize;
  style.fontWeight = "bold";
  style.fill = 0x2b1d0e;
  style.stroke = 0x2b1d0e;
  style.strokeThickness = 0;
  style.dropShadow = false;
  const label = new foundry.canvas.containers.PreciseText(text, style);
  label.anchor.set(0.5, 0.5);
  const width = label.width + (fontSize * 1.1);
  const height = fontSize * 1.6;
  const back = new PIXI.Graphics();
  back.beginFill(0xffd34d, 1);
  back.lineStyle({width: 2, color: 0x2b1d0e, alpha: 0.9});
  back.drawRoundedRect(-width / 2, -height / 2, width, height, height / 2);
  back.endFill();
  const banner = new PIXI.Container();
  banner.addChild(back, label);
  banner.position.set(0, (-size * 0.78) - (height / 2) - 8);
  box.addChild(banner);
  return box;
}

/** Make the rings breathe, unless the user asked for less motion. */
function startTicker() {
  if ( ticking || !canvas?.app?.ticker ) return;
  if ( globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ) return;
  ticking = true;
  canvas.app.ticker.add(pulse);
}

/** One step of the pulse. */
function pulse() {
  if ( !pulsing.size || !canvas?.ready ) {
    stopTicker();
    return;
  }
  const phase = (Math.sin(performance.now() / 380) + 1) / 2;
  for ( const state of pulsing ) {
    if ( state.box.destroyed || !state.ring || state.ring.destroyed ) continue;
    state.ring.scale.set(1 + (phase * 0.18));
    state.ring.alpha = 0.55 + ((1 - phase) * 0.45);
  }
}

/** Stop the pulse. */
function stopTicker() {
  if ( !ticking ) return;
  ticking = false;
  try {
    canvas.app?.ticker?.remove(pulse);
  } catch(err) {
    // The canvas is going away
  }
}

/** Forget everything on a canvas that goes away. Call on "canvasTearDown". */
export function clearParty() {
  here = new Map();
  pulsing.clear();
  stopTicker();
  if ( trailLayer && !trailLayer.destroyed ) trailLayer.destroy({children: true});
  trailLayer = null;
}

/* -------------------------------------------- */
/*  Trail                                       */
/* -------------------------------------------- */

/**
 * Draw the trail on the viewed map: a dotted line from place to place and the date at each stop. Places whose pin this
 * user may not see are left out.
 */
export function drawTrail() {
  if ( trailLayer && !trailLayer.destroyed ) trailLayer.destroy({children: true});
  trailLayer = null;
  if ( !canvas?.ready || !canvas.interface || !setting("whereOn") || !setting("partyTrail") ) return;
  const mapId = canvas.scene.id;
  const links = sceneLinks();
  const trail = cleanTrail(setting("trail"));
  if ( trail.length < 1 ) return;
  const stops = trailStops(trail, sceneId => {
    const at = locateOnMap(links, sceneId, mapId);
    const doc = at ? canvas.scene.notes.get(at.id) : null;
    return (doc && pinVisible(doc) && !categoryOff(flagsOf(doc))) ? {id: at.id, x: doc.x, y: doc.y} : null;
  });
  if ( !stops.length ) return;
  const layer = new PIXI.Container();
  layer.eventMode = "none";
  canvas.interface.addChild(layer);
  trailLayer = layer;
  const points = stops.map(s => ({x: s.x, y: s.y}));
  if ( points.length > 1 ) {
    const line = new PIXI.Graphics();
    line.lineStyle({width: 7, color: 0x000000, alpha: 0.35});
    for ( const [a, b, c, d] of dashSegments(points, 10, 16) ) line.moveTo(a, b).lineTo(c, d);
    line.lineStyle({width: 4, color: 0xffcf40, alpha: 0.95});
    for ( const [a, b, c, d] of dashSegments(points, 10, 16) ) line.moveTo(a, b).lineTo(c, d);
    layer.addChild(line);
  }
  let lastLabel = null;
  stops.forEach((stop, index) => {
    const dot = new PIXI.Graphics();
    dot.beginFill(0xffcf40, 1);
    dot.lineStyle({width: 2, color: 0x2b1d0e, alpha: 0.9});
    dot.drawCircle(stop.x, stop.y, 9);
    dot.endFill();
    layer.addChild(dot);
    const note = canvas.scene.notes.get(stop.id);
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = 20;
    style.fontWeight = "bold";
    style.fill = 0xffffff;
    style.stroke = 0x2b1d0e;
    style.strokeThickness = 5;
    // Stops with the same date share one label
    const label = timeLabel(stop.times[0]);
    const same = label === lastLabel;
    lastLabel = label;
    if ( same ) return;
    const text = new foundry.canvas.containers.PreciseText(label, style);
    text.anchor.set(0.5, 0);
    // Under the pin, a row lower than the route's dot
    text.position.set(stop.x, stop.y + ((note?.iconSize ?? 40) / 2) + 44 + ((index % 2) * 22));
    layer.addChild(text);
  });
}

/* -------------------------------------------- */
/*  The control                                 */
/* -------------------------------------------- */

/**
 * What the control "Where are we?" does. On a map that the party's place is on, it pans to the marker. In a scene that
 * a pin on another map opens, it opens the quick look at that map. Else it says why not.
 * @returns {Promise<"focus"|"look"|"none">}
 */
export async function whereAreWe() {
  if ( !canvas.ready || !canvas.scene ) return "none";
  const state = partyState();
  const sceneId = canvas.scene.id;
  if ( here.size && (state.scene !== sceneId) ) {
    const [id] = [...here.entries()].sort((a, b) => a[1] - b[1])[0];
    const note = canvas.notes.get(id);
    if ( note ) {
      await focusPin(note);
      countFeature(MODULE_ID, "whereAsked");
      return "focus";
    }
  }
  if ( parentPins(sceneId).length ) {
    await openWhere(sceneId);
    return "look";
  }
  ui.notifications.info(t(state.scene ? "SMP.Where.noMap" : "SMP.Where.nobody"));
  return "none";
}
