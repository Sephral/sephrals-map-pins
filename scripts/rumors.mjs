/**
 * Rumors bit by bit: the GM tells the journal of a pin part by part. The parts are Foundry's own: the pages of the
 * journal (a page the players may not observe is not in their journal window) or, for a pin that points at one page,
 * the secret sections of that page (Foundry's "revealed" class). The module only changes ownership and that class, so
 * the journal keeps its state when the module is switched off. The preview card and the pin list read the same state.
 * A player sees a small "new" mark on parts they have not seen and a notice when a part comes in.
 */

import {MODULE_ID, addSettingsGear, applyRemovals, esc, flagsOf, setting, t} from "./config.mjs";
import {LEVELS, cleanRecord, cleanRumorMode, entryOwnershipAfter, markRecord, nextHidden, ownershipAfter,
  ownershipChange, planParts, previewParts, readableByAll, rumorModeFor, secretSections, setAllSecrets, setSecrets,
  summarize, trimStore, unannounced, unseen} from "./rumor-logic.mjs";
import {describePin, refreshPin} from "./note-style.mjs";
import {pinVisible} from "./visibility.mjs";
import {countFeature} from "./usage.mjs";

/* -------------------------------------------- */
/*  The parts of a pin                          */
/* -------------------------------------------- */

/**
 * The players of the world: users who are not a GM and may play (a user without a role cannot read anything).
 * @returns {User[]}
 */
function players() {
  return game.users.filter(user => !user.isGM && (user.role >= CONST.USER_ROLES.PLAYER));
}

/**
 * Can this user read a page: the journal and the page are Observer or more for the user.
 * @param {JournalEntry} entry
 * @param {JournalEntryPage} page
 * @param {User} user
 * @returns {boolean}
 */
function canRead(entry, page, user) {
  return !!user.isGM || (entry.testUserPermission(user, "OBSERVER") && page.testUserPermission(user, "OBSERVER"));
}

/**
 * The page whose secret sections tell a pin: the page it points at, or the only page of its journal. Only a text
 * page in HTML has secret sections.
 * @param {NoteDocument} doc
 * @returns {JournalEntryPage|null}
 */
function secretPageOf(doc) {
  const entry = doc.entry;
  if ( !entry ) return null;
  const page = doc.page ?? ((entry.pages.size === 1) ? entry.pages.contents[0] : null);
  if ( !page || (page.type !== "text") || (page.text?.format !== CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML) ) return null;
  return page;
}

/**
 * The pages of a journal in reading order.
 * @param {JournalEntry} entry
 * @returns {JournalEntryPage[]}
 */
function pagesOf(entry) {
  return entry.pages.contents.sort((a, b) => a.sort - b.sort);
}

/**
 * How a pin could be told in parts: by pages or by secret sections, or "" when its journal has nothing to divide.
 * @param {NoteDocument} doc
 * @returns {"pages"|"secrets"|""}
 */
export function possibleMode(doc) {
  const entry = doc.entry;
  if ( !entry ) return "";
  const mode = rumorModeFor({hasPage: !!doc.page, pageCount: entry.pages.size});
  if ( mode === "pages" ) return "pages";
  const page = secretPageOf(doc);
  return (page && secretSections(page.text.content).length) ? "secrets" : "";
}

/**
 * The parts of a pin that is told bit by bit, with who can read each now. Null for any other pin.
 * @param {NoteDocument} doc
 * @returns {{mode: string, parts: {key: string, name: string, all: boolean, users: string[], page: JournalEntryPage,
 *   index: number}[]}|null}
 */
export function partsOf(doc) {
  const mode = cleanRumorMode(flagsOf(doc).rumors);
  const entry = doc.entry;
  if ( !mode || !entry ) return null;
  const who = players();
  if ( mode === "pages" ) {
    return {mode, parts: pagesOf(entry).map((page, index) => ({key: page.id, name: page.name, page, index,
      all: readableByAll(page.ownership, entry.ownership), users: who.filter(u => canRead(entry, page, u)).map(u => u.id)}))};
  }
  const page = secretPageOf(doc);
  if ( !page ) return {mode, parts: []};
  return {mode, parts: secretSections(page.text.content).map(section => ({key: section.key,
    name: t("SMP.Rumor.part", {n: section.index + 1}), page, index: section.index,
    all: section.revealed && readableByAll(page.ownership, entry.ownership),
    users: section.revealed ? who.filter(u => canRead(entry, page, u)).map(u => u.id) : []}))};
}

