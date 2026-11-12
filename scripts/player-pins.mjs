/**
 * Pins players set. Foundry gives players no notes by default, so the request goes over the module socket to the
 * active GM, who writes the pin. A public pin is a normal note with its own journal entry (players Observer, the
 * author Owner). A private pin is a note without a journal: its name and text stay on the author's device, the note
 * only carries the position and the author. Every client receives all notes of a scene, so other clients can see
 * that a private pin exists and where it is, but the UI hides it and its text never leaves the author's browser.
 */

import {MODULE_ID, PLAYER_ICON, SOCKET, esc, flagsOf, isV14, setting, t} from "./config.mjs";
import {cleanPlayerPin, htmlToText, mayEditPin, textToHtml} from "./pin-logic.mjs";
import {privatePins, savePrivatePin} from "./state.mjs";
import {countFeature} from "./usage.mjs";

const {DialogV2} = foundry.applications.api;
const LEVELS = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;

/** Requests that wait for the GM's answer, by id. */
const pending = new Map();

/** The requests the GM works through one after the other. */
let queue = Promise.resolve();

/* -------------------------------------------- */
/*  Socket                                      */
/* -------------------------------------------- */

/**
 * Install the socket listener. Call once in "ready".
 */
export function registerSocket() {
  game.socket.on(SOCKET, (message, senderId) => {
    if ( !message || (typeof message !== "object") ) return;
    if ( message.type === "result" ) {
      if ( (message.to !== game.user.id) || !game.users.get(senderId)?.isGM ) return;
      pending.get(message.id)?.(message);
      return;
    }
    if ( !["create", "update", "delete"].includes(message.type) ) return;
    if ( !game.user.isGM || !game.users.activeGM?.isSelf ) return;
    const sender = game.users.get(senderId);
    if ( !sender ) return;
    queue = queue.then(() => handleRequest(message, sender)).catch(err => {
      console.error(`${MODULE_ID} | A pin request failed`, err);
    });
  });
}

/**
 * Send a request to the active GM and wait for the answer.
 * @param {string} type
 * @param {object} payload
 * @returns {Promise<{ok: boolean, reason?: string, noteId?: string}>}
 */
function request(type, payload) {
  const gm = game.users.activeGM;
  if ( !gm ) return Promise.resolve({ok: false, reason: "noGM"});
  const id = foundry.utils.randomID();
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      resolve({ok: false, reason: "timeout"});
    }, 180000);
    pending.set(id, message => {
      clearTimeout(timeout);
      pending.delete(id);
      resolve(message);
    });
    game.socket.emit(SOCKET, {type, id, ...payload}, {recipients: [gm.id]});
  });
}

/**
 * Tell the user what happened to a request.
 * @param {{ok: boolean, reason?: string}} result
 * @param {string} okKey
 */
function report(result, okKey) {
  if ( result.ok ) ui.notifications.info(t(okKey));
  else ui.notifications.warn(t(`SMP.Player.fail.${result.reason ?? "unknown"}`));
}

/* -------------------------------------------- */
/*  What a player can do                        */
/* -------------------------------------------- */

/**
 * Can this user ask for pins?
 * @returns {boolean}
 */
export function playerPinsAvailable() {
  return !game.user.isGM && (setting("playerPins") !== "off");
}

/**
 * Let the player click a spot on the map, then ask for the pin's details and send the request.
 */
export async function startPlayerPin() {
  if ( !playerPinsAvailable() ) return;
  if ( !canvas.ready || !canvas.scene ) return;
  if ( !game.users.activeGM ) return ui.notifications.warn(t("SMP.Player.fail.noGM"));
  const point = await pickPoint();
  if ( !point ) return;
  const data = await askDetails({title: t("SMP.Player.newTitle"), ok: t("SMP.Player.send")});
  if ( !data ) return;
  countFeature(MODULE_ID, "playerPinRequested");
  const result = await request("create", {
    sceneId: canvas.scene.id,
    level: isV14() ? (canvas.level?.id ?? null) : null,
    x: point.x, y: point.y,
    ...data
  });
  if ( result.ok && data.private && result.noteId ) await savePrivatePin(result.noteId, {name: data.name, text: data.text});
  report(result, "SMP.Player.created");
}

/**
 * Wait for a click on the map. Escape cancels.
 * @returns {Promise<{x: number, y: number}|null>}
 */
