/**
 * Areas: labeled shapes on a map (a realm, a faction's land, a danger zone). An area is an ordinary Foundry drawing
 * (a polygon, a rectangle or an ellipse with a text label) that carries flags of this module: a category, a journal,
 * a preview text and, when the area is hidden until discovered, who found it. Without the module the drawing is still
 * there with its shape, its color and its label.
 *
 * Why drawings: players see them on Foundry 13 and 14, they have a text label that is readable at any zoom, a document
 * of the scene (so they are saved, copied and exported with it) and a shape the GM already knows how to draw and edit.
 * Regions are not drawn for players at all and have no label, so they cannot show a realm.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, applyRemovals, esc, flagsOf, isV14, onOtherLevel, setting, t}
  from "./config.mjs";
import {AREA_KEYS, areaAt, areaFlags, areaName, areaPolygon, areaStyle, boundsOf, isArea, labelFontSize,
  newlyExploredAreas, samplePoints} from "./area-logic.mjs";
import {EVERYBODY, foundList, isDiscovered, isHiddenPin, revealResult, undiscoveredFor} from "./discover-logic.mjs";
import {askReveal} from "./discover.mjs";
import {request} from "./player-pins.mjs";
import {hidePreview, cardKey, previewFromParts, showCardAt} from "./preview.mjs";
import {categoryById, categoryList, localFound} from "./state.mjs";
import {categoryOff} from "./visibility.mjs";
import {countFeature} from "./usage.mjs";

/** The area a GM is drawing now: {flags, name, shape, until}. The next drawing this GM creates becomes the area. */
let pending = null;

/** Does each area show to this user? Used to tell an area that just appeared. */
const known = new Map();

/** Areas already announced to the player, and areas reported to the GM and waiting for the answer. */
const announced = new Set();
const reported = new Set();

let checkTimer = 0;
let retryAfter = 0;
const timers = new Set();

/* -------------------------------------------- */
/*  What an area is                             */
/* -------------------------------------------- */

/**
 * The areas of a scene (drawings with the area flag).
 * @param {Scene} [scene]
 * @returns {DrawingDocument[]}
 */
export function areasOf(scene = canvas.scene) {
  return (scene?.drawings?.contents ?? []).filter(doc => isArea(flagsOf(doc)));
}

/**
 * The corners of an area in scene coordinates.
 * @param {DrawingDocument} doc
 * @returns {{x: number, y: number}[]}
 */
export function polygonOf(doc) {
  return areaPolygon({x: doc.x, y: doc.y, rotation: doc.rotation, shape: {type: doc.shape?.type,
    width: doc.shape?.width, height: doc.shape?.height, points: doc.shape?.points}});
}

/**
 * How an area looks to this user: its name, category, and whether it must stay unseen.
 * @param {DrawingDocument} doc
 * @returns {object}
 */
export function describeArea(doc) {
  const flags = flagsOf(doc);
  const category = categoryById(flags.category);
  const undiscovered = undiscoveredFor(flags, game.user.id, game.user.isGM) && !localFound.has(doc.id);
  return {flags, category, name: areaName(doc.text, t("SMP.Area.unnamed")), undiscovered,
    categoryHidden: categoryOff(flags), hiddenMark: game.user.isGM && isHiddenPin(flags)};
}

/**
 * The areas this user may see on the viewed scene.
 * @returns {DrawingDocument[]}
 */
export function visibleAreas() {
  return areasOf().filter(doc => !describeArea(doc).undiscovered);
}

/** The journal entry and page an area points at, when they exist. */
function journalOf(doc) {
  const flags = flagsOf(doc);
  const entry = flags.entry ? game.journal.get(flags.entry) : null;
  const page = (entry && flags.page) ? entry.pages.get(flags.page) : null;
  return {entry, page};
}

/**
 * Open the journal of an area, when this user may read it.
 * @param {DrawingDocument} doc
 * @returns {boolean} Whether a journal was opened
 */
