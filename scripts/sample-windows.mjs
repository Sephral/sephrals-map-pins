// Sample windows (api.samples, contract in samples.mjs): the windows, cards, menus and questions of the module filled
// with made-up pins, so translators and testers see every text in its place without a prepared map. Nothing here
// writes: the windows read plain objects in memory (sample-data.mjs), no note, journal, drawing or setting is made or
// changed, the canvas stays as it is, and every button that would change something only says that it does nothing.
import {MODULE_ID, TEMPLATES, esc, t} from "./config.mjs";
import {PinListApp} from "./list-app.mjs";
import {CategoriesApp} from "./categories-app.mjs";
import {RouteApp} from "./route.mjs";
import {WhereApp} from "./where-app.mjs";
import {buildCard} from "./preview.mjs";
import {buildMenu} from "./pin-menu.mjs";
import {revealContent} from "./discover.mjs";
import {partsContent, wireParts} from "./rumors.mjs";
import {keyContent} from "./map-key.mjs";
import {numberContent} from "./numbering.mjs";
import {newAreaContent, fieldData} from "./areas.mjs";
import {migrateContent} from "./migrate.mjs";
import {confirmContent, detailsContent, privateContent} from "./player-pins.mjs";
import {noteSectionData} from "./note-config.mjs";
import {ICON_KEYS, cardData, listData, menuData, partsData, playerPinData, revealData, routeData, sampleCategories,
  samplePicture, whereData} from "./sample-data.mjs";
import {markSample, openSampleDialog, openSampleHtml, sampleActions, sampleBlocked, sampleId, sampleText} from "./samples.mjs";

/** The picture of a note icon of Foundry, with a fallback. */
function icon(key) {
  return CONFIG.JournalEntry?.noteIcons?.[key] ?? "icons/svg/book.svg";
}

/** The name of the sample scene: the same place as in every module's samples. */
function place() {
  return sampleText("place");
}

/** Clicks on rows and the pace choice of a sample window do nothing but say so. */
function blockRows(app, {rows = false, change = false} = {}) {
  if ( app.sampleBound ) return;
  app.sampleBound = true;
  if ( rows ) {
    for ( const type of ["click", "dblclick", "keydown"] ) {
      app.element.addEventListener(type, event => {
        const target = event.target.closest?.(".smp-pin");
        if ( !target || event.target.closest("button") ) return;
        if ( (type === "keydown") && !["Enter", " "].includes(event.key) ) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        sampleBlocked();
      }, true);
    }
  }
  if ( change ) {
    app.element.addEventListener("change", event => {
      if ( event.target.name !== "pace" ) return;
      event.stopImmediatePropagation();
      sampleBlocked();
    }, true);
  }
}

/* -------------------------------------------- */
/*  The windows                                 */
/* -------------------------------------------- */

/** The pin list over made-up pins. kind: "gm", "player", "empty" or "nomatch" (a search without a hit). */
class SamplePinList extends PinListApp {
  constructor(kind) {
    super({id: sampleId(MODULE_ID, `list-${kind}`), actions: sampleActions(PinListApp, [])});
    this.kind = kind;
    markSample(this);
  }

  async _prepareContext(options) {
    const base = await super._prepareContext(options);
    const data = listData({gm: this.kind !== "player", empty: this.kind === "empty", t, icon});
    // A search that finds nothing: the hint stands alone, without the heading of the areas
    if ( this.kind === "nomatch" ) data.areas = [];
    return {...base, ...data, isGM: this.kind !== "player", canRoute: true, canAddRoute: true, canPlace: this.kind === "player",
      showWhere: true, scene: place(), search: (this.kind === "nomatch") ? "zzz" : ""};
  }

  _onRender(context, options) {
    super._onRender(context, options);
    blockRows(this, {rows: true});
    // The search runs like a typed one: a text that finds nothing shows the hint
    if ( this.kind === "nomatch" ) this.element.querySelector("input[name=search]")?.dispatchEvent(new Event("input"));
  }
}

