import assert from "node:assert/strict";
import {test} from "node:test";
import {AREA_KEYS, areaAt, areaFlags, areaName, areaPolygon, areaStyle, boundsOf, isArea, labelFontSize,
  newlyExploredAreas, pointInPolygon, polygonArea, samplePoints} from "../scripts/area-logic.mjs";
import {TRAIL_MAX, addToTrail, buildLinks, cleanTrail, formatWorldTime, linksTo, locateOnMap, pickPartyScene, pinChain,
  trailStops} from "../scripts/party-logic.mjs";

/* Where the party is */

const valid = new Set(["a", "b", "c", "d"]);

test("the GM's own choice wins", () => {
  assert.deepEqual(pickPartyScene({manual: "c", viewed: ["a"], active: "b", valid}), {scene: "c", source: "manual"});
  // A scene that no longer exists is ignored
  assert.equal(pickPartyScene({manual: "gone", active: "b", valid}).scene, "b");
});

test("all online players looking at one scene is where the party is", () => {
  assert.deepEqual(pickPartyScene({viewed: ["b", "b"], active: "a", valid}), {scene: "b", source: "players"});
  // Players without a canvas yet do not count
  assert.equal(pickPartyScene({viewed: [null, "b", ""], active: "a", valid}).scene, "b");
});

test("players apart keep the party in the active scene", () => {
  assert.deepEqual(pickPartyScene({viewed: ["b", "c"], active: "a", valid}), {scene: "a", source: "active"});
  assert.deepEqual(pickPartyScene({viewed: [], active: "a", valid}), {scene: "a", source: "active"});
});

test("without an active scene the most player tokens decide", () => {
  assert.deepEqual(pickPartyScene({tokens: {a: 1, b: 3, gone: 9}, valid}), {scene: "b", source: "tokens"});
  assert.deepEqual(pickPartyScene({tokens: {b: 2, a: 2}, valid}), {scene: "a", source: "tokens"});
  assert.equal(pickPartyScene({valid}), null);
});

/* Maps above */

const links = buildLinks([
  {id: "n1", scene: "town", target: "dungeon", x: 10, y: 20},
  {id: "n2", scene: "region", target: "town", x: 300, y: 400},
  {id: "n3", scene: "world", target: "region", x: 5, y: 6},
  {id: "n4", scene: "region", target: "region", x: 1, y: 1},
  {id: "n5", scene: "region", x: 2, y: 2},
  {id: "n6", scene: "world", target: "town", x: 7, y: 8}
]);

test("only pins that open another scene are links", () => {
  assert.deepEqual(links.map(l => l.id), ["n1", "n2", "n3", "n6"]);
  assert.deepEqual(linksTo(links, "town").map(l => l.id), ["n2", "n6"]);
});

test("the chain follows the maps above a place", () => {
  const chain = pinChain(links, "dungeon");
  assert.deepEqual(chain.map(c => [c.id, c.depth]), [["n1", 0], ["n2", 1], ["n6", 1], ["n3", 2]]);
  assert.deepEqual(pinChain(links, "dungeon", 1).map(c => c.id), ["n1"]);
  assert.deepEqual(pinChain(links, "world"), []);
});

test("a circle of links ends", () => {
  const circle = buildLinks([{id: "x", scene: "a", target: "b", x: 0, y: 0}, {id: "y", scene: "b", target: "a", x: 0, y: 0}]);
  assert.equal(pinChain(circle, "a").length, 2);
});

test("a place shows on a map by the nearest pin", () => {
  assert.deepEqual(locateOnMap(links, "dungeon", "town"), {id: "n1", x: 10, y: 20, depth: 0});
  assert.equal(locateOnMap(links, "dungeon", "region").id, "n2");
  assert.equal(locateOnMap(links, "dungeon", "world").id, "n6");
  assert.equal(locateOnMap(links, "dungeon", "nowhere"), null);
  assert.equal(locateOnMap(links, "world", "town"), null);
});

/* The trail */

test("the trail keeps clean places and stays short", () => {
  assert.deepEqual(cleanTrail([{scene: "a", time: 5}, {scene: "", time: 1}, {scene: "b", time: "x"}, null, {scene: "c", time: 9}]),
    [{scene: "a", time: 5}, {scene: "c", time: 9}]);
  assert.deepEqual(cleanTrail("nope"), []);
  let trail = [];
  for ( let i = 0; i < TRAIL_MAX + 10; i++ ) trail = addToTrail(trail, `s${i}`, i);
  assert.equal(trail.length, TRAIL_MAX);
  assert.equal(trail.at(-1).scene, `s${TRAIL_MAX + 9}`);
});

test("staying in a place adds nothing to the trail", () => {
  let trail = addToTrail([], "a", 10);
  trail = addToTrail(trail, "a", 20);
  trail = addToTrail(trail, "b", 30);
  trail = addToTrail(trail, "a", 40);
  assert.deepEqual(trail, [{scene: "a", time: 10}, {scene: "b", time: 30}, {scene: "a", time: 40}]);
  assert.deepEqual(addToTrail(trail, "", 50), trail);
});

