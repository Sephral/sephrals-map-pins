/**
 * The pin list: every pin of the viewed scene with search, category filter, number and name. A click pans the map to
 * the pin and pings it, a double click opens it. Players see only the pins they may see.
 */

import {DEFAULT_NOTE_ICON, MODULE_ID, TEMPLATES, addSettingsGear, esc, flagsOf, isShown, isV14, onOtherLevel, setting, t}
  from "./config.mjs";
import {hiddenPrivatePin, mayEditPin} from "./pin-logic.mjs";
import {describePin, restyleAll} from "./note-style.mjs";
import {categoryList, hiddenCategories, setCategoryHidden} from "./state.mjs";
import {editPlayerPin, deletePlayerPin, playerPinsAvailable, startPlayerPin} from "./player-pins.mjs";
import {noteOf, openPin} from "./open-pin.mjs";
import {openCategories} from "./categories-app.mjs";
import {numberDialog} from "./numbering.mjs";
import {countFeature, markUsed} from "./usage.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/**
 * Pan the map to a pin and ping it.
 * @param {Note|NoteDocument} target
 * @returns {Promise<void>}
 */
export async function focusPin(target) {
  const note = await noteOf(target);
  if ( !note || !canvas.ready ) return;
  const {x, y} = note.document;
  await canvas.animatePan({x, y, scale: Math.max(canvas.stage.scale.x, 0.5), duration: 300});
  try {
    canvas.ping({x, y});
  } catch(err) {
    console.debug(`${MODULE_ID} | Could not ping`, err);
  }
}

