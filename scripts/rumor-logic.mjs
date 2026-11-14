/**
 * Pure logic of "Rumors bit by bit", without Foundry globals. A pin's journal is told part by part. The parts are the
 * pages of the journal (revealed through the ownership of each page, so Foundry itself keeps the rest from players)
 * or, for a pin that points at one page, the secret sections of that page (revealed with Foundry's own "revealed"
 * class). This file holds what can be tested alone: the parts, the ownership that results from a reveal, what a
 * player has already seen, and the text of the preview per part.
 */

import {previewFromHtml, previewFromMarkdown, safeImageSrc} from "./pin-logic.mjs";

/** The ownership levels of Foundry (CONST.DOCUMENT_OWNERSHIP_LEVELS). */
export const LEVELS = {INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3};

/** The ways a pin can tell its journal in parts. */
export const RUMOR_MODES = ["pages", "secrets"];

/** The most parts one preview card shows, the newest ones. */
export const MAX_PART_CARDS = 6;

/** The most keys a player's record of one pin keeps. */
const MAX_KEYS = 200;

/** The most pins a player's record keeps. */
const MAX_PINS = 300;

/* -------------------------------------------- */
/*  Which parts                                 */
/* -------------------------------------------- */

/**
 * A rumor mode from a flag value.
 * @param {*} value
 * @returns {"pages"|"secrets"|""}
 */
export function cleanRumorMode(value) {
  return RUMOR_MODES.includes(value) ? value : "";
}

/**
 * How a pin's journal is told in parts: page by page when the pin points at the whole journal and the journal has
 * several pages, else by the secret sections of the one page.
 * @param {{hasPage: boolean, pageCount: number}} journal   hasPage: the pin points at one page
 * @returns {"pages"|"secrets"}
 */
export function rumorModeFor({hasPage, pageCount}) {
  return (!hasPage && (pageCount >= 2)) ? "pages" : "secrets";
}

/**
 * The attributes of an opening tag as a class list.
 * @param {string} tag   For example `<section class="secret revealed" id="x">`
 * @returns {string[]}
 */
