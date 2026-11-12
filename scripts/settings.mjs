/**
 * Settings of the module. Like in every Sephral module, all options appear in Foundry's settings dialog under this
 * module, starting with the module language.
 */

import {MODULE_ID, isShown} from "./config.mjs";
import {FOLLOW_FOUNDRY, applyModuleLanguage} from "./language.mjs";
import {runSelfTest} from "./selftest.mjs";

/**
 * The settings of the module, in the order they appear in the settings dialog.
 * @type {Record<string, object>}
 */
export const SETTINGS = {
  uiLanguage: {type: String, default: FOLLOW_FOUNDRY, scope: "client", onChange: "language", choices: {
    [FOLLOW_FOUNDRY]: "SMP.LANGUAGE.default", de: "SMP.LANGUAGE.de", en: "SMP.LANGUAGE.en"}},
  theme: {type: String, default: "signature", scope: "client", onChange: "redraw", choices: {
    signature: "SMP.SETTINGS.theme.signature", foundry: "SMP.SETTINGS.theme.foundry"}},
  labelMode: {type: String, default: "hover", onChange: "restyle", choices: {
    hover: "SMP.SETTINGS.labelMode.hover", always: "SMP.SETTINGS.labelMode.always"}},
  noBackground: {type: Boolean, default: false, onChange: "restyle"},
  constantSize: {type: Boolean, default: false, onChange: "restyle"},
  constantScale: {type: Number, default: 100, onChange: "restyle", range: {min: 25, max: 300, step: 5}},
  minZoom: {type: Number, default: 0, onChange: "restyle", range: {min: 0, max: 200, step: 5}},
  numberFromName: {type: Boolean, default: true, onChange: "restyle"},
  autoNumber: {type: Boolean, default: false},
  preview: {type: Boolean, default: true, onChange: "restyle"},
  previewChars: {type: Number, default: 300, range: {min: 80, max: 1000, step: 20}},
  newGlobal: {type: Boolean, default: false},
  notesOn: {type: Boolean, default: true, onChange: "notesOn"},
  playerPins: {type: String, default: "off", onChange: "playerPins", choices: {
    off: "SMP.SETTINGS.playerPins.off", confirm: "SMP.SETTINGS.playerPins.confirm",
    instant: "SMP.SETTINGS.playerPins.instant"}},
  playerPinsPrivate: {type: Boolean, default: true},
  playerPinLimit: {type: Number, default: 10, range: {min: 1, max: 100, step: 1}}
};

/** The functions the menus call, set by registerSettings. */
let menuHandlers = {};

/**
 * Register all settings of the module and its menus.
 * @param {object} handlers   {language, redraw, restyle, notesOn, playerPins, categories, openList, openCategories,
 *   migrate}
 */
export function registerSettings(handlers) {
  menuHandlers = handlers;
  for ( const [key, def] of Object.entries(SETTINGS) ) {
    game.settings.register(MODULE_ID, key, {
      name: `SMP.SETTINGS.${key}.name`,
      hint: `SMP.SETTINGS.${key}.hint`,
      scope: def.scope ?? "world",
      config: true,
      type: def.type,
      choices: def.choices,
      range: def.range,
      default: def.default,
      requiresReload: false,
      onChange: def.onChange ? value => handlers[def.onChange]?.(value) : undefined
    });
  }

  // Data of the module
  game.settings.register(MODULE_ID, "categories", {scope: "world", config: false, type: Array, default: [],
    onChange: value => handlers.categories?.(value)});
  game.settings.register(MODULE_ID, "hiddenCategories", {scope: "client", config: false, type: Array, default: [],
    onChange: value => handlers.categories?.(value)});
  game.settings.register(MODULE_ID, "privatePins", {scope: "client", config: false, type: Object, default: {},
    onChange: value => handlers.privatePins?.(value)});
  game.settings.register(MODULE_ID, "notesApplied", {scope: "client", config: false, type: String, default: ""});
  game.settings.register(MODULE_ID, "acknowledgedVersions", {scope: "client", config: false, type: String, default: ""});

  // The module's own menus first, then the self test (the debug file comes after, registered by registerDebug)
  game.settings.registerMenu(MODULE_ID, "list", {
    name: "SMP.List.title",
    label: "SMP.List.open",
    hint: "SMP.List.menuHint",
    icon: "fa-solid fa-map-pin",
    type: ListMenu,
    restricted: false
  });
  game.settings.registerMenu(MODULE_ID, "categories", {
    name: "SMP.Categories.title",
    label: "SMP.Categories.open",
    hint: "SMP.Categories.menuHint",
    icon: "fa-solid fa-tags",
    type: CategoriesMenu,
    restricted: true
  });
  game.settings.registerMenu(MODULE_ID, "migrate", {
    name: "SMP.Migrate.title",
    label: "SMP.Migrate.open",
    hint: "SMP.Migrate.menuHint",
    icon: "fa-solid fa-right-left",
    type: MigrateMenu,
    restricted: true
  });
  game.settings.registerMenu(MODULE_ID, "selfTest", {
    name: "SMP.SELFTEST.Title",
    label: "SMP.SELFTEST.Run",
    hint: "SMP.SELFTEST.Hint",
    icon: "fa-solid fa-stethoscope",
    type: SelfTestMenu,
    restricted: true
  });
}

/** The menu button which opens the pin list. Foundry only accepts application classes as menus. */
class ListMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    await menuHandlers.openList?.();
    return this;
  }
}

/** The menu button which opens the categories window. */
class CategoriesMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    await menuHandlers.openCategories?.();
    return this;
  }
}

/** The menu button which starts taking over Pin Cushion's pins. */
class MigrateMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    await menuHandlers.migrate?.();
    return this;
  }
}

/** The menu button which runs the self test. */
class SelfTestMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    if ( game.user.isGM ) await runSelfTest();
    return this;
  }
}

/**
 * Switch the module strings when the user picks another module language, then redraw.
 * @param {string} value
 * @param {Function} redraw
 */
export function changeLanguage(value, redraw) {
  applyModuleLanguage(value).then(() => {
    for ( const id of ["smp-list", "smp-categories"] ) {
      const app = foundry.applications.instances.get(id);
      if ( isShown(app) ) app.render({window: {title: app.title}});
    }
    redraw();
    if ( game.settings.sheet?.rendered ) game.settings.sheet.render();
  });
}