/** The categories window with three made-up categories, or none. */
class SampleCategories extends CategoriesApp {
  constructor(empty) {
    super({id: sampleId(MODULE_ID, empty ? "categories-empty" : "categories"), actions: sampleActions(CategoriesApp, [])});
    this.sampleEmpty = empty;
    markSample(this);
  }

  async _prepareContext(options) {
    const base = await super._prepareContext(options);
    const rows = this.sampleEmpty ? [] : sampleCategories(t, icon).map((row, index) => ({...row, index}));
    return {...base, rows, empty: !rows.length};
  }
}

/** The route window with made-up stops. kind: "gm", "player" or "empty". */
class SampleRoute extends RouteApp {
  constructor(kind) {
    super({id: sampleId(MODULE_ID, `route-${kind}`), actions: sampleActions(RouteApp, [])});
    this.kind = kind;
    markSample(this);
  }

  async _prepareContext(options) {
    const base = await super._prepareContext(options);
    const data = routeData(this.kind, t);
    const paces = ["slow", "normal", "fast"].map(key => ({key, selected: key === data.pace, label: t(`SMP.SETTINGS.pace.${key}`)}));
    return {...base, blocks: data.blocks, empty: data.empty, picking: false, isGM: this.kind !== "player", pace: data.pace, paces,
      speedText: t("SMP.Route.speed", {speed: 3, units: data.units}),
      text: {...base.text, pick: t("SMP.Route.pick"), empty: t(this.kind === "player" ? "SMP.Route.emptyView" : "SMP.Route.emptyBuild")}};
  }

  _onRender(context, options) {
    super._onRender(context, options);
    blockRows(this, {change: true});
  }

  // The real window leaves the picking mode of the canvas on closing, a sample has none
  async _onClose(options) {
    return foundry.applications.api.ApplicationV2.prototype._onClose.call(this, options);
  }
}

/** The quick look at the map above, over two made-up maps. kind: "gm", "player" or "empty". */
class SampleWhere extends WhereApp {
  constructor(kind) {
    super({id: sampleId(MODULE_ID, `where-${kind}`), actions: sampleActions(WhereApp, ["zoomIn", "zoomOut", "center"])});
    this.kind = kind;
    markSample(this);
  }

  async _prepareContext() {
    const gm = this.kind !== "player";
    const data = whereData({gm, index: this.index, empty: this.kind === "empty", t, place: place()});
    const text = Object.fromEntries(["title", "mapAbove", "openMap", "auto", "clearTrail", "trailTitle", "trailEmpty", "zoomIn",
      "zoomOut", "center", "noPicture", "empty", "sourceHint"].map(key => [key, t(`SMP.Where.${key}`)]));
    text.setHere = t("SMP.Where.setHere", {scene: place()});
    const context = {isGM: data.isGM, empty: data.empty, status: data.status, source: data.source, manual: data.manual,
      viewed: data.viewed, maps: data.maps, several: data.several, trail: data.trail, trailOn: data.trailOn, text};
    if ( data.empty ) {
      this.current = null;
      return context;
    }
    this.current = {scene: {id: "sample"}, doc: {x: data.focusX, y: data.focusY},
      dims: {sceneX: 0, sceneY: 0, sceneWidth: data.width, sceneHeight: data.height}};
    return {...context, mapName: data.mapName, src: samplePicture(data.kind), textures: "null", width: data.width,
      height: data.height, pins: data.pins, canOpen: data.canOpen, focusX: data.focusX, focusY: data.focusY};
  }
}

/* -------------------------------------------- */
/*  Cards, menus, settings sections             */
/* -------------------------------------------- */

/** A preview card as the hover shows it, in a window (the real card sits at the pin). */
function openCard(id, title, kind) {
  return openSampleHtml({moduleId: MODULE_ID, id, title, width: 340, body: () => {
    const card = buildCard(cardData(kind, t));
    card.removeAttribute("id");
    card.style.position = "static";
    card.style.margin = "0 auto";
    return card;
  }});
}

