/**
 * The quick look at the map above a scene: a window that shows the picture of the map with its pins, centered on the pin
 * that opens the scene, and the marker where the party is. It reads the scenes' data and draws plain elements, it does
 * not switch anybody's view, so a look never pulls the user out of their scene and never moves the party.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, esc, flagsOf, isV14, setting, t} from "./config.mjs";
import {backgroundBox} from "./party-logic.mjs";
import {describePin} from "./note-style.mjs";
import {mayViewScene} from "./open-pin.mjs";
import {clearTrail, mayNameScene, parentPins, partyPinsOn, partyState, setParty, trailGroups}
  from "./party.mjs";
import {categoryOff, pinVisible} from "./visibility.mjs";
import {countFeature, markUsed} from "./usage.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/** The zoom steps of the buttons and the wheel. */
const ZOOM_STEP = 1.25;

/**
 * The picture of a scene: Foundry 14 keeps it on the first level, Foundry 13 on the scene.
 * @param {Scene} scene
 * @returns {string}
 */
export function sceneImage(scene) {
  const src = isV14() ? (scene.initialLevel?.background?.src ?? null) : (scene.background?.src ?? null);
  return String(src ?? "");
}

/**
 * How the picture of a scene is placed: Foundry 14 keeps fit, scale, offset and anchor on the level, Foundry 13 has
 * moved the scene rectangle by the offset already (the picture fills it).
 * @param {Scene} scene
 * @returns {object|null}
 */
export function sceneTextures(scene) {
  if ( !isV14() ) return null;
  const t = scene.initialLevel?.textures;
  return t ? {fit: t.fit, scaleX: t.scaleX, scaleY: t.scaleY, offsetX: t.offsetX, offsetY: t.offsetY, anchorX: t.anchorX,
    anchorY: t.anchorY, rotation: t.rotation} : null;
}

/**
 * Is a path a video?
 * @param {string} src
 * @returns {boolean}
 */
function isVideo(src) {
  return /\.(webm|mp4|m4v|ogv)(\?|$)/i.test(src);
}

