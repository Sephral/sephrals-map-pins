/**
 * The look of a pin on the map: label, background, size on screen, number badge, category color and symbol. It only
 * changes how the pieces of a Note are shown (hooks drawNote, refreshNote and canvasPan), never the note itself, so
 * a pin stays an ordinary Foundry note without the module.
 */

import {DEFAULT_NOTE_ICON, flagsOf, isV14, onOtherLevel, t} from "./config.mjs";
import {cleanNumber, constantScale, hiddenByZoom, hiddenPrivatePin, numberFromName, resolveStyle} from "./pin-logic.mjs";
import {categoryById, hiddenCategories, privatePins, worldStyle} from "./state.mjs";

/** What the module added to each note and what it last decided. */
const states = new WeakMap();

/**
 * The module's state of a note.
 * @param {Note} note
 * @returns {object}
 */
function stateOf(note) {
  let state = states.get(note);
  if ( !state ) {
    state = {ring: null, ringKey: "", badge: null, badgeKey: "", src: null, constant: false, percent: 100, minZoom: 0,
      zoomHidden: false};
    states.set(note, state);
  }
  return state;
}

/**
 * The whole look of a note: the resolved style, the number and label to show, and whether it must be hidden.
 * @param {Note} note
 * @returns {object}
 */
export function describePin(note) {
  const doc = note.document;
  const flags = flagsOf(doc);
  const category = categoryById(flags.category);
  const style = resolveStyle(worldStyle(), flags, category);
  const privateHidden = hiddenPrivatePin(flags, game.user.id, game.user.isGM);
  const categoryHidden = !!flags.category && hiddenCategories().has(flags.category);
  let label = doc.label;
  let number = cleanNumber(flags.number);
  let local = null;
  if ( flags.private ) {
    if ( flags.owner === game.user.id ) {
      local = privatePins()[doc.id] ?? null;
      label = local?.name || t("SMP.Player.unknownPrivate");
    } else {
      label = t("SMP.Player.privateOf", {user: game.users.get(flags.owner)?.name ?? "?"});
    }
  } else if ( !number && worldStyle().numberFromName ) {
    // The number comes from the name of the pin's journal; the label loses it only when it is that name
    const journalName = doc.page?.name || doc.entry?.name || "";
    const parsed = numberFromName(journalName);
    if ( parsed ) {
      number = parsed.number;
      if ( label === journalName ) label = parsed.name;
    }
  }
  return {flags, category, style, label, number, privateHidden, categoryHidden, local,
    ownSource: category?.icon && ((doc.texture?.src ?? DEFAULT_NOTE_ICON) === DEFAULT_NOTE_ICON) ? category.icon : null};
}

/* -------------------------------------------- */

/**
 * Apply the module's look to a note. Called after Foundry refreshed the note.
 * @param {Note} note
 */
export function applyStyle(note) {
  const icon = note?.controlIcon;
  if ( !icon || !note.tooltip || note.destroyed || icon.destroyed ) return;
  const d = describePin(note);
  const st = stateOf(note);
  const hovered = !!(note.hover || note.layer?.highlightObjects);

  // Pins this user must not see, and categories this user switched off
  if ( (d.privateHidden || d.categoryHidden) && note.visible ) note.visible = false;
  // Foundry 14 hides a note without a journal that a GM wrote from everybody but the GM. A private pin shows to its
  // author all the same, and a pin that links to a scene shows to players as it does on Foundry 13
  else if ( !note.visible && !d.categoryHidden && !d.privateHidden && !onOtherLevel(note.document)
    && isV14() && !game.user.isGM && !note.document.entryId && (d.flags.private || d.flags.scene)
    && (note.document.global || !canvas.visibility?.tokenVision) ) note.visible = true;

  // Label
  const mode = d.style.label;
  if ( note.tooltip.text !== d.label ) note.tooltip.text = d.label;
  note.tooltip.visible = (mode === "never") ? false : ((mode === "always") ? true : hovered);

  // Background: the dark box and the frame go, the frame stays on hover
  const noBox = d.style.noBackground;
  if ( icon.bg ) icon.bg.visible = !noBox;
  if ( isV14() && icon.border ) icon.border.visible = !noBox || hovered || !!note.controlled;

  // Symbol of the category, when the pin has no image of its own
  setSource(note, st, d.ownSource ?? (note.document.texture?.src || DEFAULT_NOTE_ICON));

  // Category ring and number badge
  const size = note.document.iconSize;
  drawRing(note, st, d.category?.color ?? null, size);
  drawBadge(note, st, d.number, d.category?.color ?? null, size);

  // Size on screen and hiding when far away
  st.constant = d.style.constantSize;
  st.percent = d.style.constantScale;
  st.minZoom = d.style.minZoom;
  applyZoomState(note, st, zoomOf());
}

