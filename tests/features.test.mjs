import assert from "node:assert/strict";
import {test} from "node:test";
import {EVERYBODY, blockedList, changeFound, cleanQuest, foundList, isDiscovered, newlyExplored, nextQuest, revealResult,
  undiscoveredFor}
  from "../scripts/discover-logic.mjs";
import {cleanKeyText, compareNumbers, keyPageHtml, keyPins, mergeGenerated, normalizeHtml, planKey}
  from "../scripts/key-logic.mjs";
import {cleanFlags} from "../scripts/pin-logic.mjs";
import {MAX_STOPS, cleanPace, cleanStops, dashSegments, roundDistance, routeStats, splitTime, visiblePrefix}
  from "../scripts/route-logic.mjs";

/* Discovered pins */

test("a pin that is not hidden counts as discovered", () => {
  assert.equal(isDiscovered({}, "u1"), true);
  assert.equal(isDiscovered({hidden: false}, "u1"), true);
  assert.equal(undiscoveredFor({}, "u1", false), false);
});

test("a hidden pin is unseen until it is found, the GM sees all", () => {
  const flags = {hidden: true};
  assert.equal(isDiscovered(flags, "u1"), false);
  assert.equal(undiscoveredFor(flags, "u1", false), true);
  assert.equal(undiscoveredFor(flags, "gm", true), false);
  assert.equal(isDiscovered({hidden: true, found: ["u2"]}, "u1"), false);
  assert.equal(isDiscovered({hidden: true, found: ["u1"]}, "u1"), true);
  assert.equal(isDiscovered({hidden: true, found: [EVERYBODY]}, "u9"), true);
});

test("the found list is cleaned", () => {
  assert.deepEqual(foundList({found: ["a", "a", "", 3, null, "b"]}), ["a", "b"]);
  assert.deepEqual(foundList({found: "a"}), []);
  assert.deepEqual(foundList(null), []);
});

test("revealing and hiding a pin changes the found list", () => {
  const players = ["p1", "p2", "p3"];
  assert.deepEqual(changeFound([], {playerIds: players, all: true}), [EVERYBODY]);
  assert.deepEqual(changeFound(["p1"], {playerIds: players, add: ["p2", "p1"]}), ["p1", "p2"]);
  assert.deepEqual(changeFound([EVERYBODY], {playerIds: players, add: ["p2"]}), [EVERYBODY]);
  assert.deepEqual(changeFound([EVERYBODY], {playerIds: players, remove: ["p2"]}), ["p1", "p3"]);
  assert.deepEqual(changeFound(["p1", "p2"], {playerIds: players, remove: ["p1"]}), ["p2"]);
  assert.deepEqual(changeFound(["p1", "p2"], {playerIds: players, reset: true}), []);
});

test("a pin is discovered when its position is explored", () => {
  const pins = [
    {id: "a", flags: {hidden: true}, x: 100, y: 100},
    {id: "b", flags: {hidden: true}, x: 900, y: 900},
    {id: "c", flags: {}, x: 100, y: 100},
    {id: "d", flags: {hidden: true, found: ["u1"]}, x: 100, y: 100},
    {id: "e", flags: {hidden: true}, x: 120, y: 120}
  ];
  const explored = ({x}) => x < 500;
  assert.deepEqual(newlyExplored(pins, "u1", explored), ["a", "e"]);
  assert.deepEqual(newlyExplored(pins, "u1", explored, new Set(["a"])), ["e"]);
  assert.deepEqual(newlyExplored(pins, "u2", explored), ["a", "d", "e"]);
});

test("hiding a pin again keeps it hidden in explored ground", () => {
  const players = ["p1", "p2", "p3"];
  const flags = {hidden: true, found: ["p1", "p2"]};
  const reset = revealResult(flags, {playerIds: players, reset: true});
  assert.deepEqual(reset, {found: [], blocked: ["p1", "p2"]});
  const everybody = revealResult({hidden: true, found: [EVERYBODY]}, {playerIds: players, reset: true});
  assert.deepEqual(everybody.blocked, ["p1", "p2", "p3"]);
  // Nobody knew it: nobody is blocked, the pin can still be found by exploring
  assert.deepEqual(revealResult({hidden: true}, {playerIds: players, reset: true}), {found: [], blocked: []});
  // Revealing again lifts the block
  const again = revealResult({hidden: true, blocked: ["p1", "p2"]}, {playerIds: players, add: ["p1"]});
  assert.deepEqual(again, {found: ["p1"], blocked: ["p2"]});
  assert.deepEqual(revealResult({hidden: true, blocked: ["p1", "p2"]}, {playerIds: players, all: true}).blocked, []);
  // Hiding for one player of several
  assert.deepEqual(revealResult(flags, {playerIds: players, remove: ["p1"]}), {found: ["p2"], blocked: ["p1"]});
  assert.deepEqual(revealResult({hidden: true, found: [EVERYBODY]}, {playerIds: players, remove: ["p2"]}),
    {found: ["p1", "p3"], blocked: ["p2"]});
  // A blocked user does not discover by exploring, the others do
  const pins = [{id: "a", flags: {hidden: true, blocked: ["u1"]}, x: 1, y: 1}];
  assert.deepEqual(newlyExplored(pins, "u1", () => true), []);
  assert.deepEqual(newlyExplored(pins, "u2", () => true), ["a"]);
  assert.deepEqual(blockedList({blocked: ["a", "a", 1]}), ["a"]);
});