function pickPoint() {
  return new Promise(resolve => {
    const view = canvas.app.view;
    const before = view.style.cursor;
    view.style.cursor = "crosshair";
    ui.notifications.info(t("SMP.Player.pick"));
    const finish = point => {
      view.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      view.style.cursor = before;
      resolve(point);
    };
    const onDown = event => {
      if ( event.button !== 0 ) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      let point = canvas.canvasCoordinatesFromClient({x: event.clientX, y: event.clientY});
      if ( !canvas.dimensions.rect.contains(point.x, point.y) ) return finish(null);
      if ( !event.shiftKey ) point = canvas.grid.getCenterPoint(point);
      finish({x: Math.round(point.x), y: Math.round(point.y)});
    };
    const onKey = event => {
      if ( event.key !== "Escape" ) return;
      event.stopPropagation();
      finish(null);
    };
    view.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
  });
}

/**
 * Ask for name, text, color and who sees the pin.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.ok
 * @param {{name: string, text: string, color: string, private: boolean}} [options.values]
 * @param {boolean} [options.fixedVisibility=false]   An existing pin keeps its visibility
 * @returns {Promise<{name: string, text: string, color: string, private: boolean}|null>}
 */
async function askDetails({title, ok, values = {}, fixedVisibility = false}) {
  const allowPrivate = setting("playerPinsPrivate");
  const content = `<div class="smp-app smp-dialog" data-smp-theme="${esc(setting("theme"))}">
    <div class="form-group"><label>${esc(t("SMP.Player.name"))}</label>
      <div class="form-fields"><input type="text" name="name" maxlength="60" value="${esc(values.name ?? "")}" required autofocus></div></div>
    <div class="form-group stacked"><label>${esc(t("SMP.Player.text"))}</label>
      <div class="form-fields"><textarea name="text" rows="4" maxlength="1000">${esc(values.text ?? "")}</textarea></div></div>
    <div class="form-group"><label>${esc(t("SMP.Player.color"))}</label>
      <div class="form-fields"><input type="color" name="color" value="${esc(values.color ?? "#c0392b")}"></div></div>
    ${(allowPrivate || values.private) ? `<div class="form-group"><label>${esc(t("SMP.Player.visibility"))}</label>
      <div class="form-fields"><select name="visibility" ${fixedVisibility ? "disabled" : ""}>
        <option value="all" ${values.private ? "" : "selected"}>${esc(t("SMP.Player.visibleAll"))}</option>
        <option value="me" ${values.private ? "selected" : ""}>${esc(t("SMP.Player.visibleMe"))}</option></select></div>
      <p class="hint">${esc(t("SMP.Player.visibilityHint"))}</p></div>` : ""}
  </div>`;
  const result = await DialogV2.prompt({
    window: {title, icon: "fa-solid fa-map-pin"},
    position: {width: 520},
    classes: ["smp-dialog-window"],
    content,
    rejectClose: false,
    ok: {
      label: ok,
      icon: "fa-solid fa-check",
      callback: (event, button) => {
        const fd = new foundry.applications.ux.FormDataExtended(button.form).object;
        return {name: fd.name, text: fd.text, color: fd.color, private: fd.visibility === "me"};
      }
    }
  });
  if ( !result ) return null;
  const clean = cleanPlayerPin({...result, private: fixedVisibility ? values.private : result.private});
  if ( !clean ) {
    ui.notifications.warn(t("SMP.Player.needName"));
    return null;
  }
  return clean;
}

/**
 * Edit a pin of this user.
 * @param {Note} note
 */
export async function editPlayerPin(target) {
  const doc = target.document ?? target;
  const note = doc.object;
  const flags = flagsOf(doc);
  if ( !mayEditPin(flags, game.user.id, game.user.isGM) ) return;
  const isPrivate = !!flags.private;
  const local = privatePins()[doc.id];
  const values = isPrivate
    ? {name: local?.name ?? "", text: local?.text ?? "", color: doc.texture?.tint?.toString?.() ?? "#c0392b", private: true}
    : {name: doc.text || doc.entry?.name || "", text: htmlToText(doc.entry?.pages.contents[0]?.text?.content ?? ""),
      color: doc.texture?.tint?.toString?.() ?? "#c0392b", private: false};
  const data = await askDetails({title: t("SMP.Player.editTitle"), ok: t("SMP.Player.save"), values, fixedVisibility: true});
  if ( !data ) return;
  if ( isPrivate ) await savePrivatePin(doc.id, {name: data.name, text: data.text});
  const result = await request("update", {sceneId: doc.parent.id, noteId: doc.id, ...data});
  if ( isPrivate ) note?.renderFlags?.set({refreshState: true, refreshTooltip: true});
  report(result, "SMP.Player.saved");
}

