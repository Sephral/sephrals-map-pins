/**
 * Routes between pins. The GM (and, when the world allows it, every player for themselves) picks pins in order and
 * sees the distance in the scene's units and the travel time at the chosen pace. The route is a dashed line on the
 * map. The GM's route lives in a flag of the scene and is drawn for the GM only until the GM shares it, a player's own
 * route stays on that player's device. A shared route ends before the first pin a player has not discovered.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, isShown, setting, t} from "./config.mjs";
import {cleanStops, dashSegments, routeStats, roundDistance, splitTime, visiblePrefix, cleanPace, positive}
  from "./route-logic.mjs";
import {keyPins} from "./key-logic.mjs";
import {describePin} from "./note-style.mjs";
import {focusPin} from "./list-app.mjs";
import {countFeature, markUsed} from "./usage.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/** The colors of the lines: the route you build and the route the GM shares. */
const COLORS = {main: 0xe8b22a, shared: 0x3fa7d6};

/** What the drawing added to the canvas. */
let layer = null;

/** Is the window waiting for clicks on pins? */
let picking = false;

/* -------------------------------------------- */
/*  Data                                        */
/* -------------------------------------------- */

/**
 * The GM's route of the viewed scene.
 * @param {Scene} [scene]
 * @returns {{stops: string[], shared: boolean}}
 */
export function sceneRoute(scene = canvas.scene) {
  const data = scene?.flags?.[MODULE_ID]?.route ?? {};
  return {stops: cleanStops(data.stops), shared: data.shared === true};
}

/**
 * May this user build a route of their own?
 * @returns {boolean}
 */
export function canBuildRoute() {
  return game.user.isGM || !!setting("routePlayers");
}

/**
 * Can this user open the route window: they build routes or the GM shared one.
 * @returns {boolean}
 */
export function routeAvailable() {
  return canBuildRoute() || (canvas?.ready && sceneRoute().shared);
}

/**
 * The stops of the route this user builds.
 * @returns {string[]}
 */
function ownStops() {
  if ( game.user.isGM ) return sceneRoute().stops;
  return cleanStops(setting("routes")?.[canvas.scene?.id]);
}

/**
 * May this user see a pin? Pins the user must not see are no stops.
 * @param {string} id
 * @returns {boolean}
 */
function canSee(id) {
  const doc = canvas.scene?.notes.get(id);
  if ( !doc ) return false;
  const d = describePin({document: doc});
  return !d.undiscovered && !d.privateHidden;
}

/**
 * The stops of a list that exist and that this user may see, up to the first pin they may not.
 * @param {string[]} ids
 * @returns {NoteDocument[]}
 */
function stopsOf(ids) {
  const valid = new Set(canvas.scene.notes.map(n => n.id));
  return visiblePrefix(cleanStops(ids, valid), canSee).map(id => canvas.scene.notes.get(id));
}

/**
 * The speed of the chosen pace in the scene's units per hour.
 * @param {string} [pace]
 * @returns {number}
 */
export function paceSpeed(pace = setting("pace")) {
  const key = {slow: "paceSlow", normal: "paceNormal", fast: "paceFast"}[cleanPace(pace)];
  return positive(setting(key), 3);
}

/**
 * Distance and time of a list of stops in the viewed scene.
 * @param {NoteDocument[]} docs
 * @returns {{legs: number[], total: number, hours: number}}
 */
export function measure(docs) {
  const dims = canvas.dimensions;
  return routeStats(docs.map(d => ({x: d.x, y: d.y})), {size: dims.size, distance: dims.distance,
    speed: paceSpeed()});
}

/**
 * Travel time as text.
 * @param {number} hours
 * @returns {string}
 */
export function timeText(hours) {
  if ( !(hours > 0) ) return "";
  const {days, hours: h, minutes} = splitTime(hours, setting("hoursPerDay"));
  const parts = [];
  if ( days ) parts.push(t("SMP.Route.days", {n: days}));
  if ( h ) parts.push(t("SMP.Route.hours", {n: h}));
  if ( minutes && !days ) parts.push(t("SMP.Route.minutes", {n: minutes}));
  return parts.join(" ") || t("SMP.Route.minutes", {n: 0});
}