/** The pin menu as the right click shows it, in a window. */
function openMenuSample(id, title, kind) {
  return openSampleHtml({moduleId: MODULE_ID, id, title, width: 300, body: () => {
    const entries = menuData(kind, t).map(entry => ({...entry, run: () => sampleBlocked()}));
    const menu = buildMenu(t(`SMP.Sample.Pin.${(kind === "player") ? "inn" : "mill"}`), entries);
    menu.style.position = "static";
    menu.style.margin = "0 auto";
    return menu;
  }});
}

/** Options of a select with one of them marked. */
function choicesOf(list, current) {
  return list.map(([value, label]) => ({value, label, selected: String(current ?? "") === value}));
}

/** The "Map Pins" section of the note dialog, filled for a made-up hidden pin that tells a rumor bit by bit. */
function openNoteConfig(id, title) {
  return openSampleHtml({moduleId: MODULE_ID, id, title, width: 520, body: async () => {
    const flags = {hidden: true, found: ["sample-lena", "sample-tom"], category: "sample-quest", quest: "open", number: "2",
      previewText: t("SMP.Sample.Text.mill1"), label: "always"};
    const doc = {flags: {[MODULE_ID]: flags}, _source: {texture: {src: icon(ICON_KEYS.mill)}}, collection: {has: () => true},
      id: "sample-mill", parent: null, entry: null};
    const data = noteSectionData(doc);
    data.rumorOffer = true;
    data.rumorState = t("SMP.Config.rumorsState", {all: 2, total: 3});
    data.choices.category = choicesOf([["", t("SMP.Config.noCategory")], ...sampleCategories(t, icon).map(c => [c.id, c.name])],
      flags.category);
    data.choices.scene = choicesOf([["", t("SMP.Config.noScene")], ["valley", t("SMP.Sample.Scene.valley")],
      ["town", t("SMP.Sample.Scene.town")]], "");
    const wrapper = document.createElement("div");
    wrapper.className = "standard-form";
    wrapper.innerHTML = await foundry.applications.handlebars.renderTemplate(`${TEMPLATES}/note-section.hbs`, data);
    return wrapper;
  }});
}

/** The "Map Pins" section of the drawing dialog, filled for a made-up hidden area. */
function openAreaConfig(id, title) {
  return openSampleHtml({moduleId: MODULE_ID, id, title, width: 520, body: async () => {
    const flags = {area: true, hidden: true, found: ["sample-lena"], category: "sample-danger",
      previewText: t("SMP.Sample.Text.mill2")};
    const data = fieldData(flags);
    data.values = {area: true, previewText: flags.previewText, hidden: true};
    data.existing = true;
    data.foundText = t("SMP.Config.foundBy", {count: 1});
    data.choices.category = choicesOf([["", t("SMP.Config.noCategory")], ...sampleCategories(t, icon).map(c => [c.id, c.name])],
      flags.category);
    data.choices.entry = choicesOf([["", t("SMP.Area.noJournal")], ["journal", place()]], "journal");
    const wrapper = document.createElement("div");
    wrapper.className = "standard-form";
    wrapper.innerHTML = await foundry.applications.handlebars.renderTemplate(`${TEMPLATES}/area-section.hbs`, data);
    return wrapper;
  }});
}

/* -------------------------------------------- */
/*  The list of entries                         */
/* -------------------------------------------- */

/**
 * The sample windows of the module (api.samples).
 * @returns {{id: string, label: string, group: string, open: () => Promise<object>}[]}
 */