/**
 * Delete a pin of this user after a question.
 * @param {Note} note
 */
export async function deletePlayerPin(target) {
  const doc = target.document ?? target;
  const flags = flagsOf(doc);
  if ( !mayEditPin(flags, game.user.id, game.user.isGM) ) return;
  const sure = await DialogV2.confirm({
    window: {title: t("SMP.Player.deleteTitle"), icon: "fa-solid fa-trash"},
    position: {width: 420},
    content: `<p>${esc(t("SMP.Player.deleteText", {name: doc.label}))}</p>`,
    rejectClose: false
  });
  if ( !sure ) return;
  const result = await request("delete", {sceneId: doc.parent.id, noteId: doc.id});
  if ( result.ok && flags.private ) await savePrivatePin(doc.id, null);
  report(result, "SMP.Player.deleted");
}

/**
 * Show a private pin to its author: the text kept on this device, with a button to change it.
 * @param {Note} note
 */
export async function showPrivatePin(target) {
  const doc = target.document ?? target;
  const flags = flagsOf(doc);
  if ( !flags.private ) return;
  if ( flags.owner !== game.user.id ) return;
  const local = privatePins()[doc.id];
  const content = local
    ? `<div class="smp-app smp-dialog" data-smp-theme="${esc(setting("theme"))}"><h3>${esc(local.name)}</h3>${textToHtml(local.text)}</div>`
    : `<p>${esc(t("SMP.Player.otherDevice"))}</p>`;
  const edit = await DialogV2.wait({
    window: {title: local?.name || t("SMP.Player.unknownPrivate"), icon: "fa-solid fa-lock"},
    position: {width: 520},
    content,
    rejectClose: false,
    buttons: [
      {action: "edit", label: t("SMP.Player.edit"), icon: "fa-solid fa-pen", callback: () => true},
      {action: "close", label: t("SMP.Player.close"), icon: "fa-solid fa-xmark", default: true, callback: () => false}
    ]
  });
  if ( edit ) await editPlayerPin(doc);
}

/* -------------------------------------------- */
/*  What the GM does                            */
/* -------------------------------------------- */

/**
 * Answer a request.
 * @param {object} message
 * @param {User} sender
 * @param {{ok: boolean, reason?: string, noteId?: string}} result
 */
function reply(message, sender, result) {
  game.socket.emit(SOCKET, {type: "result", id: message.id, to: sender.id, ...result}, {recipients: [sender.id]});
}

/**
 * Work on one request on the active GM's client.
 * @param {object} message
 * @param {User} sender
 */
async function handleRequest(message, sender) {
  const mode = setting("playerPins");
  if ( (mode === "off") && !sender.isGM ) return reply(message, sender, {ok: false, reason: "off"});
  const scene = game.scenes.get(String(message.sceneId ?? ""));
  if ( !scene ) return reply(message, sender, {ok: false, reason: "scene"});
  try {
    if ( message.type === "create" ) return await createPin(message, sender, scene, mode);
    const note = scene.notes.get(String(message.noteId ?? ""));
    if ( !note ) return reply(message, sender, {ok: false, reason: "gone"});
    if ( !mayEditPin(flagsOf(note), sender.id, sender.isGM) || !flagsOf(note).owner ) {
      return reply(message, sender, {ok: false, reason: "rights"});
    }
    if ( message.type === "update" ) return await updatePin(message, sender, note);
    if ( message.type === "delete" ) return await deletePin(message, sender, note);
  } catch(err) {
    console.error(`${MODULE_ID} | The pin request failed`, err);
    reply(message, sender, {ok: false, reason: "error"});
  }
}

/**
 * The folder for the journal entries of players' pins.
 * @returns {Promise<Folder>}
 */
async function pinFolder() {
  const found = game.folders.find(f => (f.type === "JournalEntry") && f.flags?.[MODULE_ID]?.playerPins);
  if ( found ) return found;
  return Folder.create({name: t("SMP.Player.folder"), type: "JournalEntry", flags: {[MODULE_ID]: {playerPins: true}}});
}

/**
 * Create the pin of a request, after the GM agreed when the mode asks for it.
 * @param {object} message
 * @param {User} sender
 * @param {Scene} scene
 * @param {string} mode
 */
