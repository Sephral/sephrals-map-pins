import assert from "node:assert/strict";
import {test} from "node:test";
import {assignNumbers, cleanCategories, cleanFlags, cleanNumber, cleanPlayerPin, constantScale, decodeEntities,
  fromPinCushion, hiddenPrivatePin, hiddenByZoom, htmlToText, mayEditPin, nextNumber, numberFromName, orderPins,
  plainEnrichers, previewAccess, previewFromHtml, previewFromMarkdown, resolveStyle, safeImageSrc, textToHtml,
  worldDefaults} from "../scripts/pin-logic.mjs";

test("world defaults fill in what is missing", () => {
  const w = worldDefaults({});
  assert.equal(w.labelMode, "hover");
  assert.equal(w.noBackground, false);
  assert.equal(w.preview, true);
  assert.equal(w.constantScale, 100);
  assert.equal(worldDefaults({constantScale: 5}).constantScale, 25);
  assert.equal(worldDefaults({labelMode: "nonsense"}).labelMode, "hover");
});

test("the pin's own choice wins over the world", () => {
  const world = {labelMode: "always", noBackground: true, constantSize: true, minZoom: 20};
  const pick = ({label, noBackground, constantSize, minZoom, preview}) => ({label, noBackground, constantSize, minZoom, preview});
  assert.deepEqual(pick(resolveStyle(world, {})),
    {label: "always", noBackground: true, constantSize: true, minZoom: 20, preview: true});
  const own = resolveStyle(world, {label: "hover", background: "box", size: "scene", minZoom: 0, preview: "off"});
  assert.equal(own.label, "hover");
  assert.equal(own.noBackground, false);
  assert.equal(own.constantSize, false);
  assert.equal(own.minZoom, 0);
  assert.equal(own.preview, false);
  assert.equal(resolveStyle({}, {minZoom: "35"}).minZoom, 35);
  assert.equal(resolveStyle({}, {minZoom: ""}).minZoom, 0);
});

test("a category gives color and symbol only", () => {
  const style = resolveStyle({}, {}, {id: "q", name: "Quest", color: "#112233", icon: "icons/svg/book.svg"});
  assert.equal(style.color, "#112233");
  assert.equal(style.icon, "icons/svg/book.svg");
  assert.equal(resolveStyle({}, {}, null).color, null);
});

test("constant size and hiding by zoom", () => {
  assert.equal(constantScale(0.5), 2);
  assert.equal(constantScale(2, 50), 0.25);
  assert.equal(constantScale(0), 1);
  assert.equal(hiddenByZoom(0.2, 30), true);
  assert.equal(hiddenByZoom(0.3, 30), false);
  assert.equal(hiddenByZoom(0.01, 0), false);
});

test("numbers from journal names", () => {
  assert.deepEqual(numberFromName("12. Hall"), {number: "12", name: "Hall"});
  assert.deepEqual(numberFromName("B3) Cellar"), {number: "B3", name: "Cellar"});
  assert.deepEqual(numberFromName("7 - The tower"), {number: "7", name: "The tower"});
  assert.deepEqual(numberFromName("4:Gate"), {number: "4", name: "Gate"});
  assert.equal(numberFromName("3 goblins"), null);
  assert.equal(numberFromName("1st floor"), null);
  assert.equal(numberFromName("Hall"), null);
  assert.equal(numberFromName("12."), null);
  assert.equal(numberFromName(null), null);
});

test("clean numbers", () => {
  assert.equal(cleanNumber(" 12 "), "12");
  assert.equal(cleanNumber("B3"), "B3");
  assert.equal(cleanNumber("a b"), "");
  assert.equal(cleanNumber("123456789"), "");
  assert.equal(cleanNumber(""), "");
});