export function openAreaJournal(doc) {
  const {entry, page} = journalOf(doc);
  if ( !entry ) return false;
  if ( !(game.user.isGM || (page ?? entry).testUserPermission(game.user, "LIMITED")) ) {
    ui.notifications.warn(t("SMP.Area.noRights"));
    return true;
  }
  entry.sheet.render(true, page ? {pageId: page.id} : {});
  return true;
}

/* -------------------------------------------- */
/*  Showing and hiding on the map               */
/* -------------------------------------------- */

/**
 * Hook "drawDrawing" and "refreshDrawing": an area the user may not see (not discovered, or the category is switched
 * off) is not shown. A hidden area is also hidden in Foundry's own drawing, so it stays hidden when the module is off;
 * a player who found it sees it all the same.
 * @param {Drawing} drawing
 */
export function applyAreaState(drawing) {
  const doc = drawing?.document;
  if ( !doc || drawing.destroyed ) return;
  const flags = flagsOf(doc);
  if ( !isArea(flags) ) return;
  const d = describeArea(doc);
  const shape = drawing.shape;
  if ( d.undiscovered || d.categoryHidden ) {
    drawing.visible = false;
    if ( shape ) shape.visible = false;
    return;
  }
  // Found, but Foundry hides the drawing from players: show it
  if ( !game.user.isGM && doc.hidden && !onOtherLevel(doc) ) {
    drawing.visible = true;
    if ( shape ) {
      shape.visible = true;
      shape.alpha = drawing.alpha;
    }
  }
}

/**
 * Show or hide one area again, for example after it was revealed.
 * @param {DrawingDocument|string} target
 */
export function refreshArea(target) {
  const id = target?.id ?? target;
  const drawing = canvas.drawings?.get(id);
  if ( !drawing ) return;
  drawing.renderFlags?.set({refreshState: true});
  applyAreaState(drawing);
}

/** Show or hide all areas again, for example after the category filter changed. */
export function restyleAreas() {
  for ( const drawing of canvas.drawings?.placeables ?? [] ) {
    if ( !isArea(flagsOf(drawing.document)) ) continue;
    drawing.renderFlags?.set({refreshState: true});
    applyAreaState(drawing);
  }
}

/* -------------------------------------------- */
/*  Reveal and hide                             */
/* -------------------------------------------- */

/**
 * Hide an area until it is discovered, or show it to everybody (GM). The drawing is hidden in Foundry as well.
 * @param {DrawingDocument} doc
 * @param {boolean} hidden
 */
export async function setAreaHidden(doc, hidden) {
  const change = hidden ? {hidden: true} : applyRemovals({"-=hidden": null});
  await doc.update({hidden: !!hidden && !foundList(flagsOf(doc)).includes(EVERYBODY), flags: {[MODULE_ID]: change}});
}

/**
 * Reveal an area for players or hide it again (GM). Options as for pins: {all}, {users}, {hideFor}, {reset}. Revealing
 * for everybody also lifts Foundry's own hidden mark of the drawing.
 * @param {DrawingDocument} doc
 * @param {object} options
 * @returns {Promise<string[]>} The found list now
 */
export async function revealArea(doc, {all = false, users = [], hideFor = [], reset = false} = {}) {
  const flags = flagsOf(doc);
  const playerIds = game.users.filter(u => !u.isGM).map(u => u.id);
  const {found, blocked} = revealResult(flags, {playerIds, all, add: users, remove: hideFor, reset});
  const change = {};
  if ( !isHiddenPin(flags) ) change.hidden = true;
  if ( found.length ) change.found = found;
  else if ( "found" in flags ) Object.assign(change, applyRemovals({"-=found": null}));
  if ( blocked.length ) change.blocked = blocked;
  else if ( "blocked" in flags ) Object.assign(change, applyRemovals({"-=blocked": null}));
  await doc.update({hidden: !found.includes(EVERYBODY), flags: {[MODULE_ID]: change}});
  if ( found.length ) countFeature(MODULE_ID, "areaRevealed");
  return found;
}