async function createPin(message, sender, scene, mode) {
  const clean = cleanPlayerPin(message);
  if ( !clean ) return reply(message, sender, {ok: false, reason: "invalid"});
  if ( clean.private && !setting("playerPinsPrivate") ) clean.private = false;
  const limit = Math.max(Number(setting("playerPinLimit")) || 0, 0);
  const own = scene.notes.filter(n => flagsOf(n).owner === sender.id).length;
  if ( limit && (own >= limit) ) return reply(message, sender, {ok: false, reason: "limit"});
  const rect = scene.dimensions?.rect;
  const x = Math.round(Number(message.x));
  const y = Math.round(Number(message.y));
  if ( !Number.isFinite(x) || !Number.isFinite(y) || (rect && ((x < rect.x) || (y < rect.y)
    || (x > rect.x + rect.width) || (y > rect.y + rect.height))) ) {
    return reply(message, sender, {ok: false, reason: "invalid"});
  }
  if ( mode === "confirm" ) {
    const ok = await DialogV2.confirm({
      window: {title: t("SMP.Player.confirmTitle"), icon: "fa-solid fa-map-pin"},
      position: {width: 520},
      content: `<div class="smp-app smp-dialog" data-smp-theme="${esc(setting("theme"))}">
        <p>${esc(t("SMP.Player.confirmText", {user: sender.name, scene: scene.name}))}</p>
        <h3>${esc(clean.name)}</h3>${textToHtml(clean.text)}
        <p><em>${esc(t(clean.private ? "SMP.Player.visibleMe" : "SMP.Player.visibleAll"))}</em></p></div>`,
      yes: {label: t("SMP.Player.accept"), icon: "fa-solid fa-check"},
      no: {label: t("SMP.Player.decline"), icon: "fa-solid fa-xmark"},
      rejectClose: false
    });
    if ( !ok ) return reply(message, sender, {ok: false, reason: "declined"});
  }
  const data = {
    x, y,
    texture: {src: PLAYER_ICON, tint: clean.color},
    global: true,
    text: "",
    flags: {[MODULE_ID]: {owner: sender.id, ...(clean.private ? {private: true} : {player: true})}}
  };
  if ( isV14() && message.level && scene.levels?.has?.(message.level) ) data.levels = [message.level];
  if ( !clean.private ) {
    const folder = await pinFolder();
    const entry = await JournalEntry.create({
      name: clean.name,
      folder: folder.id,
      ownership: {default: LEVELS().OBSERVER, [sender.id]: LEVELS().OWNER},
      pages: [{name: clean.name, type: "text", text: {content: textToHtml(clean.text), format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML}}],
      flags: {[MODULE_ID]: {owner: sender.id, player: true}}
    });
    data.entryId = entry.id;
    data.text = clean.name;
  }
  const [note] = await scene.createEmbeddedDocuments("Note", [data]);
  countFeature(MODULE_ID, "playerPinCreated");
  reply(message, sender, {ok: true, noteId: note.id});
}

/**
 * Change a pin of a player: name, text and color. Its visibility stays.
 * @param {object} message
 * @param {User} sender
 * @param {NoteDocument} note
 */
async function updatePin(message, sender, note) {
  const clean = cleanPlayerPin({...message, private: !!flagsOf(note).private});
  if ( !clean ) return reply(message, sender, {ok: false, reason: "invalid"});
  const update = {_id: note.id, texture: {tint: clean.color}};
  if ( !flagsOf(note).private ) {
    update.text = clean.name;
    const entry = note.entry;
    if ( entry && entry.flags?.[MODULE_ID]?.player ) {
      await entry.update({name: clean.name});
      const page = entry.pages.contents[0];
      if ( page ) await page.update({name: clean.name, "text.content": textToHtml(clean.text)});
    }
  }
  await note.parent.updateEmbeddedDocuments("Note", [update]);
  reply(message, sender, {ok: true, noteId: note.id});
}

/**
 * Delete a pin of a player with its journal entry.
 * @param {object} message
 * @param {User} sender
 * @param {NoteDocument} note
 */
async function deletePin(message, sender, note) {
  const entry = note.entry;
  const mine = entry?.flags?.[MODULE_ID]?.player === true;
  await note.parent.deleteEmbeddedDocuments("Note", [note.id]);
  if ( entry && mine ) await entry.delete();
  reply(message, sender, {ok: true});
}