function classesOf(tag) {
  const match = tag.match(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return (match?.[1] ?? match?.[2] ?? "").split(/\s+/).filter(Boolean);
}

/**
 * The tag with another class list.
 * @param {string} tag
 * @param {string[]} classes
 * @returns {string}
 */
function withClasses(tag, classes) {
  const value = classes.join(" ");
  if ( /\sclass\s*=\s*(?:"[^"]*"|'[^']*')/i.test(tag) ) {
    return tag.replace(/(\sclass\s*=\s*)(?:"[^"]*"|'[^']*')/i, (all, head) => `${head}"${value}"`);
  }
  return tag.replace(/^<section/i, `<section class="${value}"`);
}

/**
 * The secret sections (Foundry's "secret blocks") of a page's HTML, in order. Sections inside a secret are part of it.
 * @param {string} html
 * @returns {{index: number, id: string, key: string, revealed: boolean, inner: string, start: number, end: number}[]}
 *   start and end are the positions of the opening tag and the end of the closing tag
 */
export function secretSections(html) {
  const source = String(html ?? "");
  const found = [];
  const tags = /<(\/?)section\b[^>]*>/gi;
  let depth = 0;
  let open = null;
  let match;
  while ( (match = tags.exec(source)) ) {
    const closing = match[1] === "/";
    if ( !closing ) {
      if ( open ) {
        depth++;
        continue;
      }
      if ( classesOf(match[0]).includes("secret") ) {
        open = {start: match.index, tagEnd: match.index + match[0].length, tag: match[0]};
        depth = 0;
      }
      continue;
    }
    if ( !open ) continue;
    if ( depth > 0 ) {
      depth--;
      continue;
    }
    const classes = classesOf(open.tag);
    const id = open.tag.match(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const index = found.length;
    found.push({index, id: id?.[1] ?? id?.[2] ?? "", key: (id?.[1] ?? id?.[2]) || `#${index}`,
      revealed: classes.includes("revealed"), inner: source.slice(open.tagEnd, match.index), start: open.start,
      end: match.index + match[0].length});
    open = null;
  }
  return found;
}

/**
 * The HTML with some secret sections revealed or hidden, in Foundry's way (the class "revealed").
 * @param {string} html
 * @param {Map<number, boolean>|Record<number, boolean>} changes   Secret index to the new state
 * @returns {string}
 */
export function setSecrets(html, changes) {
  const source = String(html ?? "");
  const map = (changes instanceof Map) ? changes : new Map(Object.entries(changes).map(([k, v]) => [Number(k), v]));
  let result = "";
  let at = 0;
  for ( const section of secretSections(source) ) {
    if ( !map.has(section.index) ) continue;
    const tagEnd = source.indexOf(">", section.start) + 1;
    const tag = source.slice(section.start, tagEnd);
    const classes = classesOf(tag).filter(c => c !== "revealed");
    if ( map.get(section.index) ) classes.push("revealed");
    result += source.slice(at, section.start) + withClasses(tag, classes);
    at = tagEnd;
  }
  return result + source.slice(at);
}

/**
 * The HTML with every secret section hidden or revealed.
 * @param {string} html
 * @param {boolean} revealed
 * @returns {string}
 */
export function setAllSecrets(html, revealed) {
  return setSecrets(html, new Map(secretSections(html).map(s => [s.index, !!revealed])));
}

/* -------------------------------------------- */
/*  Ownership                                   */
/* -------------------------------------------- */

/**
 * The ownership level a user has, as Foundry works it out: the user's own entry, else the default, and an inherited
 * default is the parent's.
 * @param {object} ownership         The document's ownership
 * @param {string} userId
 * @param {object} [parent]          The parent's ownership
 * @returns {number}
 */
export function levelFor(ownership, userId, parent = null) {
  const own = ownership?.[userId];
  if ( Number.isInteger(own) && (own !== LEVELS.INHERIT) ) return own;
  let level = ownership?.default ?? LEVELS.INHERIT;
  if ( level === LEVELS.INHERIT ) level = parent ? levelFor(parent, userId) : LEVELS.NONE;
  return level;
}

/**
 * Can everybody read a page? Its default level (or the journal's, when it inherits) is Observer or more.
 * @param {object} pageOwnership
 * @param {object} entryOwnership
 * @returns {boolean}
 */
export function readableByAll(pageOwnership, entryOwnership) {
  const own = pageOwnership?.default ?? LEVELS.INHERIT;
  const level = (own === LEVELS.INHERIT) ? (entryOwnership?.default ?? LEVELS.NONE) : own;
  return level >= LEVELS.OBSERVER;
}

/**
 * The ownership of a page after the GM says who may read it. Everybody: the default becomes Observer. Chosen players:
 * the default drops to None (also when it inherited Observer from the journal) and the chosen players get Observer.
 * Players who are not chosen lose a plain Observer entry. Entries of the GM and higher levels stay.
 * @param {object} ownership
 * @param {object} choice
 * @param {boolean} choice.everyone
 * @param {string[]} [choice.users]       The players who may read it
 * @param {string[]} choice.playerIds     All players of the world
 * @returns {object}
 */
export function ownershipAfter(ownership, {everyone, users = [], playerIds}) {
  const next = {...(ownership ?? {})};
  const chosen = new Set(users);
  if ( everyone ) {
    if ( !(next.default >= LEVELS.OBSERVER) ) next.default = LEVELS.OBSERVER;
    for ( const id of playerIds ) if ( id in next && next[id] < LEVELS.OBSERVER ) delete next[id];
    return next;
  }
  next.default = LEVELS.NONE;
  for ( const id of playerIds ) {
    if ( chosen.has(id) ) {
      if ( !(next[id] >= LEVELS.OBSERVER) ) next[id] = LEVELS.OBSERVER;
    } else if ( next[id] === LEVELS.OBSERVER ) delete next[id];
  }
  return next;
}

/**
 * The ownership of the journal after some players got a part: it must be readable for them, or Foundry does not
 * open it. Returns null when nothing has to change.
 * @param {object} ownership
 * @param {object} choice
 * @param {boolean} choice.everyone
 * @param {string[]} [choice.users]
 * @returns {object|null}
 */
export function entryOwnershipAfter(ownership, {everyone, users = []}) {
  const next = {...(ownership ?? {})};
  let changed = false;
  if ( everyone ) {
    if ( !(next.default >= LEVELS.OBSERVER) ) {
      next.default = LEVELS.OBSERVER;
      changed = true;
    }
    return changed ? next : null;
  }
  for ( const id of users ) {
    if ( levelFor(next, id) < LEVELS.OBSERVER ) {
      next[id] = LEVELS.OBSERVER;
      changed = true;
    }
  }
  return changed ? next : null;
}

/**
 * The update data that turns one ownership into another: changed entries and "-=key" for removed ones, so a
 * normal merging update reaches the new ownership. Returns null when they are the same.
 * @param {object} before
 * @param {object} after
 * @returns {object|null}
 */
export function ownershipChange(before, after) {
  const change = {};
  for ( const [key, value] of Object.entries(after ?? {}) ) if ( before?.[key] !== value ) change[key] = value;
  for ( const key of Object.keys(before ?? {}) ) if ( (key !== "default") && !(key in (after ?? {})) ) change[`-=${key}`] = null;
  return Object.keys(change).length ? change : null;
}

/* -------------------------------------------- */
/*  Parts and what is revealed                  */
/* -------------------------------------------- */

/**
 * Where the next reveal goes: the first part that not everybody can read yet.
 * @param {{all: boolean}[]} parts
 * @returns {number}   The index, or -1 when every part is revealed
 */
export function nextHidden(parts) {
  return (parts ?? []).findIndex(part => !part.all);
}

/**
 * Count the parts.
 * @param {{all: boolean, users: string[]}[]} parts
 * @returns {{total: number, all: number, some: number, none: number}}
 */
export function summarize(parts) {
  const list = parts ?? [];
  const all = list.filter(p => p.all).length;
  const some = list.filter(p => !p.all && p.users?.length).length;
  return {total: list.length, all, some, none: list.length - all - some};
}

/**
 * What the reveal dialog wants for each part, from the ticked boxes.
 * @param {Record<string, {everyone?: boolean, users?: string[]}>} desired   Part key to the choice
 * @param {{key: string, all: boolean, users: string[]}[]} parts   What is revealed now
 * @param {string[]} playerIds
 * @returns {Record<string, {everyone: boolean, users: string[]}>}   Only the parts that change
 */
export function planParts(desired, parts, playerIds) {
  const plan = {};
  for ( const part of parts ) {
    const want = desired?.[part.key];
    if ( !want ) continue;
    const users = playerIds.filter(id => want.users?.includes(id));
    const everyone = !!want.everyone || (playerIds.length > 0 && (users.length === playerIds.length));
    const before = new Set(part.users ?? []);
    const same = (everyone === !!part.all) && (everyone || ((users.length === before.size) && users.every(u => before.has(u))));
    if ( !same ) plan[part.key] = {everyone, users: everyone ? [...playerIds] : users};
  }
  return plan;
}

/* -------------------------------------------- */
/*  What a player has seen                      */
/* -------------------------------------------- */

/**
 * A record of what a player knows of one pin's parts: the parts that were announced and the parts the player has seen.
 * @param {object} [record]
 * @returns {{known: string[], seen: string[]}}
 */
export function cleanRecord(record) {
  const list = value => [...new Set((Array.isArray(value) ? value : []).filter(k => (typeof k === "string") && k))]
    .slice(-MAX_KEYS);
  return {known: list(record?.known), seen: list(record?.seen)};
}

/**
 * The parts a player can read that were not announced yet.
 * @param {string[]} readable
 * @param {object} [record]
 * @returns {string[]}
 */
export function unannounced(readable, record) {
  const known = new Set(cleanRecord(record).known);
  return (readable ?? []).filter(key => !known.has(key));
}

/**
 * The parts a player can read but has not seen yet.
 * @param {string[]} readable
 * @param {object} [record]
 * @returns {string[]}
 */
export function unseen(readable, record) {
  const seen = new Set(cleanRecord(record).seen);
  return (readable ?? []).filter(key => !seen.has(key));
}

/**
 * The record after parts were announced or seen. A seen part counts as announced.
 * @param {object} [record]
 * @param {{known?: string[], seen?: string[]}} add
 * @returns {{known: string[], seen: string[]}}
 */
export function markRecord(record, {known = [], seen = []}) {
  const base = cleanRecord(record);
  return cleanRecord({known: [...base.known, ...known, ...seen], seen: [...base.seen, ...seen]});
}

/**
 * The store of all records, trimmed to the newest pins.
 * @param {object} store   Pin id to record
 * @returns {object}
 */
export function trimStore(store) {
  const entries = Object.entries(store ?? {});
  return Object.fromEntries(entries.slice(-MAX_PINS));
}

/* -------------------------------------------- */
/*  The preview                                 */
/* -------------------------------------------- */

/**
 * The text of each part for the preview card. Players get only the parts that are revealed, the GM gets all of them
 * and sees which are still hidden. Of many parts the newest few are shown.
 * @param {object[]} items
 * @param {string} items[].key
 * @param {string} items[].name
 * @param {boolean} items[].revealed
 * @param {"html"|"markdown"|"image"|"other"} items[].kind
 * @param {string} [items[].text]       The page's HTML or Markdown
 * @param {string} [items[].src]        The picture of an image page
 * @param {object} options
 * @param {boolean} options.isGM
 * @param {number} options.maxChars     Per part
 * @param {string[]} [options.seen]     Parts the player has seen
 * @param {number} [options.max]        The most parts shown
 * @returns {{parts: {key: string, name: string, blocks: {kind: string, text: string}[], hidden: boolean,
 *   isNew: boolean}[], image: string, more: number, keys: string[]}}
 *   keys: the parts a player can read now
 */
export function previewParts(items, {isGM, maxChars, seen = [], max = MAX_PART_CARDS}) {
  const seenSet = new Set(seen);
  const shown = (items ?? []).filter(item => isGM || item.revealed);
  const keys = (items ?? []).filter(item => item.revealed).map(item => item.key);
  const cut = shown.slice(-max);
  let image = "";
  const parts = cut.map(item => {
    let blocks = [];
    // A hidden part is never read, not even for the GM's card
    if ( item.revealed ) {
      if ( item.kind === "html" ) {
        const found = previewFromHtml(item.text, {maxChars});
        blocks = found.blocks;
        image ||= found.image;
      } else if ( item.kind === "markdown" ) {
        const found = previewFromMarkdown(item.text, {maxChars});
        blocks = found.blocks;
        image ||= found.image;
      } else if ( item.kind === "image" ) image ||= safeImageSrc(item.src);
    }
    return {key: item.key, name: String(item.name ?? ""), blocks, hidden: !item.revealed,
      isNew: !isGM && item.revealed && !seenSet.has(item.key)};
  });
  return {parts, image, more: shown.length - cut.length, keys};
}