test("the next number goes one above the highest", () => {
  assert.equal(nextNumber([]), "1");
  assert.equal(nextNumber(["1", "2", "5"]), "6");
  assert.equal(nextNumber(["B3", "B7"]), "B8");
  assert.equal(nextNumber(["1", "2", "B9"]), "3");
  assert.equal(nextNumber(["x", ""]), "1");
  assert.equal(nextNumber(["09"]), "10");
  assert.equal(nextNumber(["007"]), "008");
});

test("ordering pins", () => {
  const pins = [
    {id: "a", x: 500, y: 20, name: "B", sort: 3},
    {id: "b", x: 100, y: 30, name: "A", sort: 2},
    {id: "c", x: 300, y: 400, name: "C 10", sort: 1},
    {id: "d", x: 50, y: 410, name: "C 9", sort: 0}
  ];
  assert.deepEqual(orderPins(pins, "reading").map(p => p.id), ["b", "a", "d", "c"]);
  assert.deepEqual(orderPins(pins, "columns").map(p => p.id), ["d", "b", "c", "a"]);
  assert.deepEqual(orderPins(pins, "name").map(p => p.id), ["b", "a", "d", "c"]);
  assert.deepEqual(orderPins(pins, "listed").map(p => p.id), ["d", "c", "b", "a"]);
  assert.equal(pins[0].id, "a", "the input is not changed");
});

test("assigning numbers", () => {
  const pins = [{id: "a"}, {id: "b", number: "2"}, {id: "c"}];
  assert.deepEqual(assignNumbers(pins, {}), [{id: "a", number: "1"}, {id: "c", number: "3"}]);
  assert.deepEqual(assignNumbers(pins, {keep: true}), [{id: "a", number: "1"}, {id: "c", number: "3"}]);
  assert.deepEqual(assignNumbers([{id: "a"}, {id: "b"}], {prefix: "B7", start: 4}),
    [{id: "a", number: "B4"}, {id: "b", number: "B5"}]);
  assert.deepEqual(assignNumbers([{id: "a", number: "5"}, {id: "b"}], {keep: true, start: 5}), [{id: "b", number: "6"}]);
  assert.deepEqual(assignNumbers([{id: "a", number: "1"}, {id: "b", number: "2"}], {}), []);
});

test("rights of the preview", () => {
  assert.equal(previewAccess({isGM: true, hasEntry: true, canObserve: false, canLimited: false}), "full");
  assert.equal(previewAccess({isGM: false, hasEntry: true, canObserve: true, canLimited: true}), "full");
  assert.equal(previewAccess({isGM: false, hasEntry: true, canObserve: false, canLimited: true}), "title");
  assert.equal(previewAccess({isGM: false, hasEntry: true, canObserve: false, canLimited: false}), "none");
  assert.equal(previewAccess({isGM: false, hasEntry: false, canObserve: false, canLimited: false}), "own");
});

test("entities and enrichers", () => {
  assert.equal(decodeEntities("a &amp; b &lt;i&gt; &#65; &#x42; &nbsp;x &bogus;"), "a & b <i> A B  x &bogus;");
  assert.equal(plainEnrichers("see @UUID[Actor.abc]{the Orc} and @UUID[x] [[/r 1d20]] [[1d6]]{dmg}"),
    "see the Orc and   dmg");
  assert.equal(plainEnrichers("&Reference[Prone]"), "");
});

test("image addresses", () => {
  assert.equal(safeImageSrc("worlds/test/a.webp"), "worlds/test/a.webp");
  assert.equal(safeImageSrc("https://example.org/a.png"), "https://example.org/a.png");
  assert.equal(safeImageSrc("javascript:alert(1)"), "");
  assert.equal(safeImageSrc("data:image/png;base64,AAAA"), "");
  assert.equal(safeImageSrc("//evil.example/x.png"), "");
  assert.equal(safeImageSrc("a.png\" onerror=\"x"), "");
  assert.equal(safeImageSrc(""), "");
});

