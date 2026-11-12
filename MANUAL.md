# Sephral’s Map Pins: Manual

Map Pins changes how Foundry's map notes (the pins on a scene) look and gives you a list, a preview, pins that players set, pins that players discover, quest marks, a map key and routes with travel time. Everything works on normal Foundry notes. Switch the module off and every pin is still a valid note, only the extras are gone.

## The note dialog

Open a pin with a double click in the notes controls, or *Edit* in the pin list. Below Foundry's own sections there is a section *Map Pins*:

| Field | What it does |
| --- | --- |
| Label | *Always*, *Only on hover* or *Never* for this pin. Empty follows the world setting. |
| Background | With or without the dark box and frame behind the symbol. |
| Size on zoom | *Keeps its size on the screen* or *Scales with the map*. |
| Hide below zoom | The zoom in percent below which this pin disappears. 0 never hides it, empty follows the world setting. |
| Number | A number or short code like `12` or `B3`, up to eight letters and digits. It shows as a badge at the corner of the pin. |
| Category | A category of the world. The pin gets a ring in its color and the category's symbol when the pin has no image of its own. |
| Preview on hover | Switch the preview card on or off for this pin. |
| Own preview text and picture | Replace the first lines and the picture of the journal in the preview. |
| Opens a scene | A double click switches the view to this scene instead of opening the journal. |
| Hidden until discovered | Players do not see this pin until they discover it. See *Pins you discover*. A button opens the window to reveal it for players. |
| Quest | *Quest open*, *Quest done* or *Quest failed* shows as a small mark on the pin. See *Quest marks*. |

Above the fields a small picture shows the image of the pin. It follows the icon fields of Foundry's dialog. The image itself is Foundry's own field *Custom Icon*.

A choice that is empty is not stored. The note keeps only what you changed.

## The pin list

The list shows every pin of the viewed scene with its number, symbol, name and category. Open it with *Pin list* in the notes controls, with the button in the module settings, with a key you choose in Foundry's key settings, or from a macro.

* The search finds by name, number and category.
* A click on a pin pans the map to it and pings it. A double click opens it like Foundry does.
* The category buttons above the list hide a category on the map and in the list, for you only. The choice is kept in your browser.
* A player sees only the pins they may see. The GM sees all of them. On Foundry 14, pins on another level are marked.
* The GM has buttons for numbering, for the categories, for the map key and for the route. A player has *New pin* when players may set pins, and the route button when routes are open to players or the GM shared one.
* Every row shows the quest state. On the GM's list a pin that is hidden until discovered shows *Hidden* with the number of players who found it, and has buttons to reveal it, to change the quest state and to add it to the route.
* A pin that a player has not discovered yet is not in that player's list.

## Pins you discover

A pin can be *hidden until discovered*. Tick the field *Hidden until discovered* in the note dialog, use *Hide until discovered* in the pin menu, or let the world setting *New pins are hidden until discovered* do it for every new pin. Players then do not see the pin on the map, in the pin list or in the preview before they discover it. The GM sees every pin as before, a hidden one with a small purple mark.

A player discovers a pin in two ways:

* **By exploring.** The player's browser looks at Foundry's own fog exploration. As soon as the place of a hidden pin is in ground the player has explored, or in sight of one of their tokens, the browser tells the active GM, who writes the player into the pin. This is checked when the exploration changes and when the scene loads, for each player alone. Reveals made with Sephral's Map Knowledge count as well, because they write into the same exploration. It needs token vision and fog exploration on the scene. On a scene without them a hidden pin waits for the GM. The setting *Players discover pins by exploring* turns it off.
* **By the GM.** Right click a pin and choose *Reveal for players*, use the eye button in the pin list or the button in the note dialog. The window offers *For everyone*, *For ticked* (the ticked players see it, the others do not) and *Hide again*. The API does the same.

A pin stays discovered for the player. The list of players who found it is part of the pin (`found`). When a pin appears for a player, a short ping and a note show where it is (setting *Ping and note when a pin appears*).

*Hide again* hides the pin from the players who knew it and keeps it hidden even where they already explored. Revealing it for them again lifts that. Players who never knew the pin can still find it by exploring.

## Quest marks

A pin can have a quest state: open, done or failed. It shows as a small round mark at the lower right of the pin, in orange, green or red, and in the preview card and the pin list. The GM sets it in the note dialog, in the pin menu, with the flag button in the pin list (it goes through open, done, failed and none), or with `api.setQuest`. Players see the state of the pins they see and cannot change it. The map key lists the state on each page. The state lives on the pin only, it is not synced with text in the journal.

## The pin menu