export class PinListApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "smp-list",
    classes: ["smp-app", "smp-list"],
    tag: "section",
    window: {title: "SMP.List.title", icon: "fa-solid fa-map-pin", resizable: true},
    position: {width: 420, height: 560},
    actions: {
      toggleCategory: PinListApp.#onToggleCategory,
      edit: PinListApp.#onEdit,
      remove: PinListApp.#onRemove,
      numbers: PinListApp.#onNumbers,
      categories: PinListApp.#onCategories,
      newPin: PinListApp.#onNewPin
    }
  };

  /** @override */
  static PARTS = {main: {template: `${TEMPLATES}/list.hbs`, scrollable: [".smp-pins"]}};

  /** The search text, kept across redraws. */
  #search = "";

  /** @override */
  get title() {
    return t("SMP.List.title");
  }

  /**
   * The pins this user may see on the viewed scene, with those on other levels (Foundry 14). The rights are the ones
   * of the map without the token vision that comes and goes.
   * @returns {NoteDocument[]}
   */
  #notes() {
    if ( !canvas.ready || !canvas.scene ) return [];
    return canvas.scene.notes.contents.filter(doc => {
      const flags = flagsOf(doc);
      if ( hiddenPrivatePin(flags, game.user.id, game.user.isGM) ) return false;
      if ( game.user.isGM || flags.private ) return true;
      const journal = doc.page ?? doc.entry;
      if ( journal ) return journal.testUserPermission(game.user, "LIMITED");
      // Without a journal Foundry 13 shows the pin to everybody, Foundry 14 only when a player wrote it
      // (the module shows pins that link to a scene as Foundry 13 does)
      if ( !isV14() || flags.scene ) return true;
      return (doc._source.author === null) || !(doc.author?.isGM ?? true);
    });
  }

  /** @override */
  async _prepareContext() {
    const hidden = hiddenCategories();
    const notes = this.#notes();
    const counts = new Map();
    const pins = notes.map(doc => {
      const d = describePin({document: doc});
      const cat = d.category;
      if ( cat ) counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
      const flags = d.flags;
      const mine = mayEditPin(flags, game.user.id, false) && !!flags.owner;
      const other = onOtherLevel(doc);
      return {
        id: doc.id,
        name: d.label,
        number: d.number,
        sortNumber: d.number,
        icon: d.ownSource ?? (doc.texture?.src || DEFAULT_NOTE_ICON),
        tint: doc.texture?.tint?.toString?.() ?? "",
        category: cat?.name ?? "",
        color: cat?.color ?? "",
        off: !!cat && hidden.has(cat.id),
        other,
        link: !!flags.scene,
        owner: flags.owner ? (game.users.get(flags.owner)?.name ?? "") : "",
        isPrivate: !!flags.private,
        canEdit: game.user.isGM ? true : mine,
        canDelete: game.user.isGM || mine,
        gmEdit: game.user.isGM,
        needle: `${d.number} ${d.label} ${cat?.name ?? ""}`.toLowerCase()
      };
    });
    // Numbered pins first, in number order, then the others by name
    pins.sort((a, b) => (!a.sortNumber - !b.sortNumber) || a.sortNumber.localeCompare(b.sortNumber, undefined, {numeric: true})
      || a.name.localeCompare(b.name, game.i18n.lang));
    return {
      pins,
      empty: !pins.length,
      search: this.#search,
      isGM: game.user.isGM,
      canPlace: playerPinsAvailable(),
      scene: canvas.scene?.name ?? "",
      categories: categoryList().map(c => ({...c, hidden: hidden.has(c.id), count: counts.get(c.id) ?? 0})),
      text: {
        search: t("SMP.List.search"),
        empty: t("SMP.List.empty"),
        numbers: t("SMP.List.numbers"),
        categories: t("SMP.List.categories"),
        newPin: t("SMP.List.newPin"),
        edit: t("SMP.List.edit"),
        remove: t("SMP.List.remove"),
        otherLevel: t("SMP.List.otherLevel"),
        link: t("SMP.List.link"),
        private: t("SMP.List.private"),
        noMatch: t("SMP.List.noMatch")
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
    const input = this.element.querySelector("input[name=search]");
    input?.addEventListener("input", () => {
      this.#search = input.value;
      this.#filter();
    });
    for ( const row of this.element.querySelectorAll(".smp-pin") ) {
      row.addEventListener("click", event => {
        if ( event.target.closest("button") ) return;
        focusPin(canvas.scene.notes.get(row.dataset.id));
      });
      row.addEventListener("dblclick", event => {
        if ( event.target.closest("button") ) return;
        openPin(canvas.scene.notes.get(row.dataset.id));
      });
      row.addEventListener("keydown", event => {
        if ( event.key === "Enter" ) openPin(canvas.scene.notes.get(row.dataset.id));
        else if ( event.key === " " ) {
          event.preventDefault();
          focusPin(canvas.scene.notes.get(row.dataset.id));
        }
      });
    }
    this.#filter();
  }

  /** Hide the pins that do not match the search. */
  #filter() {
    const needle = this.#search.trim().toLowerCase();
    let shown = 0;
    for ( const row of this.element.querySelectorAll(".smp-pin") ) {
      const match = !needle || row.dataset.search.includes(needle);
      row.hidden = !match;
      if ( match ) shown++;
    }
    const none = this.element.querySelector(".smp-nomatch");
    if ( none ) none.hidden = !!shown || !needle;
  }

  /* -------------------------------------------- */

  /**
   * The note document of a clicked row.
   * @param {HTMLElement} target
   * @returns {NoteDocument|undefined}
   */
  static #note(target) {
    return canvas.scene?.notes.get(target.closest("[data-id]")?.dataset.id);
  }

  static async #onToggleCategory(event, target) {
    const id = target.dataset.id;
    await setCategoryHidden(id, !hiddenCategories().has(id));
    restyleAll();
    refreshList();
  }

  static #onEdit(event, target) {
    const doc = PinListApp.#note(target);
    if ( !doc ) return;
    if ( game.user.isGM ) doc.sheet.render(true);
    else editPlayerPin(doc);
  }

  static async #onRemove(event, target) {
    const doc = PinListApp.#note(target);
    if ( !doc ) return;
    if ( game.user.isGM ) {
      const sure = await foundry.applications.api.DialogV2.confirm({
        window: {title: t("SMP.List.removeTitle"), icon: "fa-solid fa-trash"},
        content: `<p>${esc(t("SMP.List.removeText", {name: doc.label}))}</p>`,
        rejectClose: false
      });
      if ( sure ) await doc.delete();
    } else deletePlayerPin(doc);
  }

  static #onNumbers() {
    numberDialog();
  }

  static #onCategories() {
    openCategories();
  }

  static #onNewPin() {
    startPlayerPin();
  }
}

/**
 * Open the pin list.
 * @returns {Promise<PinListApp>}
 */
export async function openList() {
  const existing = foundry.applications.instances.get("smp-list");
  const app = existing ?? new PinListApp();
  await app.render({force: true});
  countFeature(MODULE_ID, "listOpened");
  markUsed(MODULE_ID);
  return app;
}

let redrawTimer = 0;

/**
 * Redraw the pin list when it is open. Several changes in a row count once.
 */
export function refreshList() {
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(() => {
    const app = foundry.applications.instances.get("smp-list");
    if ( isShown(app) ) app.render({window: {title: app.title}});
  }, 120);
}
