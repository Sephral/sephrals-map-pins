/**
 * The made-up data of the sample windows (api.samples). Pure: every function takes the text function `t(key, data)` and
 * gives plain objects in the shape the windows and cards read, so the unit tests need no Foundry. Nothing is stored.
 * The pins are made up for the sample party: the miller's mill, a watchtower, a bandit camp and a few more.
 */

/** The players of the sample party (the names of the heroes' players, like in every module's samples). */
export const PEOPLE = [
  {id: "sample-lena", name: "Lena", color: "#d9695f"},
  {id: "sample-tom", name: "Tom", color: "#4f8fd6"},
  {id: "sample-sam", name: "Sam", color: "#5aa469"},
  {id: "sample-jo", name: "Jo", color: "#c9a640"}
];

/** The note icons the pins use (keys of Foundry's note icons), with a fallback picture. */
export const ICON_KEYS = {inn: "Barrel", mill: "Wind", tower: "Tower", camp: "Fire", shrine: "Temple", ferry: "Anchor",
  note: "Info", secret: "Key"};

/**
 * A small map picture as a data address, so the samples need no file of the world: parchment, a river, a road and
 * a few shapes. The kind changes the colors and the landscape.
 * @param {"valley"|"town"|"thumb"|"wide"} kind
 * @returns {string}
 */