A right click on a pin (without moving the mouse, so panning the map still works) opens a small menu. For the GM it holds: reveal for players, stop hiding, reveal for everyone, hide until discovered, the quest states, add to route and the pin settings. A player sees *Add to route* when routes are open to players.

## The map key

*Make map key* in the pin list (or the notes control *Map key*, or `api.mapKey`) creates the journal *Map key: <scene>*, with one page for every numbered pin in number order. A page holds the number and title, a link to the pin's journal, the category, the quest state, a note when the pin is hidden until discovered, and the text. You choose *First lines of the journal* (or the pin's own preview text), *Full text of the journal* or *Only title and link*. Secret sections of journals never appear. The journal is for the GM only until you change its ownership.

Click the button again after the map changed. Only the generated part of each page is rewritten:

* Text you wrote before or after the generated part stays.
* A page whose generated part you rewrote yourself is kept as it is, and the dialog counts it as kept.
* A new numbered pin gets a new page in its place, and a page of a pin that lost its number goes, unless you changed it.

## Routes and travel time

*Route* in the notes controls (or in the pin list) opens the route window. The GM picks pins in order: with *Pick pins on the map* and a click on each pin, with *Add to route* from the pin menu or the list, or with *Through all numbered pins*. A stop can move up or down and be removed. The window shows the distance of each leg and of the whole route in the scene's units (the scene's grid distance and unit, measured along the drawn line), and the travel time at the chosen pace. The route is drawn on the map as a dashed line with a numbered dot at each stop.

* The GM's route is stored on the scene and drawn for the GM only. *Show to players* shares it: players then see the line and a read only window, up to the first pin they have not discovered, so the route never gives away a hidden pin.
* With *Players can build routes* every player builds a route of their own, kept in their browser and drawn for them only.
* The pace (slow, normal, fast) is set by the GM in the route window or the settings. The speeds are settings in the scene's units per hour, and *Hours of travel per day* turns hours into days. Set them for the scale of your maps.

## Categories

