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
import {applyAreaState, areasOf, checkAreaDiscovery, describeArea, askRevealArea, cancelArea, cleanAreaChanges, newArea, onAreaChanged, onAreaDeleted,
  onCreateArea, onPreCreateDrawing, refreshAreaHover, onRenderDrawingConfig, restyleAreas, revealArea, setAreaHidden, startAreas, stopAreas,
  syncAreaColors} from "./areas.mjs";
import {clearParty, markNote, partyScene, partyState, refreshParty, setParty, startParty, trailList, updateParty,
  whereAreWe} from "./party.mjs";
import {openWhere, refreshWhere} from "./where-app.mjs";
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
const TOOLS = {list: "smpList", pin: "smpPin", route: "smpRoute", key: "smpKey", where: "smpWhere", area: "smpArea"};

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
  restyleAreas();
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
    categoryColors: () => syncAreaColors().catch(err => console.warn(`${MODULE_ID} | Could not update area colors`, err)),
    party: () => {
      refreshParty();
      refreshWhere();
      ui.controls?.render({reset: true});
    },
    privatePins: restyle,
    notesOn: onNotesOnChanged,
    playerPins: () => ui.controls?.render({reset: true}),
    discover: () => {
      checkDiscovery();
      checkAreaDiscovery();
    },
    route: refreshRoute,
    openList,
    openCategories,
    migrate: migrateDialog
  });
  // Counted only on the active GM's client, like every Sephral module
  registerUsage(MODULE_ID, {
    features: ["listOpened", "previewShown", "pinsNumbered", "categoryCreated", "playerPinRequested",
      "playerPinCreated", "sceneLinkOpened", "pinCushionMigrated", "pinDiscovered", "pinRevealed", "mapKeyMade",
      "routeBuilt", "questSet", "whereAsked", "partyPlaced", "areaCreated", "areaDiscovered", "areaRevealed",
      "areaPreviewShown"],
    settings: ["theme", "labelMode", "noBackground", "constantSize", "preview", "autoNumber", "playerPins",
      "discoverDefault", "discoverAuto", "pace", "routePlayers", "keyText", "whereOn", "partyTrail"]
  });
  registerDebug();
  registerKeys();

  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  Hooks.on("drawNote", applyStyle);
  Hooks.on("refreshNote", applyStyle);
  Hooks.on("drawNote", markNote);
  Hooks.on("refreshNote", markNote);
  Hooks.on("drawDrawing", applyAreaState);
  Hooks.on("refreshDrawing", applyAreaState);
  Hooks.on("hoverNote", onHoverNote);
  Hooks.on("canvasPan", () => {
    scheduleZoomUpdate();
    followPin();
    refreshAreaHover();
  });
  Hooks.on("canvasReady", () => {
    bindStage();
    bindMenu();
    bindRoutePick();
    hidePreview();
    updateZoom();
    startDiscovery();
    startAreas();
    drawRoute();
    refreshParty();
    refreshList();
  });
  Hooks.on("canvasTearDown", () => {
    hidePreview();
    stopDiscovery();
    stopAreas();
    clearParty();
    cancelArea();
    clearRoute();
  });
  Hooks.on("sightRefresh", () => scheduleCheck());
  Hooks.on("updateScene", (scene, changes) => {
    if ( (scene === canvas.scene) && changes?.flags && (MODULE_ID in changes.flags) ) refreshRoute();
  });
  Hooks.on("renderNoteConfig", onRenderNoteConfig);
  Hooks.on("renderDrawingConfig", onRenderDrawingConfig);
  Hooks.on("preCreateDrawing", onPreCreateDrawing);
  Hooks.on("preUpdateDrawing", (doc, changes) => cleanAreaChanges(doc, changes));
  Hooks.on("createDrawing", onCreateArea);
  Hooks.on("createDrawing", doc => onAreaChanged(doc));
  Hooks.on("updateDrawing", onAreaChanged);
  Hooks.on("deleteDrawing", onAreaDeleted);
  Hooks.on("deleteDrawing", () => refreshList());
  for ( const event of ["createDrawing", "updateDrawing"] ) Hooks.on(event, () => refreshList());
  // The pins that open a scene decide where the party shows on the maps above
  const linksChanged = () => {
    refreshParty();
    refreshWhere();
  };
  Hooks.on("createNote", linksChanged);
  Hooks.on("deleteNote", linksChanged);
  Hooks.on("updateNote", (doc, changes) => {
    if ( (changes?.flags && (MODULE_ID in changes.flags)) || ("x" in changes) || ("y" in changes) ) linksChanged();
  });
  for ( const event of ["createScene", "deleteScene"] ) Hooks.on(event, () => {
    refreshParty();
    updateParty();
  });
  Hooks.on("updateScene", (scene, changes) => {
    if ( "active" in changes ) updateParty();
  });
  Hooks.on("userConnected", () => updateParty());
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
    /**
     * Where the party is: {scene (id or null), source ("manual", "players", "active" or "tokens"), manual (the scene set
     * by hand or ""), since (world time)}.
     */
    party: () => ({...partyState(), scene: partyScene()?.id ?? null}),
    /** Set the place of the party by hand (GM), or null to follow it automatically again. */
    setParty: sceneOrId => setParty(sceneOrId),
    /** Look where the party is now (active GM). Returns whether something changed. */
    updateParty: options => updateParty(options),
    /** The places the party visited, newest first: [{scene, name, date, known}]. */
    trail: trailList,
    /** What the control "Where are we?" does: pans to the marker, or opens the quick look at the map above. */
    whereAreWe,
    /** Open the quick look at the map above a scene (the viewed scene by default). */
    openWhere: sceneId => openWhere(sceneId ?? canvas.scene?.id),
    /** The areas of a scene (drawings with the area flag) that this user may see: [{id, name, category, hidden, entry}]. */
    areas: scene => areasOf(scene ?? canvas.scene).filter(doc => !describeArea(doc).undiscovered).map(doc => ({id: doc.id, name: doc.text, category: doc.flags?.[MODULE_ID]?.category ?? "",
      hidden: doc.flags?.[MODULE_ID]?.hidden === true, entry: doc.flags?.[MODULE_ID]?.entry ?? ""})),
    /** Ask for a new area and let the GM draw its shape (GM). */
    newArea,
    /** Reveal an area for players or hide it again (GM). Options as for discover. */
    revealArea: (drawing, options = {all: true}) => revealArea(drawing?.document ?? drawing, options),
    /** Ask the GM whom to reveal an area to (GM). */
    askRevealArea: drawing => askRevealArea(drawing?.document ?? drawing),
    /** Hide an area until it is discovered, or show it like any drawing again (GM). */
    setAreaHidden: (drawing, hidden = true) => setAreaHidden(drawing?.document ?? drawing, !!hidden),
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
  startParty();
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
  if ( setting("whereOn") ) {
    tools.push({name: TOOLS.where, title: "SMP.Tool.where", icon: "fa-solid fa-location-dot", button: true, visible: true,
      onChange: () => whereAreWe()});
  }
  if ( game.user.isGM ) {
    tools.push({name: TOOLS.area, title: "SMP.Tool.area", icon: "fa-solid fa-draw-polygon", button: true, visible: true,
      onChange: () => newArea()});
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