export function samplePicture(kind = "valley") {
  const sizes = {valley: [2400, 1600], town: [2000, 1400], thumb: [480, 320], wide: [480, 240]};
  const [w, h] = sizes[kind] ?? sizes.valley;
  const palette = {valley: ["#d9c79a", "#6f9fbf", "#8a6d3b", "#6f8f55"], town: ["#cdbb93", "#5d8aa8", "#7a5a34", "#9a5a43"],
    thumb: ["#d9c79a", "#6f9fbf", "#8a6d3b", "#6f8f55"], wide: ["#d9c79a", "#6f9fbf", "#8a6d3b", "#6f8f55"]}[kind]
    ?? ["#d9c79a", "#6f9fbf", "#8a6d3b", "#6f8f55"];
  const [paper, water, road, green] = palette;
  const trees = Array.from({length: 18}, (_, i) => {
    const x = Math.round(((i * 137) % 100) / 100 * w * 0.9 + w * 0.05);
    const y = Math.round(((i * 71 + 13) % 100) / 100 * h * 0.8 + h * 0.1);
    return `<circle cx="${x}" cy="${y}" r="${Math.round(h * 0.035)}" fill="${green}" opacity="0.75"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" fill="${paper}"/>`
    + `<path d="M0 ${h * 0.7} C ${w * 0.3} ${h * 0.55}, ${w * 0.5} ${h * 0.85}, ${w} ${h * 0.6}" stroke="${water}" stroke-width="${h * 0.06}" fill="none"/>`
    + `<path d="M${w * 0.05} ${h * 0.2} C ${w * 0.3} ${h * 0.35}, ${w * 0.6} ${h * 0.15}, ${w * 0.95} ${h * 0.4}" stroke="${road}" stroke-width="${h * 0.012}" stroke-dasharray="${h * 0.03} ${h * 0.02}" fill="none"/>`
    + `${trees}<rect x="${w * 0.45}" y="${h * 0.4}" width="${w * 0.08}" height="${h * 0.12}" fill="${road}" opacity="0.8"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * The world's categories of the samples.
 * @param {Function} t
 * @param {(key: string) => string} icon   The picture of a note icon key
 * @returns {{id: string, name: string, icon: string, color: string}[]}
 */
export function sampleCategories(t, icon) {
  return [
    {id: "sample-quest", name: t("SMP.Categories.exampleQuest"), icon: icon("Book"), color: "#2f7fd1"},
    {id: "sample-shop", name: t("SMP.Categories.exampleShop"), icon: icon("Coins"), color: "#c28f1d"},
    {id: "sample-danger", name: t("SMP.Categories.exampleDanger"), icon: icon("Skull"), color: "#c0392b"}
  ];
}

/** The pin row of the list with every field the template reads. */
function row(base) {
  const defaults = {id: "", name: "", number: "", sortNumber: "", icon: "", tint: "", category: "", color: "", off: false,
    other: false, link: false, owner: "", isPrivate: false, canEdit: false, canDelete: false, gmEdit: false, hiddenPin: false,
    foundCount: "", rumor: false, canRumor: false, rumorLabel: "", rumorDone: false, newParts: 0, quest: "", questLabel: "",
    needle: ""};
  const pin = {...defaults, ...base};
  pin.sortNumber = pin.number;
  pin.needle = `${pin.number} ${pin.name} ${pin.category} ${pin.questLabel}`.toLowerCase();
  return pin;
}

/**
 * The rows of the pin list, the areas and the category chips.
 * @param {object} options
 * @param {boolean} options.gm
 * @param {boolean} [options.empty]   No pins and no areas
 * @param {Function} options.t
 * @param {(key: string) => string} options.icon
 * @returns {{pins: object[], areas: object[], categories: object[], empty: boolean}}
 */
export function listData({gm, empty = false, t, icon}) {
  const cats = Object.fromEntries(sampleCategories(t, icon).map(c => [c.id.replace("sample-", ""), c]));
  const quest = state => ({quest: state, questLabel: t(`SMP.Quest.state.${state}`)});
  const tag = (key, extra = {}) => ({category: cats[key].name, color: cats[key].color, ...extra});
  const everybody = t("SMP.Reveal.everybody");
  const pin = (key, extra) => row({id: `sample-${key}`, name: t(`SMP.Sample.Pin.${key}`), icon: icon(ICON_KEYS[key]), ...extra});
  const off = key => key === "danger";
  let pins = [];
  let areas = [];
  if ( !empty && gm ) {
    pins = [
      pin("inn", {number: "1", ...tag("shop"), gmEdit: true, canEdit: true, canDelete: true}),
      pin("mill", {number: "2", ...tag("quest"), ...quest("open"), rumor: true, rumorLabel: "2/3", gmEdit: true, canEdit: true,
        canDelete: true}),
      pin("tower", {number: "3", ...tag("quest"), ...quest("done"), link: true, gmEdit: true, canEdit: true, canDelete: true}),
      pin("camp", {number: "4", ...tag("danger", {off: off("danger")}), hiddenPin: true, foundCount: "2", canRumor: true,
        gmEdit: true, canEdit: true, canDelete: true}),
      pin("shrine", {number: "5", other: true, hiddenPin: true, foundCount: everybody, ...quest("failed"), gmEdit: true,
        canEdit: true, canDelete: true}),
      pin("ferry", {owner: "Lena", gmEdit: true, canEdit: true, canDelete: true}),
      pin("secret", {owner: "Sam", isPrivate: true, gmEdit: true, canEdit: true, canDelete: true})
    ];
    areas = [
      {id: "sample-wood", name: t("SMP.Sample.Area.wood"), ...tag("danger", {off: true}), hasJournal: true, hiddenPin: false,
        foundCount: "", other: false, needle: `${t("SMP.Sample.Area.wood")} danger`.toLowerCase()},
      {id: "sample-marsh", name: t("SMP.Sample.Area.marsh"), category: "", color: "", hasJournal: true, hiddenPin: true,
        foundCount: "1", off: false, other: true, needle: t("SMP.Sample.Area.marsh").toLowerCase()}
    ];
  } else if ( !empty ) {
    pins = [
      pin("inn", {number: "1", ...tag("shop")}),
      pin("mill", {number: "2", ...tag("quest"), ...quest("open"), newParts: 1}),
      pin("tower", {number: "3", ...tag("quest"), ...quest("done"), link: true}),
      pin("note", {owner: "Jo", canEdit: true, canDelete: true, icon: icon(ICON_KEYS.note)}),
      pin("secret", {owner: "Jo", isPrivate: true, canEdit: true, canDelete: true})
    ];
    areas = [
      {id: "sample-marsh", name: t("SMP.Sample.Area.marsh"), category: "", color: "", hasJournal: true, hiddenPin: false,
        foundCount: "", off: false, other: false, needle: t("SMP.Sample.Area.marsh").toLowerCase()}
    ];
  }
  const counts = {};
  for ( const item of [...pins, ...areas] ) {
    const found = Object.entries(cats).find(([, c]) => c.name === item.category);
    if ( found ) counts[found[1].id] = (counts[found[1].id] ?? 0) + 1;
  }
  const categories = Object.values(cats).map(c => ({...c, hidden: gm && off(c.id.replace("sample-", "")),
    count: counts[c.id] ?? 0}));
  return {pins, areas, categories, empty: !pins.length && !areas.length};
}

/**
 * The routes of the route window.
 * @param {"gm"|"player"|"empty"} kind
 * @param {Function} t
 * @returns {{blocks: object[], empty: boolean, pace: string, units: string}}
 */
export function routeData(kind, t) {
  const units = "mi";
  const time = (hours, minutes) => `${t("SMP.Route.hours", {n: hours})} ${t("SMP.Route.minutes", {n: minutes})}`;
  const stops = (list, legs) => list.map(([key, number], index) => ({index, n: index + 1, id: `sample-${key}`, number,
    name: t(`SMP.Sample.Pin.${key}`), leg: index ? `${legs[index - 1]} ${units}` : ""}));
  const block = (id, title, editable, color, list, legs, total, when) => ({id, title, editable, color,
    css: `#${color.toString(16).padStart(6, "0")}`, stops: stops(list, legs), count: list.length, total: `${total} ${units}`,
    time: when, last: list.length - 1});
  const all = [["inn", "1"], ["mill", "2"], ["tower", "3"], ["camp", "4"]];
  if ( kind === "empty" ) return {blocks: [], empty: true, pace: "normal", units};
  if ( kind === "gm" ) {
    return {blocks: [{...block("main", t("SMP.Route.gmRoute"), true, 0xe8b22a, all, [4, 6, 3], 13, time(4, 20)), shared: false}],
      empty: false, pace: "normal", units};
  }
  return {blocks: [
    block("main", t("SMP.Route.ownRoute"), true, 0xe8b22a, all.slice(0, 2), [4], 4, time(1, 20)),
    block("shared", t("SMP.Route.sharedRoute"), false, 0x3fa7d6, all, [4, 6, 3], 13, time(4, 20))
  ], empty: false, pace: "normal", units};
}