The GM edits the categories in the pin list or in the module settings: a name, a color and a symbol (any image, or one of Foundry's note icons from the list). *Add examples* gives quest, shop and danger. A pin in a category shows a ring in its color. When the pin has no image of its own, it shows the symbol of the category too. A pin with its own image keeps it.

## The preview card

When the pointer rests on a pin for a moment, a card shows the title, the first picture and the first lines of the journal. It follows Foundry's rights:

* The GM and users with at least Observer permission on the page (or the whole entry) see the text and the picture.
* Users with Limited permission see only the title.
* Others see nothing of the journal. On Foundry a pin whose journal is hidden from you is not shown at all.
* Pages you may not observe are skipped. The first readable text page and the first picture are used.

The text is reduced to plain lines. Secret sections, scripts, links and styles of the journal never reach the card, and links and rolls written for Foundry's text editor show as their plain text. If the pin has an own preview text or picture, they replace the journal's lines and picture for users who may read the journal. For users with only Limited permission the title stays the only thing shown.

The length of the text is a setting. The preview can be switched off for the world and for a single pin.

## Numbers

A pin shows a number as a badge. Where the number comes from:

* The field *Number* of the pin.
* The name of its journal, when the world setting *Take pin numbers from journal names* is on: a journal called `12. Hall` gives its pin the number 12, and the label shows `Hall`. A name like `3 goblins` or `1st floor` has no number. A number needs a dot, a bracket, a colon or a dash with spaces behind it.
* The tool *Number the pins of this scene* in the pin list, or `api.number`. It asks for the order (rows from top to bottom, columns from left to right, by name, or as Foundry keeps them), letters in front, the first number, whether pins with a number keep it, and whether numbers from journal names are taken first.
* With *Number new pins automatically* a new pin gets the next free number.

## Pins players set

With the world setting *Pins set by players* on *The GM confirms each pin* or *At once*, players get the tool *Set a pin* in the notes controls and a *New pin* button in the pin list. They click the map and give a name, a text and a color. Foundry does not let players create notes, so the request goes to the active GM, whose browser writes the pin. A GM must be online.

* A pin for everybody is a note with its own journal entry in the folder *Pins of players*. Everybody may observe it, the player who set it owns it. It is a normal note and journal entry.
* A pin only for the player who set it is a note without a journal entry and without a name. Its name and text stay in that player's browser. Other players do not see the pin, and its text is in no document of the world. See *What other browsers receive* below.
* The player can change and delete their own pins in the pin list (name, text and color, not who sees it). The GM can change and delete every pin as usual.
* The setting *Most pins per player and scene* stops a player from filling a map. With *Players may set pins only they see* off, the choice for pins only for the player is not offered.
* Requests are checked on the GM's side: the position must be on the map, texts are cut and made safe, the color is checked, and a player can only change pins that carry their own mark.

### What other browsers receive

Foundry sends every note of a scene to every player's browser, and every journal entry of the world too, whatever their permissions. The interface hides what a user may not see, but a player who looks into the browser's tools can read what the browser received. So:

* The text of a private pin never leaves its author's browser. Other browsers receive only that a note exists at a position and which player it belongs to. The interface of the module hides that note from them.
* A pin for everybody and its journal entry are readable by all players. That is what you chose when you made it public.
* A pin that is hidden until discovered is hidden in the interface only. The note and its flags still reach every browser, so a player who looks into the browser's tools can find it.
* The rights of the preview card are checked in the interface. They keep text and pictures of journals out of the page for users without permission, but they cannot keep Foundry from sending the journal's data to the browser.
* A private pin is tied to the browser where it was set. In another browser or after the browser's data was cleared, the pin is still on the map for its author, but its text is not there.

## Opening a scene from a pin

Set *Opens a scene* in the note dialog. A double click on the pin then switches the view to that scene, for the GM, and for players who may view the scene. A player who may not gets a note. A pin can have a scene link without a journal. On Foundry 14 a note without a journal that a GM wrote is hidden from players by Foundry itself, so the module shows a pin with a scene link to players all the same.

## Taking over pins of another module

In the module settings, *Take over pins* reads the flags that an older pin module left on the notes and sets the matching choices here: labels that are always visible, the background, the preview text and picture, and the switched off preview. You choose between the viewed scene and all scenes. Nothing of that module is changed or deleted, and a choice a pin already has here is not replaced. Run it again at any time.

## Settings

The first button, *Sephral’s Modules*, and the module settings:

| Setting | Meaning |
| --- | --- |
| Module language | Language of the module on this device. |
| Look | The warm paper look (Signature) or the dark look of Foundry, per user. |
| Pin labels | World default: only when the pointer is on the pin, or always. |
| Pins without the dark box | World default. |
| Pins keep their size when zooming | World default. |
| Size on the screen (percent) | For pins that keep their size. 100 is the size set in the note. |
| Hide pins when zoomed out below (percent) | World default. 0 never hides. |
| Take pin numbers from journal names | On by default. |
| Number new pins automatically | A new pin gets the next free number. |
| Preview when the pointer rests on a pin | World default for the preview card. |
| Length of the preview text | At most this many characters. |
| New pins are visible without line of sight | New pins are marked as global. |
| Show pins to players | Switches Foundry's display of pins on for every player, once. Players can still switch it off for themselves. Turning the setting off and on again applies it to everybody once more. |
| Pins set by players | Off, the GM confirms each pin, or at once. |
| New pins are hidden until discovered | A new pin starts hidden. A pin made with the box unticked in the note dialog is not hidden. |
| Players discover pins by exploring | A hidden pin appears when its place is in explored ground or in sight. |
| Ping and note when a pin appears | A short ping and a note for the player. |
| Text in the map key | First lines, full text or only title and link. |
| Travel pace | Slow, normal or fast, for the travel time of routes. |
| Slow, normal and fast pace | Scene units per hour for each pace. |
| Hours of travel per day | How many hours a day of travel has. |
| Players can build routes | Every player builds a route of their own. |
| Players may set pins only they see | Allows private pins. |
| Most pins per player and scene | A limit for the pins one player sets. |
| Pin list, Categories, Take over pins | Buttons that open the windows. |
| Self test, Save debug file | See below. |

## Keys

The key that opens the pin list has no default. Choose one in Foundry's key settings under Map Pins.

## Self test

The settings button *Run self test* (GM) checks after a Foundry update that everything the module relies on is there: the note and its pieces, the window classes, the socket, the templates and the texts. It also tests the safe preview text with a secret section and a script. It also tests the logic of discovered pins, routes and the map key and, with a scene open, the fog of war functions that discovery reads and the layer routes are drawn on. The module was verified with Foundry 14.370. When Foundry is newer, the GM gets a hint once.

## Debug file

For bug reports, the GM saves one file about all of Sephral’s modules in this world: `Save debug file` in the module settings, or `Save Debug File (Sephral’s Modules)` in the context menu of a chat message.

The file contains chat text and whispers. Check it before you share it.

## Sephral’s Modules

The first button in the module settings, *Sephral’s Modules* (GMs only), opens one window for all of Sephral's modules in the world: the version, self test, settings, manual and demo video of each, a button that switches on an installed module that is off (Foundry then reloads the world for everyone), and the debug file. Below, *More from Sephral* lists other modules that fit the game system of the world, shown only after a click, each with its demo video and an *Install* button. Foundry installs modules only on its setup screen, so the button copies the module's link (manifest URL) and shows the steps with a short clip. When the GM launches the world again, the window opens once with the new module and its *Enable* button. The list is part of the module. Only a video you start is loaded, from the module page on GitHub.

## Macro API

`game.modules.get("sephrals-map-pins").api`

| Call | Does |
| --- | --- |
| `open()` | Opens the pin list. |
| `number(scene, options)` | GM. Numbers the pins of a scene. Options: `order` (`"reading"`, `"columns"`, `"name"`, `"listed"`), `prefix`, `start`, `keep`, `fromNames`. Returns `{changed, total}`. Without options the GM is asked. |
| `styleOf(note)` | How a pin looks now: `label`, `number`, `labelMode`, `noBackground`, `constantSize`, `minZoom`, `preview`, `category`, `hidden`, `undiscovered` (not shown to you yet), `hiddenPin` (hidden until discovered), `quest`. Takes a note or a note document. |
| `isDiscovered(note, user)` | Whether a user discovered a pin. A pin that is not hidden counts as discovered. The user is you by default. |
| `setHidden(note, hidden)` | GM. Hides a pin until it is discovered, or shows it like any pin again. |
| `discover(note, options)` | GM. Reveals a pin. Options: `{all: true}` for everybody, `{users: [ids]}`, `{hideFor: [ids]}` to hide it again for them, `{reset: true}` to hide it again for everybody. Returns the list of users who found it. |
| `askReveal(note)` | GM. Opens the window that asks whom to reveal the pin to. |
| `setQuest(note, state)` | GM. `"open"`, `"done"`, `"failed"` or `""` for none. |
| `mapKey(scene, options)` | GM. Makes or updates the map key. Options: `text` (`"lines"`, `"full"`, `"title"`), `open`. Returns `{journal, created, updated, kept, removed}`. Without options the GM is asked. |
| `openRoute()` | Opens the route window. |
| `addToRoute(note)` | Adds a pin (or a note id) to your route, the GM's route for a GM. |
| `routes()` | The routes you see: `[{id, stops, distance, units, hours, pace}]`. `id` is `main` for the route you build and `shared` for the one the GM shared. |
| `categories()` | The categories of the world: `[{id, name, icon, color}]`. |
| `focus(note)` | Pans the map to a pin and pings it. |
| `takeOverPins({scope, dryRun})` | GM. Takes over the pins of an older pin module. `scope` is `"scene"` or `"all"`. Returns the counts. |
| `runSelfTest()` | GM. Runs the self test. |
| `saveDebugFile()` | GM. Saves the debug file. |

The module stores its choices in the flags of the note under `sephrals-map-pins`: `label`, `background`, `size`, `minZoom`, `number`, `category`, `preview`, `previewText`, `previewImage`, `scene`, `hidden` (hidden until discovered), `found` (user ids who discovered the pin, `*` for everybody), `blocked` (user ids the pin was hidden from again), `quest`, and `owner`, `player` and `private` on pins players set. The GM's route is the scene flag `route` (`stops` and `shared`). A player's own route is in a setting of that browser.

## Limits

* A pin keeps its size on the screen by scaling the note. Very large pins at a very far zoom are drawn large.
* The category symbol replaces the picture of a pin only when that picture is Foundry's default book icon.
* Foundry 14 levels: a pin belongs to the levels set in its note. The list marks pins of other levels.
* Pins set by players need a GM online. So does discovering a pin, because the active GM writes it down. Without a GM the pin appears at the next try, when a GM is there.
* Discovery by exploring needs token vision and fog exploration on the scene, and works for pins on the viewed level.
* A route is a straight dashed line from stop to stop. It does not follow roads.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Map Pins it holds:

* on how many of the last 30 days the module was used
* how often the pin list is opened, a preview card is shown, pins are numbered, categories are created, players ask for a pin, a player's pin is created, a pin opens a scene, the pins of another module are taken over, a pin is discovered, a pin is revealed, a map key is made, a route stop is added and a quest state is set
* the settings *Look*, *Pin labels*, *Pins without the dark box*, *Pins keep their size when zooming*, *Preview when the pointer rests on a pin*, *Number new pins automatically*, *Pins set by players*, *New pins are hidden until discovered*, *Players discover pins by exploring*, *Travel pace*, *Players can build routes* and *Text in the map key* (only the chosen option)
* where errors occur in the module code: file, line, error type and whether the error arose in the module itself, in Foundry, in the game system or in another module, never the error message or the name of another module

No names, notes, pictures or other content of the world are sent.
