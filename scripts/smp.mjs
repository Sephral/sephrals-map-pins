import {MODULE_ID, TESTED_VERSIONS, setting} from "./config.mjs";
import {registerDebug} from "./debug.mjs";
import {saveDebugFile} from "./debug-file.mjs";
import {registerHubModule} from "./hub.mjs";
import {applyModuleLanguage} from "./language.mjs";
import {openCategories} from "./categories-app.mjs";
import {focusPin, openList, refreshList} from "./list-app.mjs";
import {migrateDialog, migratePinCushion} from "./migrate.mjs";
import {applyStyle, bindStage, describePin, onOpenWithoutJournal, restyleAll, scheduleZoomUpdate, updateZoom}
  from "./note-style.mjs";
import {cleanNewNote, cleanNoteChanges, onRenderNoteConfig} from "./note-config.mjs";
import {askReveal, checkDiscovery, handleDiscover, onCreateNote, onDeleteNote, onUpdateNote, revealPin, scheduleCheck,
  setHidden, setQuest, startDiscovery, stopDiscovery} from "./discover.mjs";
import {isDiscovered} from "./discover-logic.mjs";
import {keyDialog, makeKey} from "./map-key.mjs";
import {bindMenu} from "./pin-menu.mjs";
import {addStop, bindRoutePick, canBuildRoute, clearRoute, currentRoutes, drawRoute, openRoute, refreshRoute,
  routeAvailable} from "./route.mjs";
import {numberDialog, numberPins, onPreCreateNote} from "./numbering.mjs";
import {onActivateNote, openPin} from "./open-pin.mjs";
import {playerPinsAvailable, registerSocket, startPlayerPin} from "./player-pins.mjs";
import {followPin, hidePreview, onHoverNote} from "./preview.mjs";
import {noticeNewVersions, runSelfTest} from "./selftest.mjs";
import {changeLanguage, registerSettings} from "./settings.mjs";
import {categoryList, invalidate} from "./state.mjs";
import {registerUsage} from "./usage.mjs";

/** The tools in the notes controls. */
const TOOLS = {list: "smpList", pin: "smpPin", route: "smpRoute", key: "smpKey"};

/** Redraw what the module shows after a language or look change. */
function redraw() {
  for ( const id of ["smp-list", "smp-categories"] ) {
    const app = foundry.applications.instances.get(id);
    if ( app?.rendered ) app.render();
  }
}

/** The look or a category changed: forget what was read, style all pins again, redraw the list. */
function restyle() {
  invalidate();
  restyleAll();
  refreshList();
}