/**
 * Ask the GM whom to reveal an area to.
 * @param {DrawingDocument} doc
 * @returns {Promise<boolean>}
 */
export function askRevealArea(doc) {
  return askReveal(doc, {name: describeArea(doc).name, apply: revealArea});
}

/* -------------------------------------------- */
/*  Discovery by exploring                      */
/* -------------------------------------------- */

/**
 * Is a point explored by this user, or in sight right now?
 * @param {{x: number, y: number}} point
 * @returns {boolean}
 */
function explored(point) {
  if ( canvas.fog?.isPointExplored?.(point) ) return true;
  try {
    return !!canvas.visibility?.testVisibility?.(point, {tolerance: 10});
  } catch(err) {
    return false;
  }
}

/** Look for hidden areas whose ground this player has explored and report them to the GM. */
export function checkAreaDiscovery() {
  if ( game.user.isGM || !setting("discoverAuto") || (Date.now() < retryAfter) || !canvas?.ready
    || !canvas.fog?.tokenVision || !canvas.fog?.fogExploration ) return;
  const docs = areasOf().filter(doc => isHiddenPin(flagsOf(doc)) && !onOtherLevel(doc));
  if ( !docs.length ) return;
  const areas = docs.map(doc => ({id: doc.id, flags: flagsOf(doc), samples: samplePoints(polygonOf(doc))}));
  const ids = newlyExploredAreas(areas, game.user.id, explored, new Set([...reported, ...localFound]));
  if ( ids.length ) report(ids);
}

/** Check after a short pause, so several changes of the fog in a row count once. */
export function scheduleAreaCheck() {
  if ( checkTimer || game.user.isGM ) return;
  checkTimer = setTimeout(() => {
    checkTimer = 0;
    checkAreaDiscovery();
  }, 350);
}

/**
 * Tell the active GM about discovered areas and show them at once.
 * @param {string[]} ids
 */
async function report(ids) {
  const scene = canvas.scene;
  for ( const id of ids ) {
    reported.add(id);
    localFound.add(id);
    refreshArea(id);
  }
  const result = await request("discover", {sceneId: scene.id, drawingIds: ids});
  for ( const id of ids ) reported.delete(id);
  if ( result.ok ) {
    for ( const id of ids ) {
      known.set(id, true);
      const doc = scene.drawings.get(id);
      if ( doc ) announce(doc);
    }
    return;
  }
  for ( const id of ids ) {
    localFound.delete(id);
    refreshArea(id);
  }
  retryAfter = Date.now() + 20000;
}

/**
 * Tell a player that an area appeared: a note, and a ping in its middle.
 * @param {DrawingDocument} doc
 */
function announce(doc) {
  if ( announced.has(doc.id) || game.user.isGM ) return;
  announced.add(doc.id);
  if ( !setting("discoverPing") ) return;
  ui.notifications.info(t("SMP.Area.found", {name: describeArea(doc).name}));
  if ( canvas.scene?.id !== doc.parent?.id ) return;
  const box = boundsOf(polygonOf(doc));
  try {
    canvas.ping({x: box.x + (box.width / 2), y: box.y + (box.height / 2)});
  } catch(err) {
    console.debug(`${MODULE_ID} | Could not ping`, err);
  }
}

/** Start watching the viewed scene. Call on "canvasReady". */
export function startAreas() {
  stopAreas();
  for ( const doc of areasOf() ) known.set(doc.id, !undiscoveredFor(flagsOf(doc), game.user.id, game.user.isGM));
  restyleAreas();
  bindAreaHover();
  if ( game.user.isGM ) return;
  canvas.fog?.addEventListener?.("explored", scheduleAreaCheck);
  for ( const delay of [900, 2600, 6200] ) timers.add(setTimeout(checkAreaDiscovery, delay));
}