/**
 * What the GM's list shows for a pin: how many parts are told.
 * @param {NoteDocument} doc
 * @returns {{mode: string, total: number, all: number, some: number, none: number}|null}
 */
export function rumorSummary(doc) {
  const found = partsOf(doc);
  return found ? {mode: found.mode, ...summarize(found.parts)} : null;
}

/* -------------------------------------------- */
/*  The preview                                 */
/* -------------------------------------------- */

/**
 * The preview of a pin that is told bit by bit for a user: each part with its text, only the parts the user may read
 * (the GM sees all, hidden ones marked). The rights come from Foundry's ownership.
 * @param {NoteDocument} doc
 * @param {User} user
 * @param {number} maxChars
 * @returns {{parts: object[], image: string, more: number, keys: string[]}|null}   Null for any other pin
 */
export function rumorPreview(doc, user, maxChars) {
  const mode = cleanRumorMode(flagsOf(doc).rumors);
  const entry = doc.entry;
  if ( !mode || !entry ) return null;
  const formats = CONST.JOURNAL_ENTRY_PAGE_FORMATS;
  let items = [];
  if ( mode === "pages" ) {
    items = pagesOf(entry).map(page => {
      const revealed = canRead(entry, page, user);
      const base = {key: page.id, name: page.name, revealed};
      // The text of a page the user may not read is not even handed on
      if ( !revealed ) return {...base, kind: "other"};
      if ( page.type === "text" ) {
        return (page.text?.format === formats.MARKDOWN) ? {...base, kind: "markdown", text: page.text?.markdown ?? ""}
          : {...base, kind: "html", text: page.text?.content ?? ""};
      }
      if ( page.type === "image" ) return {...base, kind: "image", src: page.src};
      return {...base, kind: "other"};
    });
  } else {
    const page = secretPageOf(doc);
    if ( page ) {
      const readable = canRead(entry, page, user);
      items = secretSections(page.text.content).map(section => ({key: section.key,
        name: t("SMP.Rumor.part", {n: section.index + 1}), revealed: section.revealed && readable,
        kind: (section.revealed && readable) ? "html" : "other", text: section.inner}));
    }
  }
  // The GM's card marks what is not told to anybody yet, and does not read it
  if ( user.isGM ) {
    const told = new Map((partsOf(doc)?.parts ?? []).map(p => [p.key, p.all || (p.users.length > 0)]));
    items = items.map(item => (told.get(item.key) ? item : {...item, revealed: false, kind: "other"}));
  }
  const record = user.isGM ? null : record_(doc.id);
  return previewParts(items, {isGM: !!user.isGM, maxChars, seen: record ? record.seen : []});
}

/**
 * The text blocks of the parts everybody may read, for texts that go to everybody (the map key).
 * @param {NoteDocument} doc
 * @param {number} maxChars
 * @returns {{kind: string, text: string}[]}
 */
export function publicBlocks(doc, maxChars) {
  const found = partsOf(doc);
  if ( !found ) return [];
  const open = new Set(found.parts.filter(p => p.all).map(p => p.key));
  const mode = found.mode;
  const entry = doc.entry;
  const items = (mode === "pages")
    ? pagesOf(entry).filter(page => open.has(page.id)).map(page => ({key: page.id, name: page.name, revealed: true,
      kind: (page.type === "text") ? ((page.text?.format === CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN) ? "markdown" : "html") : "other",
      text: (page.text?.format === CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN) ? (page.text?.markdown ?? "") : (page.text?.content ?? "")}))
    : (secretPageOf(doc) ? secretSections(secretPageOf(doc).text.content).filter(s => open.has(s.key))
      .map(s => ({key: s.key, name: "", revealed: true, kind: "html", text: s.inner})) : []);
  return previewParts(items, {isGM: true, maxChars, max: 100}).parts.flatMap(part => part.blocks);
}

/* -------------------------------------------- */
/*  What a player has seen                      */
/* -------------------------------------------- */

/**
 * The key of this user's records in the client setting.
 * @returns {string}
 */
function storeKey() {
  return `${game.world.id}:${game.user.id}`;
}

/**
 * What this user knows of a pin's parts.
 * @param {string} pinId
 * @returns {{known: string[], seen: string[]}}
 */