test("quest states", () => {
  assert.equal(cleanQuest("DONE"), "done");
  assert.equal(cleanQuest("nonsense"), "");
  assert.equal(cleanQuest(undefined), "");
  assert.deepEqual(["", "open", "done", "failed", ""].map(nextQuest), ["open", "done", "failed", "", "open"]);
});

test("empty hidden and quest flags are cleaned away", () => {
  assert.deepEqual(cleanFlags({hidden: false, quest: ""}, {hidden: true, quest: "open"}),
    {"-=hidden": null, "-=quest": null});
  assert.deepEqual(cleanFlags({hidden: true, quest: "done"}, {}), {hidden: true, quest: "done"});
  assert.equal(cleanFlags({hidden: false}, {}), null);
});

/* Routes */

test("a route measures its legs in the scene's units", () => {
  const stats = routeStats([{x: 0, y: 0}, {x: 300, y: 0}, {x: 300, y: 400}], {size: 100, distance: 5, speed: 3});
  assert.deepEqual(stats.legs, [15, 20]);
  assert.equal(stats.total, 35);
  assert.ok(Math.abs(stats.hours - (35 / 3)) < 1e-9);
  assert.deepEqual(routeStats([{x: 0, y: 0}], {size: 100, distance: 5, speed: 3}).legs, []);
  assert.equal(routeStats([{x: 0, y: 0}, {x: 100, y: 0}], {size: 100, distance: 5}).hours, 0);
  // A scene without a grid size or distance does not divide by zero
  assert.equal(routeStats([{x: 0, y: 0}, {x: 100, y: 0}], {size: 0, distance: 0, speed: 1}).total, 1);
});

test("travel time splits into days, hours and minutes", () => {
  assert.deepEqual(splitTime(11.5, 8), {days: 1, hours: 3, minutes: 30});
  assert.deepEqual(splitTime(0.25, 8), {days: 0, hours: 0, minutes: 15});
  assert.deepEqual(splitTime(16, 8), {days: 2, hours: 0, minutes: 0});
  assert.deepEqual(splitTime(-3, 8), {days: 0, hours: 0, minutes: 0});
  assert.deepEqual(splitTime(30, 24), {days: 1, hours: 6, minutes: 0});
});

test("distances are shown rounded", () => {
  assert.equal(roundDistance(35), "35");
  assert.equal(roundDistance(12.34), "12.3");
  assert.equal(roundDistance(123.6), "124");
  assert.equal(roundDistance(0), "0");
});

test("stops are cleaned and a player sees the route up to the first unseen pin", () => {
  assert.deepEqual(cleanStops(["a", "", 4, "b", "a"]), ["a", "b", "a"]);
  assert.deepEqual(cleanStops(["a", "x", "b"], new Set(["a", "b"])), ["a", "b"]);
  assert.deepEqual(cleanStops("a"), []);
  assert.equal(cleanStops(Array.from({length: 100}, (_, i) => `n${i}`)).length, MAX_STOPS);
  assert.deepEqual(visiblePrefix(["a", "b", "c", "d"], id => id !== "c"), ["a", "b"]);
  assert.deepEqual(visiblePrefix(["a"], () => false), []);
  assert.equal(cleanPace("fast"), "fast");
  assert.equal(cleanPace("warp"), "normal");
});