/** Stop watching. Call on "canvasTearDown". */
export function stopAreas() {
  clearTimeout(checkTimer);
  checkTimer = 0;
  for ( const id of timers ) clearTimeout(id);
  timers.clear();
  known.clear();
  announced.clear();
  reported.clear();
  retryAfter = 0;
  unbindAreaHover();
  try {
    canvas.fog?.removeEventListener?.("explored", scheduleAreaCheck);
  } catch(err) {
    // The canvas is going away
  }
}

/**
 * Hook "createDrawing", "updateDrawing" and "deleteDrawing": show or hide the area, tell a player when an area newly
 * appeared.
 * @param {DrawingDocument} doc
 * @param {object} [changes]
 */
export function onAreaChanged(doc, changes) {
  if ( doc.parent !== canvas.scene ) return;
  if ( changes && !(changes.flags && (MODULE_ID in changes.flags)) && !("hidden" in changes) ) return;
  localFound.delete(doc.id);
  if ( !isArea(flagsOf(doc)) ) {
    known.delete(doc.id);
    refreshArea(doc);
    return;
  }
  refreshArea(doc);
  const shown = !undiscoveredFor(flagsOf(doc), game.user.id, game.user.isGM);
  const was = known.get(doc.id);
  known.set(doc.id, shown);
  if ( !shown ) announced.delete(doc.id);
  else if ( was === false ) announce(doc);
  scheduleAreaCheck();
}

/**
 * Hook "deleteDrawing".
 * @param {DrawingDocument} doc
 */
export function onAreaDeleted(doc) {
  known.delete(doc.id);
  announced.delete(doc.id);
  localFound.delete(doc.id);
  if ( cardKey() === `area:${doc.id}` ) hidePreview();
}

/* -------------------------------------------- */
/*  Preview on hover                            */
/* -------------------------------------------- */

let hoverTimer = 0;
let hoverFrame = 0;
let hoverEvent = null;
let hoverArea = null;

/** Listen to the pointer on the canvas, once per canvas. */
function bindAreaHover() {
  unbindAreaHover();
  canvas.stage.on("pointermove", onStageMove);
  canvas.stage.on("pointerleave", onStageLeave);
}

/** Stop listening. */
function unbindAreaHover() {
  clearTimeout(hoverTimer);
  cancelAnimationFrame(hoverFrame);
  hoverFrame = 0;
  hoverArea = null;
  try {
    canvas.stage?.off("pointermove", onStageMove);
    canvas.stage?.off("pointerleave", onStageLeave);
  } catch(err) {
    // The canvas is going away
  }
}

/** The map moved under a resting pointer: look again which area is under it. Call on "canvasPan". */
export function refreshAreaHover() {
  if ( !hoverEvent || !canvas?.ready ) return;
  cancelAnimationFrame(hoverFrame);
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    if ( hoverEvent ) updateHover(hoverEvent);
  });
}

/** The pointer left the canvas. */
function onStageLeave() {
  hoverEvent = null;
  clearHover();
}

/** Forget the area under the pointer and remove its card. */
function clearHover() {
  clearTimeout(hoverTimer);
  hoverTimer = 0;
  hoverArea = null;
  if ( cardKey()?.startsWith("area:") ) hidePreview();
}

/**
 * The pointer moved over the canvas. Several moves in one frame count once.
 * @param {FederatedPointerEvent} event
 */
function onStageMove(event) {
  hoverEvent = {x: event.global.x, y: event.global.y, buttons: event.buttons};
  if ( hoverFrame ) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    if ( hoverEvent ) updateHover(hoverEvent);
  });
}

/**
 * Which area is under the pointer: the smallest one the user may see, and none while the pointer is on a pin, a token
 * or while the drawing tools are in use.
 * @param {{x: number, y: number, buttons: number}} pointer   In screen pixels of the canvas
 * @returns {DrawingDocument|null}
 */