function record_(pinId) {
  return cleanRecord(setting("rumorSeen")?.[storeKey()]?.[pinId]);
}

/**
 * Store what this user knows of a pin's parts.
 * @param {string} pinId
 * @param {{known?: string[], seen?: string[]}} add
 * @returns {Promise<void>}
 */
async function remember(pinId, add) {
  const all = foundry.utils.deepClone(setting("rumorSeen") ?? {});
  const mine = all[storeKey()] ??= {};
  const next = markRecord(mine[pinId], add);
  const same = JSON.stringify(cleanRecord(mine[pinId])) === JSON.stringify(next);
  if ( same ) return;
  delete mine[pinId];
  mine[pinId] = next;
  all[storeKey()] = trimStore(mine);
  await game.settings.set(MODULE_ID, "rumorSeen", all);
}

/**
 * The parts of a pin this player has not seen yet.
 * @param {NoteDocument} doc
 * @returns {number}
 */
export function newCount(doc) {
  if ( game.user.isGM || !cleanRumorMode(flagsOf(doc).rumors) ) return 0;
  const found = partsOf(doc);
  if ( !found ) return 0;
  const readable = found.parts.filter(p => p.users.includes(game.user.id)).map(p => p.key);
  return unseen(readable, record_(doc.id)).length;
}

/**
 * The player has seen these parts (the card was shown, the journal was opened).
 * @param {string} pinId
 * @param {string[]} keys
 */
export function markSeen(pinId, keys) {
  if ( game.user.isGM || !pinId || !keys?.length ) return;
  remember(pinId, {seen: keys}).then(() => {
    const doc = findPin(pinId);
    if ( doc ) refreshPin(doc);
  }).catch(err => console.warn(`${MODULE_ID} | Could not store what was seen`, err));
}

/**
 * A pin of any scene by its id.
 * @param {string} id
 * @returns {NoteDocument|null}
 */
function findPin(id) {
  for ( const scene of game.scenes ) {
    const doc = scene.notes.get(id);
    if ( doc ) return doc;
  }
  return null;
}

/**
 * All pins of the world that are told bit by bit.
 * @returns {NoteDocument[]}
 */
function rumorPins() {
  const pins = [];
  for ( const scene of game.scenes ) {
    for ( const doc of scene.notes ) if ( cleanRumorMode(flagsOf(doc).rumors) && doc.entry ) pins.push(doc);
  }
  return pins;
}

/**
 * The player has opened a journal: everything of it that is told in parts counts as seen.
 * @param {JournalEntry} entry
 * @param {JournalEntryPage[]} [pages]
 */
export function onJournalOpened(entry) {
  if ( game.user.isGM || !entry ) return;
  for ( const doc of rumorPins() ) {
    if ( doc.entry?.id !== entry.id ) continue;
    const found = partsOf(doc);
    const keys = found?.parts.filter(p => p.users.includes(game.user.id)).map(p => p.key) ?? [];
    if ( keys.length ) markSeen(doc.id, keys);
  }
}

/* -------------------------------------------- */
/*  The notice                                  */
/* -------------------------------------------- */

let checkTimer = 0;

/** Look for new parts a moment later, so several changes in a row count once. */
export function scheduleRumorCheck() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => checkRumors(), 250);
}

/**
 * Tell the player about parts that came in since they last looked: a short notice and, for one pin on the viewed
 * scene, a ping. Parts that were taken back are forgotten, so they count as new when told again.
 * @returns {Promise<number>}   How many pins had something new
 */
export async function checkRumors() {
  if ( game.user.isGM || !game.ready ) return 0;
  const fresh = [];
  for ( const doc of rumorPins() ) {
    if ( !pinVisible(doc) ) continue;
    const found = partsOf(doc);
    if ( !found ) continue;
    const readable = found.parts.filter(p => p.users.includes(game.user.id)).map(p => p.key);
    const record = record_(doc.id);
    const added = unannounced(readable, record);
    const gone = record.known.filter(key => !readable.includes(key));
    if ( added.length ) fresh.push({doc, added});
    if ( added.length || gone.length ) {
      const all = foundry.utils.deepClone(setting("rumorSeen") ?? {});
      const mine = all[storeKey()] ??= {};
      mine[doc.id] = {known: [...record.known.filter(k => readable.includes(k)), ...added],
        seen: record.seen.filter(k => readable.includes(k))};
      all[storeKey()] = trimStore(mine);
      await game.settings.set(MODULE_ID, "rumorSeen", all);
    }
  }
  if ( !fresh.length ) return 0;
  if ( fresh.length === 1 ) {
    const {doc} = fresh[0];
    ui.notifications.info(t("SMP.Rumor.notice", {name: describePin({document: doc}).label}));
    if ( setting("discoverPing") && (canvas.scene?.id === doc.parent?.id) ) {
      try {
        canvas.ping({x: doc.x, y: doc.y});
      } catch(err) {
        console.debug(`${MODULE_ID} | Could not ping`, err);
      }
    }
  } else ui.notifications.info(t("SMP.Rumor.noticeMany", {count: fresh.length}));
  for ( const {doc} of fresh ) refreshPin(doc);
  return fresh.length;
}