export function sampleWindows() {
  const label = key => t(`SMP.Sample.Label.${key}`);
  const groups = {windows: t("SMP.Sample.Group.windows"), cards: t("SMP.Sample.Group.cards"),
    questions: t("SMP.Sample.Group.questions"), config: t("SMP.Sample.Group.config")};
  const entries = [];
  const add = (group, id, text, open) => entries.push({id, group: groups[group], label: label(text), open});
  const windowEntry = (id, text, make) => add("windows", id, text, async () => {
    const app = make();
    await foundry.applications.instances.get(app.id)?.close({animate: false});
    await app.render({force: true});
    return app;
  });
  windowEntry("list-gm", "list", () => new SamplePinList("gm"));
  windowEntry("list-player", "listPlayer", () => new SamplePinList("player"));
  windowEntry("list-empty", "listEmpty", () => new SamplePinList("empty"));
  windowEntry("list-nomatch", "listNoMatch", () => new SamplePinList("nomatch"));
  windowEntry("categories", "categories", () => new SampleCategories(false));
  windowEntry("categories-empty", "categoriesEmpty", () => new SampleCategories(true));
  windowEntry("route-gm", "route", () => new SampleRoute("gm"));
  windowEntry("route-player", "routePlayer", () => new SampleRoute("player"));
  windowEntry("route-empty", "routeEmpty", () => new SampleRoute("empty"));
  windowEntry("where-gm", "where", () => new SampleWhere("gm"));
  windowEntry("where-player", "wherePlayer", () => new SampleWhere("player"));
  windowEntry("where-empty", "whereEmpty", () => new SampleWhere("empty"));

  add("cards", "card-journal", "cardJournal", () => openCard("card-journal", label("cardJournal"), "journal"));
  add("cards", "card-rumor", "cardRumor", () => openCard("card-rumor", label("cardRumor"), "rumor"));
  add("cards", "menu-hidden", "menuHidden", () => openMenuSample("menu-hidden", label("menuHidden"), "hidden"));
  add("cards", "menu-rumor", "menuRumor", () => openMenuSample("menu-rumor", label("menuRumor"), "rumor"));
  add("cards", "menu-start", "menuStart", () => openMenuSample("menu-start", label("menuStart"), "start"));
  add("cards", "menu-player", "menuPlayer", () => openMenuSample("menu-player", label("menuPlayer"), "player"));

  const yes = [{label: game.i18n.localize("Yes"), icon: "fa-solid fa-check", default: true},
    {label: game.i18n.localize("No"), icon: "fa-solid fa-xmark"}];
  const ok = (text, iconName = "fa-solid fa-check") => [{label: text, icon: iconName, default: true}];
  const cancel = {label: t("SMP.Reveal.cancel"), icon: "fa-solid fa-xmark"};
  const question = (id, text, title, options) => add("questions", id, text, () => openSampleDialog({moduleId: MODULE_ID, id,
    title, ...options}));
  const pins = playerPinData(t);
  question("reveal", "reveal", t("SMP.Reveal.title"), {width: 480, content: () => revealContent(revealData(t)), buttons: [
    {label: t("SMP.Reveal.all"), icon: "fa-solid fa-users", default: true},
    {label: t("SMP.Reveal.chosen"), icon: "fa-solid fa-user-check"},
    {label: t("SMP.Reveal.reset"), icon: "fa-solid fa-eye-slash"}, cancel]});
  const rumorButtons = [{label: t("SMP.Rumor.apply"), icon: "fa-solid fa-check", default: true},
    {label: t("SMP.Rumor.next"), icon: "fa-solid fa-forward-step"}, {label: t("SMP.Rumor.stop"), icon: "fa-solid fa-ban"}, cancel];
  question("rumor-pages", "rumorPages", t("SMP.Rumor.title"), {width: 620, content: () => partsContent(partsData("pages", t)),
    render: (event, dialog) => wireParts(dialog.element), buttons: rumorButtons});
  question("rumor-secrets", "rumorSecrets", t("SMP.Rumor.title"), {width: 460, content: () => partsContent(partsData("secrets", t)),
    render: (event, dialog) => wireParts(dialog.element), buttons: rumorButtons});
  question("rumor-start", "rumorStart", t("SMP.Rumor.startTitle"), {content: () => `<p>${esc(t("SMP.Rumor.startPages",
    {name: t("SMP.Sample.Pin.mill")}))}</p>`, buttons: yes});
  question("key", "key", t("SMP.Key.title"), {width: 460, content: () => keyContent({scene: place(), count: 5, exists: false,
    current: "lines"}), buttons: ok(t("SMP.Key.create"))});
  question("key-update", "keyUpdate", t("SMP.Key.title"), {width: 460, content: () => keyContent({scene: place(), count: 5,
    exists: true, current: "lines"}), buttons: ok(t("SMP.Key.update"))});
  question("numbers", "numbers", t("SMP.Numbers.title"), {width: 520, content: () => numberContent({scene: place(), count: 7}),
    buttons: ok(t("SMP.Numbers.go"))});
  question("area-new", "newArea", t("SMP.Area.newTitle"), {width: 460, content: () => {
    const data = fieldData({});
    data.choices.category = choicesOf([["", t("SMP.Config.noCategory")], ...sampleCategories(t, icon).map(c => [c.id, c.name])], "");
    data.choices.entry = choicesOf([["", t("SMP.Area.noJournal")], ["journal", place()]], "");
    return newAreaContent(data, false);
  }, buttons: [{label: t("SMP.Area.polygon"), icon: "fa-solid fa-draw-polygon", default: true},
    {label: t("SMP.Area.rect"), icon: "fa-regular fa-square"}, {label: t("SMP.Area.ellipse"), icon: "fa-regular fa-circle"}, cancel]});
  question("migrate", "migrate", t("SMP.Migrate.title"), {width: 520, content: () => migrateContent({scene: place(), here: 12,
    all: 48, scenes: 4}), buttons: ok(t("SMP.Migrate.go"))});
  question("player-new", "playerNew", t("SMP.Player.newTitle"), {width: 520, content: () => detailsContent({values: {},
    allowPrivate: true}), buttons: ok(t("SMP.Player.send"))});
  question("player-edit", "playerEdit", t("SMP.Player.editTitle"), {width: 520, content: () => detailsContent({values: pins.values,
    fixedVisibility: true, allowPrivate: true}), buttons: ok(t("SMP.Player.save"))});
  question("player-confirm", "playerConfirm", t("SMP.Player.confirmTitle"), {width: 520, content: () => confirmContent({user: "Jo",
    scene: place(), pin: pins.pin}), buttons: [{label: t("SMP.Player.accept"), icon: "fa-solid fa-check", default: true},
    {label: t("SMP.Player.decline"), icon: "fa-solid fa-xmark"}]});
  question("player-delete", "playerDelete", t("SMP.Player.deleteTitle"), {width: 420, content: () => `<p>${esc(t("SMP.Player.deleteText",
    {name: pins.pin.name}))}</p>`, buttons: yes});
  const closeButtons = [{label: t("SMP.Player.edit"), icon: "fa-solid fa-pen"},
    {label: t("SMP.Player.close"), icon: "fa-solid fa-xmark", default: true}];
  question("player-private", "playerPrivate", pins.secret.name, {width: 520, content: () => privateContent(pins.secret),
    buttons: closeButtons});
  question("player-other-device", "playerOtherDevice", t("SMP.Player.unknownPrivate"), {width: 520,
    content: () => privateContent(null), buttons: closeButtons});
  question("remove-pin", "removePin", t("SMP.List.removeTitle"), {content: () => `<p>${esc(t("SMP.List.removeText",
    {name: t("SMP.Sample.Pin.camp")}))}</p>`, buttons: yes});
  question("remove-area", "removeArea", t("SMP.Area.removeTitle"), {content: () => `<p>${esc(t("SMP.Area.removeText",
    {name: t("SMP.Sample.Area.wood")}))}</p>`, buttons: yes});
  question("clear-trail", "clearTrail", t("SMP.Where.clearTitle"), {content: () => `<p>${esc(t("SMP.Where.clearText"))}</p>`,
    buttons: yes});

  add("config", "note-config", "noteConfig", () => openNoteConfig("note-config", label("noteConfig")));
  add("config", "area-config", "areaConfig", () => openAreaConfig("area-config", label("areaConfig")));
  return entries;
}