test("the dashed line has dashes of the right length and gaps between", () => {
  const segs = dashSegments([{x: 0, y: 0}, {x: 200, y: 0}], 20, 10);
  assert.equal(segs.length, 7);
  assert.deepEqual(segs[0], [0, 0, 20, 0]);
  assert.deepEqual(segs[1], [30, 0, 50, 0]);
  for ( const s of segs ) assert.ok(Math.abs(Math.hypot(s[2] - s[0], s[3] - s[1]) - 20) < 1e-6 || s[2] === 200);
  // The pattern carries on around a corner
  const bend = dashSegments([{x: 0, y: 0}, {x: 30, y: 0}, {x: 30, y: 30}], 20, 10);
  assert.deepEqual(bend[0], [0, 0, 20, 0]);
  assert.deepEqual(bend[1], [30, 0, 30, 20]);
  assert.deepEqual(dashSegments([{x: 0, y: 0}], 20, 10), []);
  assert.deepEqual(dashSegments([{x: 5, y: 5}, {x: 5, y: 5}], 20, 10), []);
});

/* Map key */

test("key pins come in number order and only the numbered ones", () => {
  const pins = [{id: "a", number: "10"}, {id: "b", number: "2"}, {id: "c", number: ""}, {id: "d", number: "2"},
    {id: "e", number: "B1"}, {id: "f", number: "1"}];
  assert.deepEqual(keyPins(pins).map(p => p.id), ["f", "b", "d", "a", "e"]);
  assert.ok(compareNumbers("9", "10") < 0);
  assert.equal(cleanKeyText("full"), "full");
  assert.equal(cleanKeyText("x"), "lines");
});

test("a key page is escaped and shows the lines", () => {
  const html = keyPageHtml({title: "Hall <b>", link: "@UUID[JournalEntry.x]{Hall}", category: "Quest", quest: "Open",
    blocks: [{kind: "p", text: "A & B"}, {kind: "li", text: "one"}, {kind: "li", text: "two"}, {kind: "h", text: "Head"}]});
  assert.match(html, /<strong>@UUID\[JournalEntry\.x\]\{Hall\}<\/strong>/);
  assert.match(html, /<em>Quest · Open<\/em>/);
  assert.match(html, /<p>A &amp; B<\/p>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<h3>Head<\/h3>/);
  const plain = keyPageHtml({title: "Hall <b>"});
  assert.equal(plain, "<p><strong>Hall &lt;b&gt;</strong></p>");
});

test("a regenerated page keeps what the GM added", () => {
  const previous = "<p><strong>Hall</strong></p><p>Old text</p>";
  const next = "<p><strong>Hall</strong></p><p>New text</p>";
  assert.deepEqual(mergeGenerated(previous, previous, next), {content: next, state: "replaced"});
  assert.deepEqual(mergeGenerated(next, previous, next), {content: next, state: "same"});
  const extended = `<p>GM intro</p>${previous}<p>My notes</p>`;
  assert.deepEqual(mergeGenerated(extended, previous, next), {content: `<p>GM intro</p>${next}<p>My notes</p>`,
    state: "replaced"});
  // The editor changed the markup a little: the generated part is still found on the normalized text
  const reformatted = "<p><strong>Hall</strong></p>\n<p>Old text</p><p>My notes</p>";
  const merged = mergeGenerated(reformatted, previous, next);
  assert.equal(merged.state, "replaced");
  assert.match(merged.content, /New text.*My notes/);
  // The GM rewrote the generated part: the page is kept
  assert.equal(mergeGenerated("<p>Totally mine</p>", previous, next).state, "kept");
  // Nothing known about an earlier text: the page is rewritten
  assert.equal(mergeGenerated("<p>x</p>", "", next).state, "replaced");
  assert.equal(normalizeHtml("<p>a</p>  <p>b &quot;c&quot;</p>"), "<p>a</p><p>b \"c\"</p>");
});

test("the key update creates, updates, removes and keeps pages", () => {
  const pins = [{id: "n1", number: "1", html: "<p>one new</p>"}, {id: "n2", number: "2", html: "<p>two</p>"},
    {id: "n3", number: "3", html: "<p>three</p>"}];
  const pages = [
    {id: "p1", pin: "n1", content: "<p>one</p>", generated: "<p>one</p>"},
    {id: "p3", pin: "n3", content: "<p>mine</p>", generated: "<p>three old</p>"},
    {id: "p9", pin: "gone", content: "<p>old</p>", generated: "<p>old</p>"},
    {id: "p8", pin: "gone2", content: "<p>edited</p>", generated: "<p>old</p>"}
  ];
  const plan = planKey(pins, pages);
  assert.deepEqual(plan.create.map(c => c.pin), ["n2"]);
  assert.deepEqual(plan.update.map(u => [u.id, u.index, u.content]),
    [["p1", 0, "<p>one new</p>"], ["p3", 2, null]]);
  assert.deepEqual(plan.remove, ["p9"]);
  assert.deepEqual(plan.kept.sort(), ["p3", "p8"]);
});
