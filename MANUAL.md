# Sephral’s Map Pins: Manual

Map Pins changes how Foundry's map notes (the pins on a scene) look and gives you a list, a preview and pins that players can set. Everything works on normal Foundry notes. Switch the module off and every pin is still a valid note, only the extras are gone.

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

Above the fields a small picture shows the image of the pin. It follows the icon fields of Foundry's dialog. The image itself is Foundry's own field *Custom Icon*.

A choice that is empty is not stored. The note keeps only what you changed.

## The pin list

The list shows every pin of the viewed scene with its number, symbol, name and category. Open it with *Pin list* in the notes controls, with the button in the module settings, with a key you choose in Foundry's key settings, or from a macro.

* The search finds by name, number and category.
* A click on a pin pans the map to it and pings it. A double click opens it like Foundry does.
* The category buttons above the list hide a category on the map and in the list, for you only. The choice is kept in your browser.
* A player sees only the pins they may see. The GM sees all of them. On Foundry 14, pins on another level are marked.
* The GM has buttons for numbering and for the categories. A player has *New pin* when players may set pins.

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
| Players may set pins only they see | Allows private pins. |
| Most pins per player and scene | A limit for the pins one player sets. |
| Pin list, Categories, Take over pins | Buttons that open the windows. |
| Self test, Save debug file | See below. |

## Keys

The key that opens the pin list has no default. Choose one in Foundry's key settings under Map Pins.

## Self test

The settings button *Run self test* (GM) checks after a Foundry update that everything the module relies on is there: the note and its pieces, the window classes, the socket, the templates and the texts. It also tests the safe preview text with a secret section and a script. The module was verified with Foundry 14.370. When Foundry is newer, the GM gets a hint once.

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
| `styleOf(note)` | How a pin looks now: `label`, `number`, `labelMode`, `noBackground`, `constantSize`, `minZoom`, `preview`, `category`, `hidden`. Takes a note or a note document. |
| `categories()` | The categories of the world: `[{id, name, icon, color}]`. |
| `focus(note)` | Pans the map to a pin and pings it. |
| `takeOverPins({scope, dryRun})` | GM. Takes over the pins of an older pin module. `scope` is `"scene"` or `"all"`. Returns the counts. |
| `runSelfTest()` | GM. Runs the self test. |
| `saveDebugFile()` | GM. Saves the debug file. |

The module stores its choices in the flags of the note under `sephrals-map-pins`: `label`, `background`, `size`, `minZoom`, `number`, `category`, `preview`, `previewText`, `previewImage`, `scene`, and `owner`, `player` and `private` on pins players set.

## Limits

* A pin keeps its size on the screen by scaling the note. Very large pins at a very far zoom are drawn large.
* The category symbol replaces the picture of a pin only when that picture is Foundry's default book icon.
* Foundry 14 levels: a pin belongs to the levels set in its note. The list marks pins of other levels.
* Pins set by players need a GM online.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Map Pins it holds:

* on how many of the last 30 days the module was used
* how often the pin list is opened, a preview card is shown, pins are numbered, categories are created, players ask for a pin, a player's pin is created, a pin opens a scene and the pins of another module are taken over
* the settings *Look*, *Pin labels*, *Pins without the dark box*, *Pins keep their size when zooming*, *Preview when the pointer rests on a pin*, *Number new pins automatically* and *Pins set by players* (only the chosen option)
* where errors occur in the module code: file, line, error type and whether the error arose in the module itself, in Foundry, in the game system or in another module, never the error message or the name of another module

No names, notes, pictures or other content of the world are sent.