/**
 * The routes this user sees: the one they build and the one the GM shares.
 * @returns {object[]}
 */
function blocks() {
  if ( !canvas.ready || !canvas.scene ) return [];
  const units = canvas.scene.grid?.units ?? "";
  const result = [];
  const build = (id, title, ids, editable, color) => {
    const docs = stopsOf(ids);
    const stats = measure(docs);
    const stops = docs.map((doc, index) => {
      const d = describePin({document: doc});
      return {index, n: index + 1, id: doc.id, number: d.number, name: d.label, leg: index ? `${roundDistance(stats.legs[index - 1])} ${units}` : ""};
    });
    return {id, title, editable, color, css: `#${color.toString(16).padStart(6, "0")}`, docs, stops, count: stops.length,
      total: `${roundDistance(stats.total)} ${units}`, time: timeText(stats.hours), hours: stats.hours,
      last: stops.length - 1};
  };
  if ( game.user.isGM ) {
    const route = sceneRoute();
    result.push({...build("main", t("SMP.Route.gmRoute"), route.stops, true, COLORS.main), shared: route.shared});
  } else {
    if ( canBuildRoute() ) result.push(build("main", t("SMP.Route.ownRoute"), ownStops(), true, COLORS.main));
    const shared = sceneRoute();
    if ( shared.shared ) result.push(build("shared", t("SMP.Route.sharedRoute"), shared.stops, false, COLORS.shared));
  }
  return result;
}

/**
 * The routes of the current user for the API: [{id, stops: [noteId], distance, units, hours}].
 * @returns {object[]}
 */
export function currentRoutes() {
  const units = canvas.scene?.grid?.units ?? "";
  return blocks().map(b => {
    const stats = measure(b.docs);
    return {id: b.id, stops: b.docs.map(d => d.id), distance: stats.total, units, hours: stats.hours,
      pace: setting("pace")};
  });
}

/* -------------------------------------------- */
/*  Changes                                     */
/* -------------------------------------------- */

/**
 * Store the stops of the route this user builds.
 * @param {string[]} stops
 * @param {object} [extra]   More route data for the GM: {shared}
 */
async function saveStops(stops, extra = {}) {
  const clean = cleanStops(stops);
  if ( game.user.isGM ) {
    await canvas.scene.setFlag(MODULE_ID, "route", {stops: clean, shared: extra.shared ?? sceneRoute().shared});
    return;
  }
  const all = foundry.utils.deepClone(setting("routes") ?? {});
  if ( clean.length ) all[canvas.scene.id] = clean;
  else delete all[canvas.scene.id];
  await game.settings.set(MODULE_ID, "routes", all);
}

/**
 * Add a pin to the end of the route this user builds.
 * @param {string} noteId
 * @returns {Promise<boolean>}
 */
export async function addStop(noteId) {
  if ( !canBuildRoute() || !canvas.scene?.notes.has(noteId) || !canSee(noteId) ) return false;
  const stops = ownStops();
  if ( stops.at(-1) === noteId ) return false;
  await saveStops([...stops, noteId]);
  countFeature(MODULE_ID, "routeBuilt");
  return true;
}

/**
 * Take a stop out of the route.
 * @param {number} index
 */
async function removeStop(index) {
  const stops = [...ownStops()];
  stops.splice(index, 1);
  await saveStops(stops);
}

/**
 * Move a stop one place up or down.
 * @param {number} index
 * @param {number} direction
 */
async function moveStop(index, direction) {
  const stops = [...ownStops()];
  const to = index + direction;
  if ( (to < 0) || (to >= stops.length) ) return;
  [stops[index], stops[to]] = [stops[to], stops[index]];
  await saveStops(stops);
}

/**
 * A route through all numbered pins in number order.
 */
async function fromNumbers() {
  const pins = canvas.scene.notes.contents.filter(doc => canSee(doc.id)).map(doc => ({
    id: doc.id, number: describePin({document: doc}).number}));
  await saveStops(keyPins(pins).map(p => p.id));
}

/**
 * Share the GM's route with the players, or stop sharing it.
 */
async function toggleShare() {
  if ( !game.user.isGM ) return;
  const route = sceneRoute();
  await canvas.scene.setFlag(MODULE_ID, "route", {stops: route.stops, shared: !route.shared});
}

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