/* -------------------------------------------- */
/*  Symbol                                      */
/* -------------------------------------------- */

/**
 * Show another image in the control icon, or the note's own again.
 * @param {Note} note
 * @param {object} st
 * @param {string} wanted   The image path to show
 */
function setSource(note, st, wanted) {
  const icon = note.controlIcon;
  if ( isV14() ) {
    if ( icon.texture !== wanted ) icon.texture = wanted;
    return;
  }
  if ( icon.iconSrc === wanted ) return;
  // Foundry 13: the icon draws once, asynchronously, from its constructor; swap the sprite's texture by hand. The
  // constructor's own load can finish after ours and put the first image back, so the swap is checked again later.
  icon.iconSrc = wanted;
  st.src = wanted;
  const apply = texture => {
    if ( !texture || (st.src !== wanted) || icon.destroyed || note.destroyed ) return;
    icon.texture = texture;
    icon.icon.texture = texture;
    icon.icon.width = icon.icon.height = icon.size;
  };
  (foundry.canvas.loadTexture ?? globalThis.loadTexture)(wanted).then(texture => {
    apply(texture);
    for ( const delay of [150, 600, 2000] ) setTimeout(() => {
      if ( texture && !icon.destroyed && (icon.icon?.texture !== texture) ) apply(texture);
    }, delay);
  }).catch(() => {});
}

/* -------------------------------------------- */
/*  Ring and badge                              */
/* -------------------------------------------- */

/**
 * The color number of a "#rrggbb" string.
 * @param {string} hex
 * @returns {number}
 */
function colorNumber(hex) {
  return Number.parseInt(String(hex).slice(1), 16) || 0;
}

/**
 * Draw the ring around the icon in the category color, or remove it.
 * @param {Note} note
 * @param {object} st
 * @param {string|null} color
 * @param {number} size
 */
function drawRing(note, st, color, size) {
  const key = color ? `${color}|${size}` : "";
  if ( key === st.ringKey ) return;
  st.ringKey = key;
  if ( !key ) {
    st.ring?.destroy();
    st.ring = null;
    return;
  }
  if ( !st.ring || st.ring.destroyed ) {
    st.ring = new PIXI.Graphics();
    st.ring.eventMode = "none";
    note.addChildAt(st.ring, 0);
  }
  const half = size / 2;
  st.ring.clear();
  st.ring.lineStyle({width: 5, color: colorNumber(color), alpha: 1});
  st.ring.drawRoundedRect(-half - 3, -half - 3, size + 6, size + 6, 8);
}

/**
 * Draw the number badge at the icon's top right corner, or remove it.
 * @param {Note} note
 * @param {object} st
 * @param {string} number
 * @param {string|null} color
 * @param {number} size
 */
function drawBadge(note, st, number, color, size) {
  const key = number ? `${number}|${color ?? ""}|${size}` : "";
  if ( key === st.badgeKey ) return;
  st.badgeKey = key;
  if ( !key ) {
    st.badge?.destroy({children: true});
    st.badge = null;
    return;
  }
  st.badge?.destroy({children: true});
  const fontSize = Math.round(Math.min(Math.max(size * 0.42, 14), 40));
  const style = CONFIG.canvasTextStyle.clone();
  style.fontSize = fontSize;
  style.fontWeight = "bold";
  style.fill = 0xFFFFFF;
  style.stroke = 0x000000;
  style.strokeThickness = 0;
  style.dropShadow = false;
  const text = new foundry.canvas.containers.PreciseText(number, style);
  text.anchor.set(0.5, 0.5);
  const width = Math.max(text.width + fontSize * 0.7, fontSize * 1.5);
  const height = fontSize * 1.5;
  const back = new PIXI.Graphics();
  back.beginFill(color ? colorNumber(color) : 0x9c3b22, 1);
  back.lineStyle({width: 2, color: 0xFFFFFF, alpha: 0.95});
  back.drawRoundedRect(-width / 2, -height / 2, width, height, height / 2);
  back.endFill();
  const badge = new PIXI.Container();
  badge.eventMode = "none";
  badge.addChild(back, text);
  badge.position.set(size / 2 - width / 4, -size / 2 + height / 4);
  note.addChild(badge);
  st.badge = badge;
}