test("the trail on a map joins following places at one pin", () => {
  const trail = [{scene: "town", time: 1}, {scene: "dungeon", time: 2}, {scene: "elsewhere", time: 3}, {scene: "far", time: 4},
    {scene: "town", time: 5}];
  const locate = id => ({town: {id: "p1", x: 1, y: 1}, dungeon: {id: "p1", x: 1, y: 1}, far: {id: "p2", x: 9, y: 9}})[id] ?? null;
  assert.deepEqual(trailStops(trail, locate), [
    {id: "p1", x: 1, y: 1, times: [1, 2]}, {id: "p2", x: 9, y: 9, times: [4]}, {id: "p1", x: 1, y: 1, times: [5]}]);
  assert.equal(trailStops(trail, locate, 2).length, 2);
});

test("a world time shows as a date, with a fallback", () => {
  assert.equal(formatWorldTime(0, () => "1970-01-01 08:30:00"), "1970-01-01 08:30");
  assert.equal(formatWorldTime(0, () => "Day of Ash"), "Day of Ash");
  assert.equal(formatWorldTime(86400 * 2.5), "#3");
  assert.equal(formatWorldTime(5, () => { throw new Error("no calendar"); }), "#1");
  assert.equal(formatWorldTime(-5), "#1");
  const label = (day, clock) => `Day ${day}, ${clock}`;
  assert.equal(formatWorldTime(86400 * 2 + 900, () => "0000-01-03 00:15:00", label), "Day 3, 00:15");
  assert.equal(formatWorldTime(0, () => "1492-05-01 08:30:00", label), "1492-05-01 08:30");
});

/* Areas */

const rect = {x: 100, y: 100, rotation: 0, shape: {type: "r", width: 200, height: 100}};

test("the corners of a rectangle", () => {
  assert.deepEqual(areaPolygon(rect), [{x: 100, y: 100}, {x: 300, y: 100}, {x: 300, y: 200}, {x: 100, y: 200}]);
  assert.deepEqual(boundsOf(areaPolygon(rect)), {x: 100, y: 100, width: 200, height: 100});
});

test("a rotated rectangle turns about its middle", () => {
  const box = boundsOf(areaPolygon({...rect, rotation: 90}));
  assert.ok(Math.abs(box.x - 150) < 1e-9);
  assert.ok(Math.abs(box.y - 50) < 1e-9);
  assert.ok(Math.abs(box.width - 100) < 1e-9);
  assert.ok(Math.abs(box.height - 200) < 1e-9);
});

test("a polygon uses its points, an ellipse is round", () => {
  const poly = areaPolygon({x: 10, y: 20, rotation: 0, shape: {type: "p", width: 50, height: 50, points: [0, 0, 50, 0, 25, 50]}});
  assert.deepEqual(poly, [{x: 10, y: 20}, {x: 60, y: 20}, {x: 35, y: 70}]);
  const round = areaPolygon({x: 0, y: 0, rotation: 0, shape: {type: "e", width: 200, height: 100}});
  assert.equal(pointInPolygon({x: 100, y: 50}, round), true);
  assert.equal(pointInPolygon({x: 5, y: 5}, round), false);
  assert.equal(areaPolygon({}).length, 4);
});

test("a point is in a shape or not", () => {
  const poly = areaPolygon(rect);
  assert.equal(pointInPolygon({x: 150, y: 150}, poly), true);
  assert.equal(pointInPolygon({x: 350, y: 150}, poly), false);
  assert.equal(polygonArea(poly), 20000);
});

test("the smallest area under the pointer wins", () => {
  const big = {id: "realm", polygon: areaPolygon({x: 0, y: 0, rotation: 0, shape: {type: "r", width: 1000, height: 1000}})};
  const small = {id: "town", polygon: areaPolygon({x: 100, y: 100, rotation: 0, shape: {type: "r", width: 100, height: 100}})};
  assert.equal(areaAt([big, small], {x: 150, y: 150}), "town");
  assert.equal(areaAt([big, small], {x: 500, y: 500}), "realm");
  assert.equal(areaAt([big, small], {x: 1500, y: 500}), null);
});

test("sample points lie inside the shape", () => {
  const tri = areaPolygon({x: 0, y: 0, rotation: 0, shape: {type: "p", points: [0, 0, 600, 0, 300, 600]}});
  const points = samplePoints(tri);
  assert.ok(points.length > 3);
  for ( const p of points ) assert.equal(pointInPolygon(p, tri), true);
  // A shape too thin for the grid still gets points
  const thin = areaPolygon({x: 0, y: 0, rotation: 0, shape: {type: "r", width: 1000, height: 0}});
  assert.ok(samplePoints(thin).length > 0);
});