/* -------------------------------------------- */
/*  What the GM does                            */
/* -------------------------------------------- */

/**
 * The update data for a document's ownership, replacing it as a whole the way Foundry's own ownership window does:
 * a ForcedReplacement on Foundry 14, the "==" key on Foundry 13. Merging would keep entries that should be gone.
 * @param {object} ownership
 * @returns {object}
 */
function ownershipData(ownership) {
  const replace = globalThis._replace ?? (foundry.data?.operators?.ForcedReplacement
    ? value => foundry.data.operators.ForcedReplacement.create(value) : null);
  return replace ? {ownership: replace(ownership)} : {"==ownership": ownership};
}

/**
 * Write the ownership of a document so that it becomes the wanted one.
 * @param {Document} doc
 * @param {object} before
 * @param {object} after
 * @returns {Promise<boolean>} Whether something was written
 */
async function writeOwnership(doc, before, after) {
  if ( !ownershipChange(before, after) ) return false;
  await doc.update(ownershipData(after));
  return true;
}

/**
 * Start telling a pin's journal bit by bit (GM): the pin gets the flag, every part is hidden from the players and the
 * journal opens for them, so they see the parts you reveal one by one. Asks first unless told not to.
 * @param {NoteDocument} doc
 * @param {object} [options]
 * @param {boolean} [options.confirm=true]
 * @returns {Promise<boolean>}
 */
export async function startRumors(doc, {confirm = true} = {}) {
  if ( !game.user.isGM || !doc?.entry ) return false;
  const mode = possibleMode(doc);
  if ( !mode ) {
    ui.notifications.warn(t("SMP.Rumor.nothing"));
    return false;
  }
  if ( cleanRumorMode(flagsOf(doc).rumors) ) return true;
  if ( confirm ) {
    const sure = await foundry.applications.api.DialogV2.confirm({
      window: {title: t("SMP.Rumor.startTitle"), icon: "fa-solid fa-comment-dots"},
      content: `<p>${esc(t(mode === "pages" ? "SMP.Rumor.startPages" : "SMP.Rumor.startSecrets",
        {name: describePin({document: doc}).label}))}</p>`,
      rejectClose: false
    });
    if ( !sure ) return false;
  }
  const entry = doc.entry;
  const playerIds = players().map(u => u.id);
  if ( mode === "pages" ) {
    const updates = [];
    for ( const page of pagesOf(entry) ) {
      const after = ownershipAfter(page.ownership, {everyone: false, users: [], playerIds});
      if ( ownershipChange(page.ownership, after) ) updates.push({_id: page.id, ...ownershipData(after)});
    }
    if ( updates.length ) await entry.updateEmbeddedDocuments("JournalEntryPage", updates);
  } else {
    const page = secretPageOf(doc);
    await page.update({"text.content": setAllSecrets(page.text.content, false)});
    const after = ownershipAfter(page.ownership, {everyone: true, playerIds});
    if ( (page.ownership?.default ?? LEVELS.INHERIT) !== LEVELS.INHERIT ) await writeOwnership(page, page.ownership, after);
  }
  // The journal must open for players, or Foundry does not show them what they may read
  const open = entryOwnershipAfter(entry.ownership, {everyone: true});
  if ( open ) await writeOwnership(entry, entry.ownership, open);
  await doc.update({flags: {[MODULE_ID]: {rumors: mode}}});
  countFeature(MODULE_ID, "rumorStarted");
  return true;
}

/**
 * Stop telling a pin bit by bit (GM). The journal keeps the state it has: revealed parts stay revealed.
 * @param {NoteDocument} doc
 */