/**
 * What the quick look at the map above shows: two maps with pins, the party's place, the trail.
 * @param {object} options
 * @param {boolean} options.gm
 * @param {number} [options.index]   The map shown
 * @param {boolean} [options.empty]  No map above
 * @param {Function} options.t
 * @param {string} options.place     The name of the scene the party is in
 * @returns {object}
 */
export function whereData({gm, index = 0, empty = false, t, place}) {
  const valley = t("SMP.Sample.Scene.valley");
  const town = t("SMP.Sample.Scene.town");
  const maps = [{name: valley, kind: "valley", width: 2400, height: 1600,
    pins: [
      {id: "v-inn", x: 480, y: 560, label: t("SMP.Sample.Pin.inn"), number: "1", color: "#c28f1d"},
      {id: "v-mill", x: 1180, y: 820, label: t("SMP.Sample.Pin.mill"), number: "2", color: "#2f7fd1", here: true, focus: true},
      {id: "v-tower", x: 1820, y: 420, label: t("SMP.Sample.Pin.tower"), number: "3", color: "#2f7fd1"},
      {id: "v-ferry", x: 760, y: 1220, label: t("SMP.Sample.Pin.ferry"), number: "", color: ""}
    ]},
  {name: town, kind: "town", width: 2000, height: 1400,
    pins: [
      {id: "t-quay", x: 700, y: 860, label: t("SMP.Sample.Pin.ferry"), number: "1", color: "", here: true, focus: true},
      {id: "t-inn", x: 1250, y: 500, label: t("SMP.Sample.Pin.inn"), number: "2", color: "#c28f1d"}
    ]}];
  const list = maps.map((map, i) => ({index: i, name: map.name, selected: i === index}));
  const trail = [
    {date: t("SMP.Where.dayAt", {day: 5, clock: "19:30"}), names: `${place}, ${t("SMP.Sample.Pin.tower")}`, unknown: false},
    {date: t("SMP.Where.dayAt", {day: 4, clock: "08:10"}), names: t("SMP.Sample.Pin.ferry"), unknown: false},
    {date: t("SMP.Where.dayAt", {day: 3, clock: "16:00"}), names: t("SMP.Where.unknownPlace"), unknown: true}
  ];
  const base = {isGM: gm, status: t("SMP.Where.partyIn", {scene: place}), manual: gm,
    source: t(gm ? "SMP.Where.sourceManual" : "SMP.Where.sourceAuto"), viewed: place, maps: list, several: true, trail,
    trailOn: true};
  if ( empty ) return {...base, empty: true, maps: [], several: false};
  const map = maps[index] ?? maps[0];
  const marker = pin => (pin.here ? t(gm ? "SMP.Where.partyHere" : "SMP.Where.youHere") : (pin.focus ? t("SMP.Where.thisPlace") : ""));
  const focus = map.pins.find(pin => pin.focus);
  return {...base, empty: false, mapName: map.name, kind: map.kind, width: map.width, height: map.height,
    pins: map.pins.map(pin => ({...pin, here: !!pin.here, focus: !!pin.focus, mark: marker(pin)})), canOpen: true,
    focusX: focus.x, focusY: focus.y};
}

/**
 * The data of the preview cards.
 * @param {"journal"|"rumor"} kind
 * @param {Function} t
 * @returns {{title: string, blocks: object[], image: string, mode: string, quest?: string, scene?: object, parts?: object[],
 *   more?: number}}
 */