/**
 * Draw the routes on the map: dashed lines, a numbered dot at each stop and the length of each leg.
 */
export function drawRoute() {
  if ( layer && !layer.destroyed ) layer.destroy({children: true});
  layer = null;
  if ( !canvas.ready || !canvas.interface ) return;
  const list = blocks().filter(b => b.docs.length > 1);
  if ( !list.length ) return;
  layer = new PIXI.Container();
  layer.eventMode = "none";
  canvas.interface.addChild(layer);
  const units = canvas.scene.grid?.units ?? "";
  for ( const block of list ) {
    const points = block.docs.map(d => ({x: d.x, y: d.y}));
    const line = new PIXI.Graphics();
    line.lineStyle({width: 7, color: 0x000000, alpha: 0.45});
    for ( const [a, b, c, d] of dashSegments(points, 28, 18) ) line.moveTo(a, b).lineTo(c, d);
    line.lineStyle({width: 4, color: block.color, alpha: 1});
    for ( const [a, b, c, d] of dashSegments(points, 28, 18) ) line.moveTo(a, b).lineTo(c, d);
    layer.addChild(line);
    const stats = measure(block.docs);
    block.docs.forEach((doc, index) => {
      const dot = new PIXI.Graphics();
      dot.beginFill(block.color, 1);
      dot.lineStyle({width: 2, color: 0x000000, alpha: 0.7});
      dot.drawCircle(doc.x, doc.y + (doc.iconSize / 2) + 20, 14);
      dot.endFill();
      layer.addChild(dot);
      const style = CONFIG.canvasTextStyle.clone();
      style.fontSize = 18;
      style.fontWeight = "bold";
      style.fill = 0x000000;
      style.stroke = 0xFFFFFF;
      style.strokeThickness = 0;
      const text = new foundry.canvas.containers.PreciseText(String(index + 1), style);
      text.anchor.set(0.5, 0.5);
      text.position.set(doc.x, doc.y + (doc.iconSize / 2) + 20);
      layer.addChild(text);
      if ( !index ) return;
      const from = points[index - 1];
      const label = new foundry.canvas.containers.PreciseText(`${roundDistance(stats.legs[index - 1])} ${units}`,
        Object.assign(CONFIG.canvasTextStyle.clone(), {fontSize: 26, fill: 0xFFFFFF, stroke: 0x000000,
          strokeThickness: 5}));
      label.anchor.set(0.5, 0.5);
      label.position.set((from.x + doc.x) / 2, (from.y + doc.y) / 2);
      layer.addChild(label);
    });
  }
}

/**
 * Remove what the drawing added. Call on "canvasTearDown".
 */
export function clearRoute() {
  picking = false;
  if ( layer && !layer.destroyed ) layer.destroy({children: true});
  layer = null;
}

/** Redraw the route and the window after something changed. */
export function refreshRoute() {
  if ( canvas?.ready ) drawRoute();
  const app = foundry.applications.instances.get("smp-route");
  if ( isShown(app) ) app.render({window: {title: app.title}});
}

/* -------------------------------------------- */
/*  Picking pins on the map                     */
/* -------------------------------------------- */

/**
 * Listen for clicks on pins while the window waits for them. Call on "canvasReady".
 */
export function bindRoutePick() {
  const stage = canvas.stage;
  stage.off("pointerdowncapture", onPickDown);
  stage.on("pointerdowncapture", onPickDown);
}

/**
 * A click while picking: the pin becomes the next stop and does nothing else.
 * @param {FederatedPointerEvent} event
 */
function onPickDown(event) {
  if ( !picking || (event.button !== 0) ) return;
  const note = event.target?.parent;
  if ( !note?.document || (note.document.documentName !== "Note") || (note.controlIcon !== event.target) ) return;
  event.stopPropagation();
  addStop(note.id).then(added => {
    if ( !added ) ui.notifications.warn(t("SMP.Route.notAdded"));
  });
}

/**
 * Set whether clicks on pins are picked.
 * @param {boolean} value
 */
function setPicking(value) {
  picking = !!value;
  const view = canvas.app?.view;
  if ( view ) view.style.cursor = picking ? "crosshair" : "";
}