Hooks.once("init", () => {
  registerHubModule({moduleId: MODULE_ID, tested: TESTED_VERSIONS});
  registerSettings({
    language: value => changeLanguage(value, redraw),
    redraw: () => {
      redraw();
      hidePreview();
    },
    restyle,
    categories: restyle,
    privatePins: restyle,
    notesOn: onNotesOnChanged,
    playerPins: () => ui.controls?.render({reset: true}),
    discover: () => checkDiscovery(),
    route: refreshRoute,
    openList,
    openCategories,
    migrate: migrateDialog
  });
  // Counted only on the active GM's client, like every Sephral module
  registerUsage(MODULE_ID, {
    features: ["listOpened", "previewShown", "pinsNumbered", "categoryCreated", "playerPinRequested",
      "playerPinCreated", "sceneLinkOpened", "pinCushionMigrated", "pinDiscovered", "pinRevealed", "mapKeyMade",
      "routeBuilt", "questSet"],
    settings: ["theme", "labelMode", "noBackground", "constantSize", "preview", "autoNumber", "playerPins",
      "discoverDefault", "discoverAuto", "pace", "routePlayers", "keyText"]
  });
  registerDebug();
  registerKeys();

  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  Hooks.on("drawNote", applyStyle);
  Hooks.on("refreshNote", applyStyle);
  Hooks.on("hoverNote", onHoverNote);
  Hooks.on("canvasPan", () => {
    scheduleZoomUpdate();
    followPin();
  });
  Hooks.on("canvasReady", () => {
    bindStage();
    bindMenu();
    bindRoutePick();
    hidePreview();
    updateZoom();
    startDiscovery();
    drawRoute();
    refreshList();
  });
  Hooks.on("canvasTearDown", () => {
    hidePreview();
    stopDiscovery();
    clearRoute();
  });
  Hooks.on("sightRefresh", () => scheduleCheck());
  Hooks.on("updateScene", (scene, changes) => {
    if ( (scene === canvas.scene) && changes?.flags && (MODULE_ID in changes.flags) ) refreshRoute();
  });
  Hooks.on("renderNoteConfig", onRenderNoteConfig);
  Hooks.on("preCreateNote", (doc, data, options, userId) => {
    cleanNewNote(doc);
    onPreCreateNote(doc, data, options, userId);
  });
  Hooks.on("preUpdateNote", (doc, changes) => cleanNoteChanges(doc, changes));
  Hooks.on("activateNote", onActivateNote);
  for ( const event of ["createNote", "updateNote", "deleteNote", "drawNote"] ) Hooks.on(event, refreshList);
  Hooks.on("deleteNote", hidePreview);
  Hooks.on("createNote", onCreateNote);
  Hooks.on("deleteNote", onDeleteNote);
  Hooks.on("updateNote", onUpdateNote);
  for ( const event of ["updateNote", "deleteNote", "createNote"] ) Hooks.on(event, doc => {
    if ( doc.parent === canvas.scene ) refreshRoute();
  });
  onOpenWithoutJournal(openPin);

  game.modules.get(MODULE_ID).api = {
    /** Open the pin list (everyone). */
    open: openList,
    /**
     * Number the pins of a scene (GM). Options: {order: "reading"|"columns"|"name"|"listed", prefix, start, keep,
     * fromNames}. Returns {changed, total}. Without options the GM is asked.
     */
    number: (scene, options) => (options ? numberPins(scene ?? canvas.scene, options) : numberDialog()),
    /**
     * How a pin looks now: {label, number, noBackground, constantSize, minZoom, preview, category, hidden,
     * undiscovered (not shown to this user yet), hiddenPin (hidden until discovered), quest}. Takes a note or a note
     * document.
     */
    styleOf: noteOrDoc => {
      const note = noteOrDoc?.document ? noteOrDoc : (noteOrDoc?.object ?? {document: noteOrDoc});
      const d = describePin(note);
      return {label: d.label, number: d.number, labelMode: d.style.label, noBackground: d.style.noBackground,
        constantSize: d.style.constantSize, minZoom: d.style.minZoom, preview: d.style.preview,
        category: d.category ? {...d.category} : null, hidden: d.privateHidden || d.categoryHidden,
        undiscovered: d.undiscovered, hiddenPin: !!d.flags.hidden,
        quest: d.quest};
    },
    /** The world's categories: [{id, name, icon, color}]. */
    categories: () => categoryList().map(c => ({...c})),
    /** Pan the map to a pin and ping it. */
    focus: noteOrId => focusPin(typeof noteOrId === "string" ? canvas.notes.get(noteOrId) : noteOrId),
    /**
     * Has a user discovered a pin? A pin that is not hidden counts as discovered. Takes a note or its document.
     */
    isDiscovered: (noteOrDoc, user = game.user) => {
      const doc = noteOrDoc?.document ?? noteOrDoc;
      return isDiscovered(doc?.flags?.[MODULE_ID] ?? {}, user?.id ?? user);
    },
    /**
     * Hide a pin until it is discovered, or show it like any pin again (GM). Takes a note or its document.
     */
    setHidden: (noteOrDoc, hidden = true) => setHidden(noteOrDoc?.document ?? noteOrDoc, !!hidden),
    /**
     * Reveal a pin (GM). Options: {all: true} for everybody, {users: [ids]} for these users, {hideFor: [ids]} to hide
     * it again for them, {reset: true} to hide it again for everybody. Returns the list of users who found it.
     */
    discover: (noteOrDoc, options = {all: true}) => revealPin(noteOrDoc?.document ?? noteOrDoc, options),
    /** Ask the GM whom to reveal a pin to (GM). */
    askReveal: noteOrDoc => askReveal(noteOrDoc?.document ?? noteOrDoc),
    /** Set the quest state of a pin (GM): "open", "done", "failed" or "" for none. */
    setQuest: (noteOrDoc, state) => setQuest(noteOrDoc?.document ?? noteOrDoc, state),
    /**
     * Create or update the journal "Map key: <scene>" with one page per numbered pin (GM). Options: {text: "lines" |
     * "full" | "title", open}. Returns {journal, created, updated, kept, removed}. Without options the GM is asked.
     */
    mapKey: (scene, options) => (options ? makeKey(scene ?? canvas.scene, options) : keyDialog()),
    /** Open the route window. */
    openRoute,
    /** Add a pin to the route of this user (the GM's route for a GM). */
    addToRoute: noteOrId => addStop(typeof noteOrId === "string" ? noteOrId : (noteOrId?.document ?? noteOrId)?.id),
    /** The routes this user sees: [{id, stops, distance, units, hours, pace}]. */
    routes: currentRoutes,
    /** Take over the look of Pin Cushion's pins (GM). Options: {scope: "scene"|"all", dryRun}. */
    takeOverPins: migratePinCushion,
    /** Check the module (GM). */
    runSelfTest,
    /** Save the debug file of Sephral's modules (GM). */
    saveDebugFile: messageId => saveDebugFile(messageId ?? null, {moduleId: MODULE_ID})
  };
});