test("an area is found when one of its points is explored", () => {
  const areas = [
    {id: "a", flags: {hidden: true}, samples: [{x: 1, y: 1}, {x: 900, y: 900}]},
    {id: "b", flags: {hidden: true}, samples: [{x: 800, y: 800}]},
    {id: "c", flags: {}, samples: [{x: 1, y: 1}]},
    {id: "d", flags: {hidden: true, found: ["u1"]}, samples: [{x: 1, y: 1}]},
    {id: "e", flags: {hidden: true, blocked: ["u1"]}, samples: [{x: 1, y: 1}]}
  ];
  const explored = ({x}) => x < 500;
  assert.deepEqual(newlyExploredAreas(areas, "u1", explored), ["a"]);
  assert.deepEqual(newlyExploredAreas(areas, "u2", explored), ["a", "d", "e"]);
  assert.deepEqual(newlyExploredAreas(areas, "u1", explored, new Set(["a"])), []);
});

test("the label is as large as the shape allows", () => {
  assert.equal(labelFontSize(2000, 1200, "Kingdom of Ash"), 160);
  assert.equal(labelFontSize(100, 2000, "Kingdom of Ash"), 24);
  assert.ok(labelFontSize(800, 800, "Ash") >= 24);
  const mid = labelFontSize(900, 600, "Kingdom of Ash");
  assert.ok((mid > 24) && (mid < 160));
});

test("an area takes the colors of its category", () => {
  const style = areaStyle("#C0392B");
  assert.equal(style.fillColor, "#c0392b");
  assert.equal(style.strokeColor, "#c0392b");
  assert.equal(style.fillType, 1);
  assert.equal(areaStyle("").fillColor, "#8a7a5a");
  assert.equal(areaStyle("red").fillColor, "#8a7a5a");
});

test("the flags of a new area keep only what is filled", () => {
  assert.deepEqual(areaFlags({}), {area: true});
  assert.deepEqual(areaFlags({category: "danger", entry: "j1", page: "p1", previewText: " Beware ", hidden: true}),
    {area: true, category: "danger", entry: "j1", page: "p1", previewText: "Beware", hidden: true});
  // A page without a journal is dropped, hidden must be true to count
  assert.deepEqual(areaFlags({page: "p1", hidden: "yes"}), {area: true});
  assert.equal(areaFlags({previewText: "x".repeat(900)}).previewText.length, 600);
  assert.ok(Object.keys(areaFlags({category: "a", entry: "b", page: "c", previewText: "d", hidden: true}))
    .every(key => AREA_KEYS.includes(key)));
});

test("only a flagged drawing is an area", () => {
  assert.equal(isArea({area: true}), true);
  assert.equal(isArea({area: "true"}), false);
  assert.equal(isArea({}), false);
  assert.equal(isArea(undefined), false);
  assert.equal(areaName("  Kingdom   of Ash ", "x"), "Kingdom of Ash");
  assert.equal(areaName("", "Unnamed"), "Unnamed");
});

/* Picture placement and the grouped trail */

import {backgroundBox, groupByDate} from "../scripts/party-logic.mjs";

test("a picture without settings fills the scene rectangle", () => {
  const box = backgroundBox(null, {width: 4000, height: 3000}, {width: 800, height: 600});
  assert.deepEqual([box.left, box.top, box.width, box.height], [0, 0, 4000, 3000]);
  // Foundry 14's defaults with the anchor in the middle give the same
  const mid = backgroundBox({fit: "fill", anchorX: 0.5, anchorY: 0.5}, {width: 4000, height: 3000}, {width: 800, height: 600});
  assert.deepEqual([mid.left, mid.top, mid.width, mid.height], [0, 0, 4000, 3000]);
});

test("fit, scale and offset move the picture like Foundry 14 does", () => {
  const rect = {width: 1000, height: 1000};
  const natural = {width: 2000, height: 1000};
  const contain = backgroundBox({fit: "contain", anchorX: 0.5, anchorY: 0.5}, rect, natural);
  assert.deepEqual([contain.left, contain.top, contain.width, contain.height], [0, 250, 1000, 500]);
  const cover = backgroundBox({fit: "cover", anchorX: 0.5, anchorY: 0.5}, rect, natural);
  assert.deepEqual([cover.left, cover.width, cover.height], [-500, 2000, 1000]);
  const moved = backgroundBox({fit: "fill", scaleX: 2, scaleY: 2, offsetX: 100, offsetY: -50, anchorX: 0, anchorY: 0}, rect, natural);
  assert.deepEqual([moved.left, moved.top, moved.width, moved.height], [600, 450, 2000, 2000]);
  const flipped = backgroundBox({scaleX: -1, rotation: 90}, rect, natural);
  assert.equal(flipped.flipX, true);
  assert.equal(flipped.rotation, 90);
});

test("trail rows with one date are shown together", () => {
  const rows = groupByDate([
    {date: "D1", name: "Port", known: true}, {date: "D1", name: "Dungeon", known: true}, {date: "D1", name: "Cave", known: false},
    {date: "D0", name: "Town", known: true}, {date: "D1", name: "Port", known: true}]);
  assert.deepEqual(rows, [{date: "D1", names: "Port, Dungeon, Cave", unknown: false}, {date: "D0", names: "Town", unknown: false},
    {date: "D1", names: "Port", unknown: false}]);
  assert.equal(groupByDate([{date: "D", name: "X", known: false}])[0].unknown, true);
  assert.deepEqual(groupByDate([]), []);
});