export function cardData(kind, t) {
  const title = t("SMP.Sample.Pin.mill");
  if ( kind === "rumor" ) {
    return {title, blocks: [], image: samplePicture("wide"), mode: "full", more: 2, parts: [
      {key: "p1", name: t("SMP.Sample.Text.part1"), isNew: false, hidden: false, blocks: [{kind: "p", text: t("SMP.Sample.Text.partText1")}]},
      {key: "p2", name: t("SMP.Sample.Text.part2"), isNew: true, hidden: false, blocks: [{kind: "p", text: t("SMP.Sample.Text.partText2")}]},
      {key: "p3", name: t("SMP.Sample.Text.part3"), isNew: false, hidden: true, blocks: []}
    ]};
  }
  return {title, mode: "full", image: samplePicture("wide"), quest: t("SMP.Quest.state.open"),
    blocks: [{kind: "p", text: t("SMP.Sample.Text.mill1")}, {kind: "p", text: t("SMP.Sample.Text.mill2")}],
    scene: {name: t("SMP.Sample.Scene.valley"), image: samplePicture("thumb")}};
}

/**
 * The entries of the pin menu, as the menu shows them for a state of the pin.
 * @param {"hidden"|"rumor"|"start"|"player"} kind
 * @param {Function} t
 * @returns {{label?: string, icon?: string, on?: boolean, divider?: boolean}[]}
 */
export function menuData(kind, t) {
  const entry = (label, icon, on = false) => ({label: t(label), icon, on});
  const divider = {divider: true};
  const questIcons = {open: "fa-circle-exclamation", done: "fa-circle-check", failed: "fa-circle-xmark", none: "fa-circle-minus"};
  const quests = ["open", "done", "failed", "none"].map(key => entry(`SMP.Quest.set.${key}`, questIcons[key], key === "open"));
  const route = [divider, entry("SMP.Menu.addToRoute", "fa-route", kind === "player")];
  const settings = [divider, entry("SMP.Menu.settings", "fa-gear")];
  if ( kind === "player" ) return route.slice(1);
  const head = (kind === "hidden")
    ? [entry("SMP.Menu.reveal", "fa-eye"), entry("SMP.Menu.unhide", "fa-eye-slash"), entry("SMP.Menu.revealAll", "fa-users")]
    : [entry("SMP.Menu.hide", "fa-eye-slash")];
  const rumor = (kind === "rumor")
    ? [divider, entry("SMP.Menu.rumorNext", "fa-forward-step"), entry("SMP.Menu.rumorParts", "fa-comment-dots"),
      entry("SMP.Menu.rumorStop", "fa-ban")]
    : (kind === "start" ? [divider, entry("SMP.Menu.rumorStart", "fa-comment-dots")] : []);
  return [...head, ...rumor, divider, ...quests, ...route, ...settings];
}

/**
 * The parts of a rumor with who may read each, and the players, for the question which parts whom may read.
 * @param {"pages"|"secrets"} mode
 * @param {Function} t
 * @returns {{name: string, pages: boolean, players: object[], parts: object[]}}
 */
export function partsData(mode, t) {
  const pages = mode === "pages";
  const names = pages
    ? [t("SMP.Sample.Text.part1"), t("SMP.Sample.Text.part2"), t("SMP.Sample.Text.part3")]
    : [1, 2, 3].map(n => t("SMP.Rumor.part", {n}));
  const everybody = PEOPLE.map(p => p.id);
  return {name: t("SMP.Sample.Pin.mill"), pages, players: PEOPLE,
    parts: [
      {key: "p1", name: names[0], all: true, users: everybody},
      {key: "p2", name: names[1], all: false, users: pages ? [PEOPLE[0].id, PEOPLE[1].id] : []},
      {key: "p3", name: names[2], all: false, users: []}
    ]};
}

/**
 * The players and who already knows a hidden pin, for the question whom to reveal it to.
 * @param {Function} t
 * @returns {{name: string, hidden: boolean, users: object[]}}
 */
export function revealData(t) {
  return {name: t("SMP.Sample.Pin.camp"), hidden: true,
    users: PEOPLE.map((p, index) => ({...p, active: index !== 3, knows: index < 2}))};
}

/**
 * The pin a player sent, as the GM's question shows it and as the player's own dialogs show it.
 * @param {Function} t
 * @returns {{values: object, pin: object}}
 */
export function playerPinData(t) {
  const name = t("SMP.Sample.Pin.note");
  const text = t("SMP.Sample.Text.note");
  return {values: {name, text, color: "#c9a640", private: false}, pin: {name, text, color: "#c9a640", private: false},
    secret: {name: t("SMP.Sample.Pin.secret"), text: t("SMP.Sample.Text.secret")}};
}