export async function stopRumors(doc) {
  if ( !game.user.isGM || !cleanRumorMode(flagsOf(doc).rumors) ) return;
  await doc.update({flags: {[MODULE_ID]: applyRemovals({"-=rumors": null})}});
}

/**
 * Apply a reveal plan to a pin's parts (GM).
 * @param {NoteDocument} doc
 * @param {Record<string, {everyone: boolean, users: string[]}>} plan   Part key to who may read it
 * @returns {Promise<string[]>}   The names of the parts that were newly revealed for somebody
 */
export async function revealParts(doc, plan) {
  if ( !game.user.isGM ) return [];
  const found = partsOf(doc);
  if ( !found || !Object.keys(plan ?? {}).length ) return [];
  const entry = doc.entry;
  const playerIds = players().map(u => u.id);
  const names = [];
  const wants = {everyone: false, users: new Set()};
  if ( found.mode === "pages" ) {
    const updates = [];
    for ( const part of found.parts ) {
      const want = plan[part.key];
      if ( !want ) continue;
      const after = ownershipAfter(part.page.ownership, {everyone: want.everyone, users: want.users, playerIds});
      if ( ownershipChange(part.page.ownership, after) ) updates.push({_id: part.page.id, ...ownershipData(after)});
      if ( want.everyone ? !part.all : want.users.some(u => !part.users.includes(u)) ) names.push(part.name);
      wants.everyone ||= want.everyone;
      for ( const id of want.users ) wants.users.add(id);
    }
    if ( updates.length ) await entry.updateEmbeddedDocuments("JournalEntryPage", updates);
  } else {
    const page = found.parts[0]?.page;
    if ( !page ) return [];
    const map = new Map();
    for ( const part of found.parts ) {
      const want = plan[part.key];
      if ( !want ) continue;
      // Secret sections are revealed for everybody who reads the page, or not at all
      map.set(part.index, !!want.everyone);
      if ( want.everyone && !part.all ) names.push(part.name);
      wants.everyone ||= want.everyone;
    }
    if ( map.size ) await page.update({"text.content": setSecrets(page.text.content, map)});
  }
  if ( wants.everyone || wants.users.size ) {
    const open = entryOwnershipAfter(entry.ownership, {everyone: wants.everyone, users: [...wants.users]});
    if ( open ) await writeOwnership(entry, entry.ownership, open);
  }
  if ( names.length ) countFeature(MODULE_ID, "rumorRevealed");
  return names;
}

/**
 * Reveal the next part (GM): the first one that is not told to everybody yet, for everybody or for chosen players.
 * @param {NoteDocument} doc
 * @param {object} [options]
 * @param {string[]} [options.users]   Tell only these players
 * @param {boolean} [options.quiet]    No notification
 * @returns {Promise<string|null>}   The name of the part, or null when there was none left
 */
export async function revealNext(doc, {users = null, quiet = false} = {}) {
  if ( !game.user.isGM ) return null;
  const found = partsOf(doc);
  if ( !found ) return null;
  const name = describePin({document: doc}).label;
  let part;
  if ( users?.length ) part = found.parts.find(p => !p.all && users.some(u => !p.users.includes(u)));
  else part = found.parts[nextHidden(found.parts)];
  if ( !part ) {
    if ( !quiet ) ui.notifications.info(t("SMP.Rumor.allTold", {name}));
    return null;
  }
  const plan = {[part.key]: users?.length ? {everyone: false, users: [...new Set([...part.users, ...users])]}
    : {everyone: true, users: players().map(u => u.id)}};
  // A secret section cannot be told to chosen players only
  if ( found.mode === "secrets" ) plan[part.key] = {everyone: true, users: players().map(u => u.id)};
  await revealParts(doc, plan);
  if ( !quiet ) ui.notifications.info(t("SMP.Rumor.told", {part: part.name, name}));
  return part.name;
}

/**
 * The content of the question which parts whom may read.
 * @param {{name: string, pages: boolean, players: {id: string, name: string, color?: string}[],
 *   parts: {key: string, name: string, all: boolean, users: string[]}[]}} data
 * @returns {string}
 */