/* -------------------------------------------- */
/*  Window                                      */
/* -------------------------------------------- */

export class RouteApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "smp-route",
    classes: ["smp-app", "smp-route"],
    tag: "section",
    window: {title: "SMP.Route.title", icon: "fa-solid fa-route", resizable: true},
    position: {width: 400, height: "auto"},
    actions: {
      pick: RouteApp.#onPick,
      remove: RouteApp.#onRemove,
      up: RouteApp.#onUp,
      down: RouteApp.#onDown,
      clear: RouteApp.#onClear,
      share: RouteApp.#onShare,
      numbers: RouteApp.#onNumbers,
      focus: RouteApp.#onFocus
    }
  };

  /** @override */
  static PARTS = {main: {template: `${TEMPLATES}/route.hbs`, scrollable: [".smp-route-stops"]}};

  /** @override */
  get title() {
    return t("SMP.Route.title");
  }

  /** @override */
  async _prepareContext() {
    const list = blocks();
    const units = canvas.scene?.grid?.units ?? "";
    const pace = cleanPace(setting("pace"));
    return {
      blocks: list.map(b => ({...b, docs: undefined})),
      empty: !list.length,
      picking,
      isGM: game.user.isGM,
      pace,
      paces: ["slow", "normal", "fast"].map(key => ({key, selected: key === pace, label: t(`SMP.SETTINGS.pace.${key}`)})),
      speedText: t("SMP.Route.speed", {speed: roundDistance(paceSpeed(pace)), units: units || t("SMP.Route.units")}),
      text: {
        pick: t(picking ? "SMP.Route.picking" : "SMP.Route.pick"),
        numbers: t("SMP.Route.numbers"),
        clear: t("SMP.Route.clear"),
        remove: t("SMP.Route.remove"),
        up: t("SMP.Route.up"),
        down: t("SMP.Route.down"),
        share: t("SMP.Route.share"),
        unshare: t("SMP.Route.unshare"),
        empty: t(canBuildRoute() ? "SMP.Route.emptyBuild" : "SMP.Route.emptyView"),
        noStops: t("SMP.Route.noStops"),
        pace: t("SMP.Route.pace"),
        total: t("SMP.Route.total"),
        time: t("SMP.Route.time"),
        shared: t("SMP.Route.sharedHint")
      }
    };
  }

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    addSettingsGear(frame);
    return frame;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.dataset.smpTheme = setting("theme");
    this.element.querySelector("select[name=pace]")?.addEventListener("change", event => {
      game.settings.set(MODULE_ID, "pace", event.target.value);
    });
  }

  /** @override */
  async _onClose(options) {
    setPicking(false);
    return super._onClose(options);
  }

  static #onPick() {
    setPicking(!picking);
    foundry.applications.instances.get("smp-route")?.render();
  }

  static #onRemove(event, target) {
    removeStop(Number(target.closest("[data-index]")?.dataset.index));
  }

  static #onUp(event, target) {
    moveStop(Number(target.closest("[data-index]")?.dataset.index), -1);
  }

  static #onDown(event, target) {
    moveStop(Number(target.closest("[data-index]")?.dataset.index), 1);
  }

  static #onClear() {
    saveStops([]);
  }

  static #onShare() {
    toggleShare();
  }

  static #onNumbers() {
    fromNumbers();
  }

  static #onFocus(event, target) {
    focusPin(canvas.scene?.notes.get(target.closest("[data-id]")?.dataset.id));
  }
}

/**
 * Open the route window.
 * @returns {Promise<RouteApp|null>}
 */
export async function openRoute() {
  if ( !routeAvailable() ) {
    ui.notifications.info(t("SMP.Route.unavailable"));
    return null;
  }
  const existing = foundry.applications.instances.get("smp-route");
  const app = existing ?? new RouteApp();
  // New windows open at the right edge, so the map stays free for picking pins
  const options = {force: true};
  if ( !existing ) options.position = {left: Math.max(window.innerWidth - 440, 8), top: 70};
  await app.render(options);
  markUsed(MODULE_ID);
  return app;
}

/**
 * Is a pin one of the stops of the route this user builds?
 * @param {string} noteId
 * @returns {boolean}
 */
export function inRoute(noteId) {
  return ownStops().includes(noteId);
}