export function areaUnder(pointer) {
  if ( !canvas.ready || pointer.buttons || canvas.drawings?.active || canvas.notes?.hover
    || canvas.tokens?.hover ) return null;
  const point = canvas.stage.toLocal({x: pointer.x, y: pointer.y});
  const docs = visibleAreas().filter(doc => !describeArea(doc).categoryHidden && !onOtherLevel(doc)
    && (flagsOf(doc).entry || flagsOf(doc).previewText));
  const id = areaAt(docs.map(doc => ({id: doc.id, polygon: polygonOf(doc)})), point);
  return id ? canvas.scene.drawings.get(id) : null;
}

/**
 * Show the card of the area under the pointer after a short rest, remove it when the pointer leaves the area.
 * @param {{x: number, y: number, buttons: number}} pointer
 */
function updateHover(pointer) {
  const doc = areaUnder(pointer);
  if ( (doc?.id ?? null) === hoverArea ) return;
  clearHover();
  hoverArea = doc?.id ?? null;
  if ( !doc ) return;
  hoverTimer = setTimeout(() => showAreaCard(doc, hoverEvent ?? pointer), 300);
}

/**
 * The card's content for an area and a user, or null when there is nothing to show. This is the same rights check as
 * for pins: the journal is read only after Foundry's permission check passed.
 * @param {DrawingDocument} doc
 * @param {User} [user=game.user]
 * @returns {{title: string, blocks: {kind: string, text: string}[], image: string, mode: string, quest?: string}|null}
 */
export function buildAreaPreview(doc, user = game.user) {
  const flags = flagsOf(doc);
  if ( !isArea(flags) || (undiscoveredFor(flags, user.id, !!user.isGM) && !localFound.has(doc.id)) ) return null;
  const {entry, page} = journalOf(doc);
  const data = previewFromParts({title: describeArea(doc).name, flags, entry, page, user});
  if ( !data ) return null;
  // An area without a journal shows only a card that has something to say
  if ( !entry && !data.blocks.length ) return null;
  const category = categoryById(flags.category);
  if ( category ) data.quest = category.name;
  return data;
}

/**
 * Show the card of an area at the pointer.
 * @param {DrawingDocument} doc
 * @param {{x: number, y: number}} pointer   In screen pixels of the canvas
 */
function showAreaCard(doc, pointer) {
  const data = buildAreaPreview(doc);
  if ( !data || !canvas.ready ) return;
  const view = canvas.app.view.getBoundingClientRect();
  const x = view.left + pointer.x;
  const y = view.top + pointer.y;
  showCardAt(data, {left: x - 6, top: y - 6, width: 12, height: 12}, `area:${doc.id}`);
  countFeature(MODULE_ID, "areaPreviewShown");
}

/* -------------------------------------------- */
/*  Making an area                              */
/* -------------------------------------------- */

/**
 * The journals of the world, by name, for a choice list. The GM sees all of them.
 * @returns {{id: string, name: string}[]}
 */