/* -------------------------------------------- */
/*  Zoom                                        */
/* -------------------------------------------- */

/**
 * The zoom of the canvas.
 * @returns {number}
 */
function zoomOf() {
  return canvas.stage?.scale?.x ?? 1;
}

/**
 * Scale a note to keep its size on screen, and hide it below its minimum zoom.
 * @param {Note} note
 * @param {object} st
 * @param {number} zoom
 */
function applyZoomState(note, st, zoom) {
  const scale = st.constant ? constantScale(zoom, st.percent) : 1;
  if ( note.scale.x !== scale ) note.scale.set(scale);
  const hide = hiddenByZoom(zoom, st.minZoom);
  if ( hide !== st.zoomHidden ) {
    st.zoomHidden = hide;
    note.renderable = !hide;
    note.interactiveChildren = !hide;
  }
}

let panFrame = 0;

/**
 * Update the size of every pin after the canvas zoomed or moved. Several events in one frame count once.
 */
export function scheduleZoomUpdate() {
  if ( panFrame ) return;
  panFrame = requestAnimationFrame(() => {
    panFrame = 0;
    updateZoom();
  });
}

/**
 * Update the size of every pin now.
 * @returns {number} The number of pins looked at
 */
export function updateZoom() {
  const notes = canvas.notes?.placeables;
  if ( !notes?.length ) return 0;
  const zoom = zoomOf();
  for ( const note of notes ) {
    const st = states.get(note);
    if ( st ) applyZoomState(note, st, zoom);
  }
  return notes.length;
}

/**
 * Style all pins again, for example after a setting changed.
 */
export function restyleAll() {
  const notes = canvas.notes?.placeables;
  if ( !notes?.length ) return;
  for ( const note of notes ) {
    if ( !note.controlIcon ) continue;
    note.renderFlags?.set({refreshState: true, refreshVisibility: true, refreshTooltip: true});
    applyStyle(note);
  }
}

/* -------------------------------------------- */
/*  Double click without a journal              */
/* -------------------------------------------- */

/** The function that opens a pin without a journal (a linked scene, a private pin), set by the entry file. */
let openHandler = null;

/**
 * Set the function that runs on a double click of a pin that has no journal.
 * @param {(note: Note) => void} handler
 */
export function onOpenWithoutJournal(handler) {
  openHandler = handler;
}

/**
 * Foundry's double click only works for notes with a journal. A pin without one (a linked scene, a private pin)
 * gets its own double click here, from two quick clicks on its icon. The listener sits on the stage in the capture
 * phase: Foundry clears the listeners of the icons and on Foundry 13 the icon stops the event, and the note itself
 * does not take events.
 */
export function bindStage() {
  const stage = canvas.stage;
  stage.off("pointerdowncapture", onStageDown);
  stage.on("pointerdowncapture", onStageDown);
}

/** The last click on a pin without journal: {id, time}. */
let lastClick = {id: null, time: 0};

/**
 * Count two quick clicks on the same pin without journal as a double click.
 * @param {FederatedPointerEvent} event
 */
function onStageDown(event) {
  if ( (event.button !== 0) || !openHandler ) return;
  const icon = event.target;
  const note = icon?.parent;
  if ( !note?.document || (note.document.documentName !== "Note") || (note.controlIcon !== icon) ) return;
  if ( note.document.entryId ) return;
  const flags = flagsOf(note.document);
  if ( !flags.scene && !flags.private ) return;
  const now = performance.now();
  if ( (lastClick.id === note.id) && ((now - lastClick.time) < 450) ) {
    lastClick = {id: null, time: 0};
    openHandler(note);
  } else lastClick = {id: note.id, time: now};
}