test("preview from html keeps text only", () => {
  const html = `<h2>The Hall</h2><p>First <strong>line</strong> with <a href="javascript:alert(1)" onclick="x()">a link</a>.</p>
    <script>alert("x")</script><style>p{color:red}</style><ul><li>One</li><li>Two &amp; three</li></ul>
    <img src="worlds/test/hall.webp" onerror="alert(1)"><p onmouseover="evil()">Last</p>`;
  const r = previewFromHtml(html, {maxChars: 500});
  assert.deepEqual(r.blocks, [
    {kind: "h", text: "The Hall"},
    {kind: "p", text: "First line with a link."},
    {kind: "li", text: "One"},
    {kind: "li", text: "Two & three"},
    {kind: "p", text: "Last"}
  ]);
  assert.equal(r.image, "worlds/test/hall.webp");
  assert.equal(r.truncated, false);
  assert.ok(!JSON.stringify(r).includes("alert"));
  assert.ok(!JSON.stringify(r).includes("evil"));
});

test("secret sections never reach the preview", () => {
  const html = `<p>Open</p><section class="secret" id="secret-1"><p>The king is a lich.</p><section><p>nested</p></section>
    <p>more</p></section><p>After</p><section class='x secret'><p>Another secret</p></section>`;
  const r = previewFromHtml(html);
  assert.deepEqual(r.blocks.map(b => b.text), ["Open", "After"]);
  assert.ok(!JSON.stringify(r).includes("lich"));
  assert.ok(!JSON.stringify(r).includes("secret"));
});

test("an image inside a secret is not taken", () => {
  const r = previewFromHtml(`<section class="secret"><img src="secret.png"></section><img src="b.png"><img src="c.png">`);
  assert.equal(r.image, "b.png");
});

test("scripts in odd places stay out", () => {
  const r = previewFromHtml(`<p>a</p><SCRIPT type="x">document.write("<p>pwn</p>")</SCRIPT><p>b</p><iframe src="x"><p>in</p></iframe><p>c</p>`);
  assert.deepEqual(r.blocks.map(b => b.text), ["a", "b", "c"]);
  const broken = previewFromHtml(`<p>fine <b onclick="x">bold<p>next`);
  assert.deepEqual(broken.blocks.map(b => b.text), ["fine bold", "next"]);
  assert.deepEqual(previewFromHtml("").blocks, []);
  assert.deepEqual(previewFromHtml(null).blocks, []);
});

test("enrichers in the preview", () => {
  const r = previewFromHtml(`<p>Meet @UUID[Actor.x]{Bob}, roll [[/r 1d20]] now.</p>`);
  assert.equal(r.blocks[0].text, "Meet Bob, roll now.");
});

test("preview is cut at a word", () => {
  const r = previewFromHtml(`<p>${"word ".repeat(100)}</p><p>second</p>`, {maxChars: 42});
  assert.equal(r.truncated, true);
  assert.equal(r.blocks.length, 1);
  assert.ok(r.blocks[0].text.endsWith("…"));
  assert.ok(r.blocks[0].text.length <= 43);
  const r2 = previewFromHtml(`<p>one</p><p>two</p>`, {maxChars: 3});
  assert.deepEqual(r2.blocks.map(b => b.text), ["one"]);
  assert.equal(r2.truncated, true);
  assert.deepEqual(previewFromHtml(`<p>one</p>`, {maxChars: 0}).blocks, []);
});

test("preview from markdown", () => {
  const r = previewFromMarkdown("# Title\n\nSome *text* with [a link](http://x.y) and ![pic](img/a.png)\n- item\n> quote\n<script>x</script>");
  assert.deepEqual(r.blocks.map(b => b.kind), ["h", "p", "li", "quote", "p"]);
  assert.equal(r.blocks[1].text, "Some text with a link and");
  assert.equal(r.image, "img/a.png");
  assert.ok(!JSON.stringify(r.blocks).includes("<"));
});