function journalChoices() {
  return game.journal.contents.map(j => ({id: j.id, name: j.name}))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/**
 * The fields of an area, as the section in the drawing dialog and the dialog for a new area show them.
 * @param {object} flags   The area's flags now
 * @returns {object}
 */
function fieldData(flags) {
  const options = (list, current) => list.map(([value, label]) => ({value, label, selected: String(current ?? "") === value}));
  return {
    prefix: `flags.${MODULE_ID}`,
    theme: setting("theme"),
    values: {area: isArea(flags), previewText: flags.previewText ?? "", hidden: isHiddenPin(flags)},
    choices: {
      category: options([["", t("SMP.Config.noCategory")], ...categoryList().map(c => [c.id, c.name])], flags.category),
      entry: options([["", t("SMP.Area.noJournal")], ...journalChoices().map(j => [j.id, j.name])], flags.entry)
    },
    text: Object.fromEntries(["title", "isArea", "isAreaHint", "category", "journal", "previewText", "previewTextHint",
      "hidden", "hiddenHint", "reveal"].map(key => [key, t(`SMP.Area.${key}`)]))
  };
}

/**
 * Hook "renderDrawingConfig": the section "Area" in the drawing dialog.
 * @param {ApplicationV2} app
 * @param {HTMLElement} html
 */
export async function onRenderDrawingConfig(app, html) {
  const element = (html instanceof HTMLElement) ? html : html?.[0];
  if ( !element || element.querySelector(".smp-area-config") || !game.user.isGM ) return;
  const doc = app.document;
  if ( !doc || (doc.documentName !== "Drawing") ) return;
  const flags = flagsOf(doc);
  const data = fieldData(flags);
  data.existing = !!doc.collection?.has(doc.id);
  data.foundText = isHiddenPin(flags) ? t("SMP.Config.foundBy", {count: foundList(flags).includes(EVERYBODY)
    ? t("SMP.Reveal.everybody") : foundList(flags).length}) : "";
  const markup = await foundry.applications.handlebars.renderTemplate(`${TEMPLATES}/area-section.hbs`, data);
  if ( element.querySelector(".smp-area-config") ) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = markup;
  const section = wrapper.firstElementChild;
  const form = element.matches("form") ? element : element.querySelector("form");
  if ( !form ) return;
  const footer = form.querySelector("footer.form-footer");
  if ( footer ) footer.before(section);
  else form.append(section);
  section.querySelector("[data-smp-reveal]")?.addEventListener("click", event => {
    event.preventDefault();
    askRevealArea(doc);
  });
  app.setPosition?.({height: "auto"});
}

/**
 * Clean the module's part of the changes of a drawing before it is saved: an area keeps only filled fields, takes the
 * style of its category when the category changed, and its hidden choice is passed to Foundry's own hidden mark.
 * @param {DrawingDocument} doc
 * @param {object} changes   The update, changed in place
 */
export function cleanAreaChanges(doc, changes) {
  const mine = changes?.flags?.[MODULE_ID];
  if ( !mine || (typeof mine !== "object") ) return;
  const before = flagsOf(doc);
  // The "area" box was unticked: the drawing is a plain drawing again, nothing of the module stays on it
  if ( (mine.area === false) || (mine.area === "false") ) {
    const removal = {};
    for ( const key of AREA_KEYS ) if ( key in before ) removal[`-=${key}`] = null;
    changes.flags[MODULE_ID] = applyRemovals(removal);
    if ( !Object.keys(changes.flags[MODULE_ID]).length ) delete changes.flags[MODULE_ID];
    if ( !Object.keys(changes.flags).length ) delete changes.flags;
    return;
  }
  const next = {...before, ...mine};
  if ( !isArea(next) ) return;
  const removal = {};
  for ( const key of ["category", "entry", "page", "previewText"] ) {
    if ( (key in mine) && !String(mine[key] ?? "").trim() ) {
      delete mine[key];
      if ( key in before ) removal[`-=${key}`] = null;
    }
  }
  if ( ("entry" in removal) || (("entry" in mine) && (mine.entry !== before.entry)) ) {
    if ( "page" in before ) removal["-=page"] = null;
    delete mine.page;
  }
  if ( "hidden" in mine ) {
    const hidden = (mine.hidden === true) || (mine.hidden === "true");
    if ( hidden === isHiddenPin(before) ) delete mine.hidden;
    else if ( hidden ) {
      mine.hidden = true;
      changes.hidden = !foundList(before).includes(EVERYBODY);
    } else {
      delete mine.hidden;
      removal["-=hidden"] = null;
      changes.hidden = false;
    }
  }
  // A new category (or a new area): the drawing takes its colors
  if ( ("category" in mine) && (mine.category !== before.category) || !isArea(before) || ("-=category" in removal) ) {
    const style = areaStyle(categoryById(next.category)?.color);
    for ( const [key, value] of Object.entries(style) ) if ( !(key in changes) ) changes[key] = value;
  }
  Object.assign(mine, applyRemovals(removal));
  if ( !Object.keys(mine).length ) delete changes.flags[MODULE_ID];
  if ( !Object.keys(changes.flags).length ) delete changes.flags;
}

/**
 * Make every area of every scene take the colors of its category again (GM). Used after a category's color changed.
 * @returns {Promise<number>} How many drawings were changed
 */
export async function syncAreaColors() {
  if ( !game.user.isGM || !game.users.activeGM?.isSelf ) return 0;
  let count = 0;
  for ( const scene of game.scenes ) {
    const updates = [];
    for ( const doc of areasOf(scene) ) {
      const category = categoryById(flagsOf(doc).category);
      if ( !category ) continue;
      const style = areaStyle(category.color);
      if ( (doc.fillColor?.css ?? doc.fillColor) === style.fillColor && (doc.strokeColor?.css ?? doc.strokeColor) === style.strokeColor ) continue;
      updates.push({_id: doc.id, fillColor: style.fillColor, strokeColor: style.strokeColor});
    }
    if ( updates.length ) {
      await scene.updateEmbeddedDocuments("Drawing", updates);
      count += updates.length;
    }
  }
  return count;
}

/**
 * Ask the GM for the details of a new area, then let them draw its shape. The next shape the GM draws becomes the area:
 * its label, colors, category, journal and hiding are set by the module.
 * @returns {Promise<boolean>} Whether the drawing tool was started
 */
export async function newArea() {
  if ( !game.user.isGM || !canvas.ready ) return false;
  const data = fieldData({});
  const nameLabel = t("SMP.Area.name");
  const content = `<div class="smp-app smp-area-new" data-smp-theme="${esc(data.theme)}">
    <div class="form-group"><label>${esc(nameLabel)}</label>
      <div class="form-fields"><input type="text" name="areaName" maxlength="60" placeholder="${esc(t("SMP.Area.namePlaceholder"))}" autofocus></div></div>
    <div class="form-group"><label>${esc(data.text.category)}</label>
      <div class="form-fields"><select name="areaCategory">${data.choices.category.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select></div></div>
    <div class="form-group"><label>${esc(data.text.journal)}</label>
      <div class="form-fields"><select name="areaEntry">${data.choices.entry.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select></div></div>
    <div class="form-group"><label>${esc(data.text.hidden)}</label>
      <div class="form-fields"><input type="checkbox" name="areaHidden" ${setting("discoverDefault") ? "checked" : ""}></div>
      <p class="hint">${esc(data.text.hiddenHint)}</p></div>
    <p class="hint">${esc(t("SMP.Area.shapeHint"))}</p></div>`;
  const collect = (shape, button) => {
    const els = button.form.elements;
    return {shape, name: els.areaName.value, category: els.areaCategory.value, entry: els.areaEntry.value,
      hidden: els.areaHidden.checked};
  };
  const result = await foundry.applications.api.DialogV2.wait({
    window: {title: t("SMP.Area.newTitle"), icon: "fa-solid fa-draw-polygon"},
    position: {width: 460},
    content,
    rejectClose: false,
    render: (event, dialog) => addSettingsGear(dialog.element),
    buttons: [
      {action: "polygon", label: t("SMP.Area.polygon"), icon: "fa-solid fa-draw-polygon", default: true,
        callback: (event, button) => collect("polygon", button)},
      {action: "rect", label: t("SMP.Area.rect"), icon: "fa-regular fa-square", callback: (event, button) => collect("rect", button)},
      {action: "ellipse", label: t("SMP.Area.ellipse"), icon: "fa-regular fa-circle",
        callback: (event, button) => collect("ellipse", button)},
      {action: "cancel", label: t("SMP.Reveal.cancel"), icon: "fa-solid fa-xmark", callback: () => null}
    ]
  });
  if ( !result ) return false;
  return startArea(result);
}

/**
 * Prepare the next drawing to become an area and switch to the drawing tool.
 * @param {object} data   {shape, name, category, entry, hidden, previewText}
 * @returns {boolean}
 */
export function startArea(data) {
  const name = areaName(data.name, t("SMP.Area.unnamed"));
  pending = {flags: areaFlags({category: data.category, entry: data.entry, previewText: data.previewText,
    hidden: data.hidden === true}), name, until: Date.now() + 10 * 60 * 1000};
  const tool = ["rect", "ellipse", "polygon", "freehand"].includes(data.shape) ? data.shape : "polygon";
  ui.controls.activate({control: "drawings", tool});
  ui.notifications.info(t("SMP.Area.draw", {name}));
  return true;
}

/** Forget an area that was prepared but not drawn. */
export function cancelArea() {
  pending = null;
}

/**
 * Hook "preCreateDrawing": the drawing the GM just made becomes the prepared area.
 * @param {DrawingDocument} doc
 * @param {object} data
 * @param {object} options
 * @param {string} userId
 */
export function onPreCreateDrawing(doc, data, options, userId) {
  if ( !pending || (userId !== game.user.id) ) return;
  if ( Date.now() > pending.until ) {
    pending = null;
    return;
  }
  const {flags, name} = pending;
  const category = categoryById(flags.category);
  const box = boundsOf(areaPolygon({x: 0, y: 0, rotation: 0, shape: {type: doc.shape?.type, width: doc.shape?.width,
    height: doc.shape?.height, points: doc.shape?.points}}));
  const update = {text: name, fontSize: labelFontSize(box.width, box.height, name), ...areaStyle(category?.color),
    flags: {[MODULE_ID]: flags}};
  if ( flags.hidden ) update.hidden = true;
  if ( isV14() ) update.name = name;
  doc.updateSource(update);
  pending = null;
}

/**
 * Hook "createDrawing": count a new area.
 * @param {DrawingDocument} doc
 * @param {object} options
 * @param {string} userId
 */
export function onCreateArea(doc, options, userId) {
  if ( (userId === game.user.id) && isArea(flagsOf(doc)) ) countFeature(MODULE_ID, "areaCreated");
}

/**
 * Pan the map to an area and ping its middle.
 * @param {DrawingDocument} doc
 * @returns {Promise<void>}
 */
export async function focusArea(doc) {
  if ( !doc || !canvas.ready || (doc.parent !== canvas.scene) ) return;
  if ( onOtherLevel(doc) ) {
    const level = [...doc.levels][0];
    if ( level ) await canvas.scene.view({level});
  }
  const box = boundsOf(polygonOf(doc));
  const x = box.x + (box.width / 2);
  const y = box.y + (box.height / 2);
  const view = canvas.app.view.getBoundingClientRect();
  const fit = Math.min(view.width / Math.max(box.width, 1), view.height / Math.max(box.height, 1)) * 0.8;
  const scale = Math.min(Math.max(fit, 0.1), 1.5);
  await canvas.animatePan({x, y, scale, duration: 300});
  try {
    canvas.ping({x, y});
  } catch(err) {
    console.debug(`${MODULE_ID} | Could not ping`, err);
  }
}

/**
 * The rows of the pin list for the areas this user may see.
 * @returns {object[]}
 */
export function areaRows() {
  if ( !canvas.ready || !canvas.scene ) return [];
  return areasOf().map(doc => ({doc, d: describeArea(doc)})).filter(({d}) => !d.undiscovered).map(({doc, d}) => {
    const found = foundList(d.flags);
    return {
      id: doc.id,
      name: d.name,
      category: d.category?.name ?? "",
      categoryId: d.category?.id ?? "",
      color: d.category?.color ?? "",
      off: d.categoryHidden,
      other: onOtherLevel(doc),
      hasJournal: !!doc.flags?.[MODULE_ID]?.entry,
      hiddenPin: d.hiddenMark,
      foundCount: found.includes(EVERYBODY) ? t("SMP.Reveal.everybody") : String(found.length),
      needle: `${d.name} ${d.category?.name ?? ""} ${t("SMP.Area.word")}`.toLowerCase()
    };
  }).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/**
 * Is a user among those who found an area (or is it not hidden)?
 * @param {DrawingDocument} doc
 * @param {string} userId
 * @returns {boolean}
 */
export function areaDiscovered(doc, userId) {
  return isDiscovered(flagsOf(doc), userId);
}