/** Applying a fixed module language loads its file; the rest of "ready" waits for it. */
let languageReady = Promise.resolve();

Hooks.once("i18nInit", () => {
  languageReady = applyModuleLanguage(setting("uiLanguage"));
});

Hooks.once("ready", async () => {
  await languageReady;
  registerSocket({discover: handleDiscover});
  applyNotesToggle(false);
  noticeNewVersions();
});

/**
 * Turn the pins on in this browser when the world says so. Done once per browser, so a player who turns them off later
 * keeps their choice; the GM switching the world option on again applies it to everybody.
 * @param {boolean} force
 */
function applyNotesToggle(force) {
  if ( !setting("notesOn") ) return;
  if ( !force && (setting("notesApplied") === "1") ) return;
  game.settings.set("core", "notesDisplayToggle", true);
  game.settings.set(MODULE_ID, "notesApplied", "1");
}

/**
 * The world option "pins on for players" changed.
 * @param {boolean} value
 */
function onNotesOnChanged(value) {
  if ( value ) applyNotesToggle(true);
  else game.settings.set(MODULE_ID, "notesApplied", "");
}

/** The key to open the pin list: no default key, everyone can choose one. */
function registerKeys() {
  game.keybindings.register(MODULE_ID, "openList", {
    name: "SMP.Keys.openList",
    editable: [],
    onDown: () => {
      openList();
      return true;
    }
  });
}

/**
 * Hook "getSceneControlButtons": the pin list for everybody and the player's pin in the notes controls.
 * @param {Record<string, object>|object[]} controls
 */
function onGetSceneControlButtons(controls) {
  const notes = controls?.notes ?? (Array.isArray(controls) ? controls.find(c => c.name === "notes") : null);
  if ( !notes ) return;
  const tools = [
    {name: TOOLS.list, title: "SMP.Tool.list", icon: "fa-solid fa-list-ul", button: true, visible: true,
      onChange: () => openList()}
  ];
  if ( routeAvailable() || canBuildRoute() ) {
    tools.push({name: TOOLS.route, title: "SMP.Tool.route", icon: "fa-solid fa-route", button: true, visible: true,
      onChange: () => openRoute()});
  }
  if ( game.user.isGM ) {
    tools.push({name: TOOLS.key, title: "SMP.Tool.key", icon: "fa-solid fa-book-open", button: true, visible: true,
      onChange: () => keyDialog()});
  }
  if ( playerPinsAvailable() ) {
    tools.push({name: TOOLS.pin, title: "SMP.Tool.pin", icon: "fa-solid fa-location-crosshairs", button: true,
      visible: true, onChange: () => startPlayerPin()});
  }
  for ( const tool of tools ) {
    if ( Array.isArray(notes.tools) ) notes.tools.push({...tool, onClick: tool.onChange});
    else {
      tool.order = 10 + Object.keys(notes.tools ?? {}).length;
      notes.tools[tool.name] = tool;
    }
  }
}
