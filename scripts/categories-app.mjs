/**
 * The categories window (GM): the world's list of categories with name, symbol and color. A pin in a category takes
 * its color (a ring) and, when the pin has no image of its own, its symbol.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, setting, t} from "./config.mjs";
import {cleanCategories} from "./pin-logic.mjs";
import {countFeature} from "./usage.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/**
 * Example categories with symbols of Foundry's own note icons.
 * @returns {{id: string, name: string, icon: string, color: string}[]}
 */
function examples() {
  const icons = CONFIG.JournalEntry?.noteIcons ?? {};
  const pick = (key, fallback) => icons[key] ?? fallback;
  return [
    {id: "", name: t("SMP.Categories.exampleQuest"), icon: pick("Book", "icons/svg/book.svg"), color: "#2f7fd1"},
    {id: "", name: t("SMP.Categories.exampleShop"), icon: pick("Coins", "icons/svg/coins.svg"), color: "#c28f1d"},
    {id: "", name: t("SMP.Categories.exampleDanger"), icon: pick("Skull", "icons/svg/skull.svg"), color: "#c0392b"}
  ];
}

export class CategoriesApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "smp-categories",
    classes: ["smp-app", "smp-categories"],
    tag: "section",
    window: {title: "SMP.Categories.title", icon: "fa-solid fa-tags", resizable: true},
    position: {width: 620, height: "auto"},
    actions: {
      add: CategoriesApp.#onAdd,
      remove: CategoriesApp.#onRemove,
      examples: CategoriesApp.#onExamples,
      save: CategoriesApp.#onSave
    }
  };

  /** @override */
  static PARTS = {main: {template: `${TEMPLATES}/categories.hbs`, scrollable: [".smp-cat-rows"]}};

  /** The rows being edited. */
  #rows = null;

  /** @override */
  get title() {
    return t("SMP.Categories.title");
  }

  /** @override */
  async _prepareContext() {
    this.#rows ??= cleanCategories(setting("categories")).map(c => ({...c}));
    const icons = Object.entries(CONFIG.JournalEntry?.noteIcons ?? {})
      .sort(([a], [b]) => a.localeCompare(b, game.i18n.lang)).map(([label, src]) => ({label, src}));
    return {
      rows: this.#rows.map((row, index) => ({...row, index})),
      empty: !this.#rows.length,
      icons,
      theme: setting("theme"),
      text: {
        name: t("SMP.Categories.name"),
        symbol: t("SMP.Categories.symbol"),
        color: t("SMP.Categories.color"),
        add: t("SMP.Categories.add"),
        remove: t("SMP.Categories.remove"),
        examples: t("SMP.Categories.examples"),
        save: t("SMP.Categories.save"),
        empty: t("SMP.Categories.empty"),
        hint: t("SMP.Categories.hint"),
        core: t("SMP.Categories.core")
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
    for ( const select of this.element.querySelectorAll("select[data-core]") ) {
      select.addEventListener("change", () => {
        if ( !select.value ) return;
        const picker = select.closest(".smp-cat-row").querySelector("file-picker");
        if ( picker ) picker.value = select.value;
        select.value = "";
      });
    }
  }

  /** Read the rows from the form. */
  #read() {
    const rows = [];
    for ( const row of this.element.querySelectorAll(".smp-cat-row") ) {
      rows.push({
        id: row.dataset.id,
        name: row.querySelector("input[name=name]").value,
        icon: row.querySelector("file-picker")?.value ?? "",
        color: row.querySelector("input[name=color]").value
      });
    }
    this.#rows = rows;
  }

  static #onAdd() {
    this.#read();
    this.#rows.push({id: "", name: "", icon: CONFIG.JournalEntry?.noteIcons?.Book ?? "icons/svg/book.svg", color: "#9c3b22"});
    this.render();
  }

  static #onRemove(event, target) {
    this.#read();
    this.#rows.splice(Number(target.closest(".smp-cat-row").dataset.index), 1);
    this.render();
  }

  static #onExamples() {
    this.#read();
    this.#rows.push(...examples());
    this.render();
  }

  static async #onSave() {
    this.#read();
    const before = cleanCategories(setting("categories")).length;
    const list = cleanCategories(this.#rows);
    await game.settings.set(MODULE_ID, "categories", list);
    if ( list.length > before ) countFeature(MODULE_ID, "categoryCreated", list.length - before);
    this.#rows = null;
    ui.notifications.info(t("SMP.Categories.saved"));
    this.close();
  }
}

/**
 * Open the categories window.
 * @returns {Promise<CategoriesApp|null>}
 */
export async function openCategories() {
  if ( !game.user.isGM ) return null;
  const app = foundry.applications.instances.get("smp-categories") ?? new CategoriesApp();
  await app.render({force: true});
  return app;
}