test("clean flags drop empty choices", () => {
  assert.deepEqual(cleanFlags({label: "", number: "4", background: "none"}, {}), {number: "4", background: "none"});
  assert.deepEqual(cleanFlags({label: "", number: ""}, {label: "always"}), {"-=label": null});
  assert.equal(cleanFlags({label: ""}, {}), null);
  assert.deepEqual(cleanFlags({owner: "u1", private: true}, {}), {owner: "u1", private: true});
  assert.deepEqual(cleanFlags({minZoom: null, size: "constant"}, {minZoom: 20}), {"-=minZoom": null, size: "constant"});
  assert.equal(cleanFlags(null), null);
});

test("player pins are cleaned", () => {
  assert.equal(cleanPlayerPin({name: "   "}), null);
  const pin = cleanPlayerPin({name: "  A   very ".padEnd(200, "x"), text: "t".repeat(5000), color: "red", private: "yes"});
  assert.equal(pin.name.length, 60);
  assert.equal(pin.text.length, 1000);
  assert.equal(pin.color, "#c0392b");
  assert.equal(pin.private, false);
  assert.equal(cleanPlayerPin({name: "x", color: "#ABCDEF", private: true}).color, "#abcdef");
  assert.equal(cleanPlayerPin({name: "x", private: true}).private, true);
});

test("text to html and back", () => {
  const html = textToHtml("a <b> & \"c\"\n\nsecond line");
  assert.equal(html, "<p>a &lt;b&gt; &amp; &quot;c&quot;</p><p>second line</p>");
  assert.equal(htmlToText(html), "a <b> & \"c\"\nsecond line");
  assert.equal(textToHtml(""), "");
});

test("who may change a pin", () => {
  assert.equal(mayEditPin({owner: "u1"}, "u1", false), true);
  assert.equal(mayEditPin({owner: "u1"}, "u2", false), false);
  assert.equal(mayEditPin({}, "u2", false), false);
  assert.equal(mayEditPin({}, "gm", true), true);
});

test("private pins are hidden from others", () => {
  assert.equal(hiddenPrivatePin({private: true, owner: "u1"}, "u2", false), true);
  assert.equal(hiddenPrivatePin({private: true, owner: "u1"}, "u1", false), false);
  assert.equal(hiddenPrivatePin({private: true, owner: "u1"}, "gm", true), false);
  assert.equal(hiddenPrivatePin({private: false, owner: "u1"}, "u2", false), false);
  assert.equal(hiddenPrivatePin(undefined, "u2", false), false);
});

test("categories are cleaned", () => {
  const list = cleanCategories([{id: "q", name: " Quest ", color: "#ABCDEF", icon: "a.svg"}, {name: ""},
    {id: "q", name: "Dup", color: "bad"}, null]);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, "Quest");
  assert.equal(list[0].color, "#abcdef");
  assert.notEqual(list[1].id, "q");
  assert.equal(list[1].color, "#9c3b22");
  assert.deepEqual(cleanCategories("x"), []);
});

test("Pin Cushion flags are translated", () => {
  assert.deepEqual(fromPinCushion(null), {});
  assert.deepEqual(fromPinCushion({}), {});
  assert.deepEqual(fromPinCushion({textAlwaysVisible: true, hasBackground: 1, tooltipCustomDescription: "Look here"}),
    {label: "always", background: "box", previewText: "Look here"});
  assert.deepEqual(fromPinCushion({hasBackground: 0, doNotShowJournalPreview: "true"}),
    {background: "none", preview: "off"});
  assert.deepEqual(fromPinCushion({pinIsTransparent: true}), {background: "none"});
  assert.deepEqual(fromPinCushion({hideLabel: true, textAlwaysVisible: true}), {label: "never"});
  assert.deepEqual(fromPinCushion({tooltipCustomDescription: "<p>Hi <b>there</b></p>", showImageExplicitSource: "a/b.png"}),
    {previewText: "Hi there", previewImage: "a/b.png"});
  assert.deepEqual(fromPinCushion({showImageExplicitSource: "javascript:x"}), {});
});