export class WhereApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "smp-where",
    classes: ["smp-app", "smp-where"],
    tag: "section",
    window: {title: "SMP.Where.title", icon: "fa-solid fa-location-dot", resizable: true},
    position: {width: 680, height: 640},
    actions: {
      openMap: WhereApp.#onOpenMap,
      setHere: WhereApp.#onSetHere,
      auto: WhereApp.#onAuto,
      clearTrail: WhereApp.#onClearTrail,
      zoomIn: WhereApp.#onZoomIn,
      zoomOut: WhereApp.#onZoomOut,
      center: WhereApp.#onCenter
    }
  };

  /** @override */
  static PARTS = {main: {template: `${TEMPLATES}/where.hbs`, scrollable: [".smp-trail"]}};

  /** The scene whose map above is shown. */
  place = null;

  /** The index of the map above, when there are several. */
  index = 0;

  /** The zoom and the offset of the picture, kept while the window is open. */
  #view = null;

  /** What the last render showed, for the buttons. */
  #current = null;

  /**
   * Show the map above another scene.
   * @param {string} sceneId
   */
  setPlace(sceneId) {
    if ( this.place === sceneId ) return;
    this.place = sceneId;
    this.index = 0;
    this.#view = null;
  }

  /** @override */
  get title() {
    return t("SMP.Where.title");
  }

  /** @override */
  async _prepareContext() {
    const parents = parentPins(this.place);
    if ( this.index >= parents.length ) this.index = 0;
    const state = partyState();
    const partyScene = game.scenes.get(state.scene);
    const named = partyScene && mayNameScene(partyScene);
    const context = {
      isGM: game.user.isGM,
      empty: !parents.length,
      status: state.scene ? t("SMP.Where.partyIn", {scene: named ? partyScene.name : t("SMP.Where.unknownPlace")})
        : t("SMP.Where.nobody"),
      source: state.manual ? t("SMP.Where.sourceManual") : t("SMP.Where.sourceAuto"),
      manual: !!state.manual,
      viewed: canvas.scene?.name ?? "",
      maps: parents.map((p, i) => ({index: i, name: p.scene.name, selected: i === this.index})),
      several: parents.length > 1,
      trail: trailGroups(),
      trailOn: !!setting("partyTrail"),
      text: Object.fromEntries(["title", "mapAbove", "openMap", "auto", "clearTrail", "trailTitle", "trailEmpty",
        "zoomIn", "zoomOut", "center", "noPicture", "empty", "sourceHint"].map(key => [key, t(`SMP.Where.${key}`)]))
    };
    context.text.setHere = t("SMP.Where.setHere", {scene: context.viewed});
    this.#current = null;
    const picked = parents[this.index];
    if ( !picked ) return context;
    const {scene, doc} = picked;
    const dims = scene.dimensions;
    const src = sceneImage(scene);
    const party = partyPinsOn(scene.id);
    // A video cannot be shown here: the scene's thumbnail stands in when there is one
    const video = isVideo(src);
    const picture = video ? String(scene.thumb ?? "") : src;
    const pins = scene.notes.contents.filter(n => pinVisible(n) && !categoryOff(flagsOf(n))).map(n => {
      const d = describePin({document: n});
      return {id: n.id, x: Math.round(n.x - dims.sceneX), y: Math.round(n.y - dims.sceneY), label: d.label,
        number: d.number, here: party.has(n.id), focus: n.id === doc.id, color: d.category?.color ?? "",
        mark: party.has(n.id) ? t(game.user.isGM ? "SMP.Where.partyHere" : "SMP.Where.youHere")
          : (n.id === doc.id ? t("SMP.Where.thisPlace") : "")};
    });
    Object.assign(context, {
      mapName: scene.name,
      src: picture,
      textures: JSON.stringify(video ? null : sceneTextures(scene)),
      width: dims.sceneWidth,
      height: dims.sceneHeight,
      pins,
      canOpen: mayViewScene(scene),
      focusX: Math.round(doc.x - dims.sceneX),
      focusY: Math.round(doc.y - dims.sceneY)
    });
    this.#current = {scene, doc, dims};
    return context;
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
    const select = this.element.querySelector("select[name=map]");
    select?.addEventListener("change", () => {
      this.index = Number(select.value) || 0;
      this.#view = null;
      this.render();
    });
    const viewport = this.element.querySelector(".smp-where-view");
    if ( !viewport || !this.#current ) return;
    this.#placePicture();
    this.#bindView(viewport);
  }

  /** Put the picture where the scene has it: size, offset, anchor and turn. */
  #placePicture() {
    const img = this.element.querySelector(".smp-where-image");
    if ( !img ) return;
    let config = null;
    try {
      config = JSON.parse(img.dataset.textures || "null");
    } catch(err) {
      config = null;
    }
    if ( !config ) return;
    const apply = () => {
      const {dims} = this.#current;
      const box = backgroundBox(config, {width: dims.sceneWidth, height: dims.sceneHeight},
        {width: img.naturalWidth, height: img.naturalHeight});
      Object.assign(img.style, {position: "absolute", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`,
        height: `${box.height}px`, transformOrigin: `${box.originX * 100}% ${box.originY * 100}%`,
        transform: `rotate(${box.rotation}deg) scale(${box.flipX ? -1 : 1}, ${box.flipY ? -1 : 1})`});
    };
    if ( img.complete && img.naturalWidth ) apply();
    else img.addEventListener("load", apply, {once: true});
  }

  /**
   * Zoom and move the picture with the wheel, the pointer and the buttons.
   * @param {HTMLElement} viewport
   */
  #bindView(viewport) {
    const stage = viewport.querySelector(".smp-where-stage");
    const {dims, doc} = this.#current;
    const focus = {x: doc.x - dims.sceneX, y: doc.y - dims.sceneY};
    const fit = () => Math.min(viewport.clientWidth / dims.sceneWidth, viewport.clientHeight / dims.sceneHeight);
    const apply = () => {
      const {zoom, x, y} = this.#view;
      stage.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
      stage.style.setProperty("--smp-inv", String(1 / zoom));
    };
    const center = (zoom = null) => {
      const min = fit();
      const start = Math.min(Math.max(zoom ?? (viewport.clientWidth / (dims.sceneWidth * 0.4)), min), 3);
      this.#view = {zoom: start, x: (viewport.clientWidth / 2) - (focus.x * start),
        y: (viewport.clientHeight / 2) - (focus.y * start)};
      apply();
    };
    const zoomAt = (factor, px, py) => {
      const {zoom, x, y} = this.#view;
      const next = Math.min(Math.max(zoom * factor, fit() * 0.9), 4);
      const k = next / zoom;
      this.#view = {zoom: next, x: px - ((px - x) * k), y: py - ((py - y) * k)};
      apply();
    };
    // The window settles in its size after the first draw: the view follows until the user takes over
    let touched = !!this.#view;
    this.zoomBy = factor => {
      touched = true;
      zoomAt(factor, viewport.clientWidth / 2, viewport.clientHeight / 2);
    };
    this.centerOnPlace = () => {
      touched = false;
      center();
    };
    if ( !this.#view ) center();
    else apply();
    new ResizeObserver(() => {
      if ( !touched && viewport.clientWidth ) center();
    }).observe(viewport);
    viewport.addEventListener("wheel", event => {
      event.preventDefault();
      touched = true;
      const rect = viewport.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX - rect.left, event.clientY - rect.top);
    }, {passive: false});
    let drag = null;
    viewport.addEventListener("pointerdown", event => {
      if ( event.button !== 0 ) return;
      touched = true;
      drag = {x: event.clientX, y: event.clientY, view: {...this.#view}};
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("is-dragging");
    });
    viewport.addEventListener("pointermove", event => {
      if ( !drag ) return;
      this.#view = {...drag.view, x: drag.view.x + (event.clientX - drag.x), y: drag.view.y + (event.clientY - drag.y)};
      apply();
    });
    const end = () => {
      drag = null;
      viewport.classList.remove("is-dragging");
    };
    viewport.addEventListener("pointerup", end);
    viewport.addEventListener("pointercancel", end);
  }

  /* -------------------------------------------- */

  static #onOpenMap() {
    const scene = this.#current?.scene;
    if ( scene && mayViewScene(scene) ) scene.view();
  }

  static async #onSetHere() {
    if ( canvas.scene ) await setParty(canvas.scene);
  }

  static async #onAuto() {
    await setParty(null);
  }

  static async #onClearTrail() {
    const sure = await foundry.applications.api.DialogV2.confirm({
      window: {title: t("SMP.Where.clearTitle"), icon: "fa-solid fa-trash"},
      content: `<p>${esc(t("SMP.Where.clearText"))}</p>`,
      rejectClose: false
    });
    if ( sure ) await clearTrail();
  }

  static #onZoomIn() {
    this.zoomBy?.(ZOOM_STEP);
  }

  static #onZoomOut() {
    this.zoomBy?.(1 / ZOOM_STEP);
  }

  static #onCenter() {
    this.centerOnPlace?.();
  }
}

/**
 * Open the quick look at the map above a scene.
 * @param {string} [sceneId]   The scene; the viewed one by default
 * @returns {Promise<WhereApp>}
 */
export async function openWhere(sceneId = canvas.scene?.id) {
  const existing = foundry.applications.instances.get("smp-where");
  const app = existing ?? new WhereApp();
  app.setPlace(sceneId);
  await app.render({force: true});
  countFeature(MODULE_ID, "whereAsked");
  markUsed(MODULE_ID);
  return app;
}

/**
 * Redraw the window when it is open, for example after the party moved.
 */
export function refreshWhere() {
  const app = foundry.applications.instances.get("smp-where");
  const states = foundry.applications.api.ApplicationV2.RENDER_STATES;
  if ( app && (app.state === states.RENDERED) ) app.render();
}