export function partsContent({name, pages, players: who, parts}) {
  const head = who.map(u => `<th class="smp-rumor-user" style="--smp-chip: ${esc(u.color ?? "#888")}">
    <span class="smp-dot"></span>${esc(u.name)}</th>`).join("");
  const rows = parts.map(part => `<tr data-key="${esc(part.key)}"><th scope="row">${esc(part.name)}</th>
    <td><input type="checkbox" name="everyone" aria-label="${esc(t("SMP.Rumor.everyone"))}" ${part.all ? "checked" : ""}></td>
    ${pages ? who.map(u => `<td><input type="checkbox" name="user" value="${esc(u.id)}" aria-label="${esc(u.name)}"
      ${part.users.includes(u.id) ? "checked" : ""}></td>`).join("") : ""}</tr>`).join("");
  return `<div class="smp-app smp-rumor" data-smp-theme="${esc(setting("theme"))}">
    <p class="smp-reveal-name-line">${esc(name)}</p>
    <p class="hint">${esc(t(pages ? "SMP.Rumor.hintPages" : "SMP.Rumor.hintSecrets"))}</p>
    <table class="smp-rumor-table"><thead><tr><th>${esc(t("SMP.Rumor.partHead"))}</th>
      <th>${esc(t("SMP.Rumor.everyone"))}</th>${pages ? head : ""}</tr></thead><tbody>${rows
    || `<tr><td colspan="9">${esc(t("SMP.Rumor.noParts"))}</td></tr>`}</tbody></table></div>`;
}

/**
 * Wire the ticks of the question: "everybody" ticks all players of a part, and all players tick "everybody".
 * @param {HTMLElement} element
 */
export function wireParts(element) {
  for ( const row of element.querySelectorAll("tr[data-key]") ) {
    const every = row.querySelector("[name=everyone]");
    const users = [...row.querySelectorAll("[name=user]")];
    every.addEventListener("change", () => users.forEach(box => (box.checked = every.checked)));
    for ( const box of users ) box.addEventListener("change", () => {
      every.checked = users.length > 0 && users.every(b => b.checked);
    });
  }
}

/**
 * Ask the GM which parts whom may read, then do it. Tick boxes per part and player, a button for the next part and one
 * to stop telling bit by bit.
 * @param {NoteDocument} doc
 * @returns {Promise<boolean>}
 */
export async function askParts(doc) {
  if ( !game.user.isGM || !doc?.entry ) return false;
  if ( !cleanRumorMode(flagsOf(doc).rumors) && !(await startRumors(doc)) ) return false;
  const found = partsOf(doc);
  if ( !found ) return false;
  const who = players();
  const playerIds = who.map(u => u.id);
  const pages = found.mode === "pages";
  const content = partsContent({name: describePin({document: doc}).label, pages,
    players: who.map(u => ({id: u.id, name: u.name, color: u.color?.css ?? u.color})), parts: found.parts});
  const read = button => {
    const desired = {};
    for ( const row of button.form.querySelectorAll("tr[data-key]") ) {
      desired[row.dataset.key] = {everyone: row.querySelector("[name=everyone]").checked,
        users: [...row.querySelectorAll("[name=user]:checked")].map(i => i.value)};
    }
    return desired;
  };
  const result = await foundry.applications.api.DialogV2.wait({
    window: {title: t("SMP.Rumor.title"), icon: "fa-solid fa-comment-dots"},
    position: {width: pages ? Math.min(380 + (who.length * 60), 760) : 460},
    content,
    rejectClose: false,
    render: (event, dialog) => {
      addSettingsGear(dialog.element);
      wireParts(dialog.element);
    },
    buttons: [
      {action: "apply", label: t("SMP.Rumor.apply"), icon: "fa-solid fa-check", default: true,
        callback: (event, button) => ({desired: read(button)})},
      {action: "next", label: t("SMP.Rumor.next"), icon: "fa-solid fa-forward-step", callback: () => ({next: true})},
      {action: "stop", label: t("SMP.Rumor.stop"), icon: "fa-solid fa-ban", callback: () => ({stop: true})},
      {action: "cancel", label: t("SMP.Reveal.cancel"), icon: "fa-solid fa-xmark", callback: () => null}
    ]
  });
  if ( !result ) return false;
  if ( result.stop ) {
    await stopRumors(doc);
    return true;
  }
  if ( result.next ) {
    await revealNext(doc);
    return true;
  }
  const plan = planParts(result.desired, found.parts, playerIds);
  const names = await revealParts(doc, plan);
  if ( names.length ) ui.notifications.info(t("SMP.Rumor.toldMany", {count: names.length, name: describePin({document: doc}).label}));
  return true;
}
