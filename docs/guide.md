# CG Motion User Guide

Oct 9, 2026 · @Ruan

## About this guide

CG Motion is a timeline editor for CasparCG HTML templates, made by RegemarkFP. You design graphics with layers and keyframes, mark which text, pictures and colours CasparCG can change, and export each composition as a single HTML file that plays on air.

This guide covers **version 1.0**. It is updated with every release; the release notes at the end list what changed.

## Getting started

CG Motion comes as a Windows program: install it with the Setup file, or run the Portable file without installing anything else.

### Installing

1. Double-click **CG Motion Setup 1.0.exe**.
2. Choose where to install it and click **Install**. Shortcuts are added to the Start menu and the desktop.
3. CG Motion opens. From now on, double-clicking a `.cgm` project file opens it in CG Motion.

**CG Motion 1.0 Portable.exe** runs without installing, for example from a USB stick on a playout PC. It unpacks itself each time, so it starts a few seconds slower.

This guide comes with CG Motion as **CG Motion Guide.pdf**, next to the program files, and opens from **Help > Open the guide**.

If Windows shows **Windows protected your PC**, click **More info**, then **Run anyway**. If you were given **RegemarkFP.cer** and **Trust RegemarkFP.bat**, double-click the .bat once and confirm: Windows then shows RegemarkFP as the publisher.

To update, install the new Setup over the old one; your projects and settings are kept. To remove CG Motion, use **Settings > Apps** in Windows.

### Opening CG Motion

CG Motion opens with the RegemarkFP splash while it loads.

&#91;image: The CG Motion splash screen\]

Then the start screen lists your recent projects.

&#91;image: The start screen with New project and Open project\]

### Your first project

1. Click **New project** and fill in the project name, the project folder, the first template's name, its size, frame rate and length.
2. Point the project folder at (or inside) your CasparCG template folder to go straight to air.
3. The project file (`.cgm`) is saved in that folder, and every template exports into it, named after its composition.

Use 50 or 25 frames per second for PAL channels and 60 or 30 for NTSC. **Open project** also opens exported templates and Loopic `.loo` files.

### The tutorial project

The quickest way to learn CG Motion is to take apart the tutorial project that comes with it: click **Tutorial project** on the start screen, or **Help > Open the tutorial project**.

| Composition | What it shows |
| --- | --- |
| Lower third | A name bar with keyframes, a parented accent, a wipe mask, the captain text style, an image slot, a crawl, stop markers, a repeat section and an invoke |
| Standings | A table with a header row and rows that slide in |
| Worm | A line chart that adds up runs per over, with wicket dots |
| Manhattan | Runs per over as bars |
| Poll | A donut with percentages and a legend |
| Votes | Horizontal bars with % after the values |
| Quote | A multiline text box that shrinks to fit |
| Stats | A head-to-head stat comparison with double bars |

Click an empty spot in the viewer to read each composition's notes in the Inspector, then try its fields in the **Control** panel. The tutorial opens as a new, unsaved project: save it in a folder of your own to keep changes.

&#91;image: The tutorial project open on the Lower third, with its notes in the Inspector\]

## The workspace

The window is made of panels you can rearrange like Premiere Pro or After Effects; the layout is remembered between sessions.

&#91;image: The CG Motion workspace: Assets on the left, the Viewer in the middle, the Inspector on the right and the Timeline below\]

| Panel | What it is for |
| --- | --- |
| Viewer | The composition as it will look on air; select, move, resize and draw layers here |
| Timeline | Layers as bars, keyframes, stop markers, repeat sections and invoke ranges |
| Inspector | Settings of the selected layer, or of the composition and project when nothing is selected |
| Assets | Images, image sequences, fonts, Lottie files and compositions |
| Control | Test the template like CasparCG: play, next, stop, field values and invokes |
| Colours | Shared colours that several layers use and CasparCG can change |
| Easing | The easing curve editor and presets |
| CasparCG | Server address, export folder and live commands to a CasparCG server |

### Arranging panels

- Drag a panel's tab to move it. A green highlight shows where it will dock before you let go.
- Drag the bars between panels to resize them.
- Click the pop-out button on a panel to float it in its own window, for example on a second screen. Drag a floating panel's tab back onto the main window to dock it again.
- The **Window** menu shows and hides panels; **Window > Reset layout** restores the default.

### Moving around the viewer

- **Mouse wheel** zooms at the mouse pointer.
- **Horizontal (tilt) wheel**, a trackpad swipe or **Shift + wheel** scrolls left and right.
- **Space + drag** or **middle-drag** pans.
- **Fit** fits the composition in the viewer. While its button is lit, the composition keeps fitting when the viewer changes size. Zooming or panning switches it off; click Fit again to switch it back on.
- **100%** shows the composition at actual size.
- **Safe areas** shows action and title safe guides; **Snap** snaps layers to edges, centres and other layers (hold Ctrl to move freely).

**On a laptop trackpad:** pick the **Hand** tool (H) in the toolbar and drag to move around, or two-finger scroll in any direction. Pinch to zoom. **View > Trackpad scrolling** makes two-finger scrolling move the view with every tool (the setting is remembered); without it the wheel zooms, as with a mouse.

### Timeline basics

- Click the ruler to move the playhead; Space plays and pauses.
- Drag a layer bar to move it in time, or drag its ends to trim.
- Click the triangle beside a layer (or press U) to show its animated properties and keyframes.
- Right-click a layer for more commands. Layers higher in the list sit in front.

**Selecting several layers:** click one layer, then **Shift + click** another to select every layer in between. **Ctrl + click** adds or removes a single layer, and **Ctrl + Shift + click** adds another range to what is already selected.

&#91;image: The timeline with stop markers, a repeat section, an invoke band and keyframes\]

Above the ruler: orange **stop** markers, the purple **repeat** section and the green **flash** invoke range. A layer opened with its triangle shows its animated properties and keyframes.

## Layers

Every graphic is built from layers; add them with the toolbar, the **Layer** menu or the Assets panel.

| Layer | How to add it | Notes |
| --- | --- | --- |
| Text | Text tool (T): click for a box, drag to draw one at a size | See Working with text |
| Rectangle / ellipse | Rectangle (R) or Ellipse (O) tool, drag in the viewer | Fill, gradient, stroke, corner radius |
| Image | Assets > + Images, then add to the composition | Fit: stretch, contain or cover |
| Image slot | Toolbar > Image slot | An empty picture CasparCG fills: team logos, flags, headshots |
| Image sequence | Assets > + Sequence (select all frames) | Converted to WebP and optimised automatically; plays once, loops or ping-pongs |
| Lottie | Assets > + Lottie | Lottie text layers can be filled from CasparCG |
| Composition | Assets > Compositions > + | A whole composition inside another one; can run on its own timeline |
| Null | Toolbar > Null | Invisible; used as a parent to move several layers together |
| Table | Toolbar > Table | Rows and cells from text, Excel or CasparCG |
| Chart | Toolbar > Chart | Worm, manhattan, bars, pie and donut |
| Crawl | Toolbar > Crawl | A scrolling ticker with separators between items |

### Common layer settings

Every layer has a name, **In** and **Out** frames, a parent, a blend mode, transform (position, scale, rotation, skew, anchor, opacity), a crop mask and effects. Hide a layer with the eye in the timeline and lock it with the lock.

### Tables

- Type one row per line with cells split by `|`, paste straight from Excel, or use JSON such as `[["Pos","Team"],["1","Proteas"]]`.
- Set column widths as relative numbers (`1,4,1,1`) and alignment per column (`l,c,r`).
- Style the header row, row fill, alternate row fill, text and row lines. Rows share the box height, so resize the box to space them.
- **Rows come in**: all at once, or fade, slide or drop in one after another, a set number of frames apart.
- Tick **Filled from CasparCG** to send the rows from your control software.

&#91;image: A table selected in the editor, with its rows typed in the Inspector\]

&#91;image: The same standings table as it plays on air\]

### Charts

| Type | Data format | Example |
| --- | --- | --- |
| Line (worm) | One series per line | `Proteas: 4, 8, 3, 12w, 6` |
| Bars (manhattan) | One series per line | `Australia: 6, 2, 10, 5, 7w` |
| Horizontal bars | One item per line | `Yes: 62` |
| Double bars (stat comparison) | The two names, then one stat per line | `Proteas \| Australia` then `Fours: 22 \| 18` |
| Pie / donut | One item per line | `No: 31` |

- Add `w` to a value for a wicket in that over (`ww` for two); it is drawn as a dot.
- Tick **Add up the values** on a line chart to turn runs per over into a running total (a worm).
- Colours follow a list you type (`#00ff83, #3b9dff`) or the default palette.
- Charts draw on from their In frame over the frames you set, or you can keyframe **Progress**.

&#91;image: A worm: two line series that add up runs per over, with red dots for wickets\]

&#91;image: A manhattan: runs per over as bars, side by side per team, with wicket dots\]

&#91;image: A donut chart for a poll, with percentages and a legend\]

&#91;image: Horizontal bars for a player of the match vote\]

**Double bars** compare two sides stat by stat. Each pair of bars grows out from the middle, scaled to the bigger value, and the leader is shown in bold. Values keep their units (`54%`) and count up as the bars grow. Tick **One split bar per stat** for a possession-style bar that shows each side's share.

&#91;image: Double bars: a head-to-head comparison with two bars per stat\]

&#91;image: Double bars with One split bar per stat: each side's share, like possession\]

### Crawls

- Items are split by the item split (`|` by default), which is not shown.
- Between items goes a separator: a character with its own colour and size, or a picture such as a logo.
- Set the speed in pixels per second, fade the edges, and choose whether it starts already filled or enters from the right.
- On air the crawl keeps running while the template holds on a stop marker.

&#91;image: A crawl with green labels styled with Text styles and a dot between items\]

### The Data panel

The **Data** panel is a grid for the selected table, chart or crawl, so you never have to type the text format. Open it with **Window > Data**, or **Edit in the Data panel** in the Inspector; it docks beside the timeline.

- **+ Row**, **+ Column**, **+ Series**, **+ Point**, **+ Stat** and **+ Item** add data; the ↑ ↓ × buttons move and remove rows, and ← → × move and remove table columns.
- Table columns have their own width and alignment; chart series and items have a colour chip.
- Press Enter to go down a cell (Shift+Enter goes up). Paste a block of cells straight from Excel and the grid grows to fit.
- The bar at the top sets **Filled from CasparCG**, the field name, and **every cell as its own field** (see *Single cells from CasparCG*). Point at a cell to see its field name.
- **Copy as field data** copies the data in the format CasparCG sends.

&#91;image: The Data panel editing the standings table, with the CasparCG field name and column settings\]

### Textures

Tick **Add a texture over this layer** in the Inspector to lay a texture over a shape, text box, table, chart or crawl background. It is a quick way to give a flat panel some finish.

- **Built in:** grain, paper, brushed metal, carbon fibre, scanlines, diagonal lines, grid, dots, hex, vignette, gloss and shine. Or choose **Your own picture** and pick an image from Assets (tiled, cover or stretched); it goes into the exported template.
- **Look:** Blend (Overlay by default; also Soft light, Multiply, Screen, Hard light, Colour dodge, Difference, Normal), Opacity, Size, Stretch, Angle and Pattern colour.
- **Refine:** Offset X and Y, Zoom, Turn, Bright, Contrast and Soften, plus Invert and Black and white. All of these can be keyframed (click the circle next to them), so you can build your own texture animation with any ease.
- **Motion:** Scroll (direction and speed in pixels per second), Back and forth (direction, distance, seconds, smooth or even speed), Flicker (random jumps, like film grain) and Circle round. Spin turns the pattern all the time, and Pulse fades it in and out. Presets set it in one click: Slow drift, Scanline roll, Film flicker, Sway, Shine sweep, Breathe and Still. Motion runs from the layer's In frame in the editor and keeps running on air, also while the template holds on a stop marker.
- **Where it shows:** Fade the texture to Soft edges, or make it strongest at the top, bottom, left, right, middle or outside.
- **Mask the texture with other layers:** works like a layer mask. **+ Add a mask layer**, then pick a shape, text, picture, sequence or composition from the same composition; Add, Subtract or Intersect several, and tick Invert to put the texture outside them. Mask layers are hidden themselves, so animate them for texture wipes and reveals.
- **From CasparCG:** the **CasparCG** row in the Texture section links any texture setting to a field: on or off, type, a picture path or URL, blend, size, motion, speed, direction, opacity, offset and more. The links show under CasparCG variables, where numbers can also glide to a new value.
- On text, tables, charts and crawls the texture sits under the content, so the words stay clean. On pictures and compositions it sits on top.

**Halftone, gradients and radial textures.** Five more kinds sit next to the patterns:

- **Halftone:** dots that grow from nothing to solid. Straight (turn it with Angle) or Radial (from the centre out). Pick Round, Square, Diamond or Lines, set where coverage starts and ends, a Curve, Staggered rows, the dot colour, and Size % for the dot spacing.
- **Gradient:** two colours along a line; Angle turns it, Offset slides it.
- **Radial glow:** two colours from the centre out; Offset moves the centre, Size % sets how far it reaches.
- **Rays:** a sunburst with any number of rays and a ray width; Angle and Spin turn it.
- **Rings:** circles round the centre; Size % sets the spacing, Ring width the thickness.

Every texture is endless: however far you offset, scroll, zoom out or turn it, the pattern fills the whole layer.

**Texture presets.** **Apply a preset...** at the top of the Texture section offers built-in looks (Comic halftone, Radial halftone, Retro scanlines, Film grain, Carbon sheen, Brushed steel, Paper print, Sunburst spin, Soft glow, Shine sweep), your own presets, and the presets used in this project. **Save as preset** keeps the current texture settings under a name, on this PC for every project and inside the project, so CasparCG can switch to it. **Delete...** removes one.

**Sizing.** Sliders set Size %, Width %, Height % and Angle (double-click a slider to reset it); Variation gives grain, paper and brushed metal a different random pattern. Under Refine, Hue and Saturate join Bright, Contrast and Soften, all keyframeable. Under Where it shows, **Pinned to** keeps the texture on the layer or fixes it to the composition (it stays put while the layer moves and lines up across several layers), and **Inset** keeps it a set number of pixels away from each edge.

**Controlling a texture from CasparCG.** Tick **Control this texture from CasparCG** and give it a field name (for example `texture1`). Then CasparCG can send:

| Field | Value | Does |
| --- | --- | --- |
| `texture1` | `1` or `0` | Shows or hides the texture |
| `texture1` | a preset name | Switches to that preset |
| `texture1` | JSON, e.g. `{"kind":"halftone","opacity":60,"size":150}` | Changes several settings at once |
| `texture1_preset` | a preset name | Switches to that preset |
| `texture1_kind` | grain, paper, halftone, rays ... | Changes the type |
| `texture1_opacity`, `_size`, `_width`, `_height`, `_angle`, `_zoom`, `_x`, `_y` | numbers | Opacity, sizes, angle, zoom and offset |
| `texture1_color`, `_blend`, `_motion`, `_speed`, `_dir` | values | Colour, blend mode and motion |
| `texture1_pic` | a picture path or URL | Uses that picture as the texture |

All of them are listed in the Control panel to try out.


&#91;image: Halftone straight, radial and diamond, gradient, radial glow, rays, rings, a turned grain and a scrolling carbon\]

&#91;image: The Texture section: look, refine, motion presets, fade and mask settings\]

&#91;image: A grid texture masked by a circle layer, on a turned panel, and a carbon texture with soft edges under text\]

&#91;image: All twelve built-in textures on coloured panels\]

&#91;image: The Stats graphic in the tutorial: a carbon texture on the panel behind the double bars\]

## Working with text

Text tool layers are text boxes: a fixed frame with the text laid out inside it, like a word processor.

### Text boxes

- Drag the handles to resize the box; the text keeps its size and stays aligned inside it.
- Alignment buttons: left, centre, right and justify, plus top, middle and bottom inside the box. Bold and italic are buttons too.
- **Convert case**: as typed, ALL CAPS, lowercase or Capitalise Each Word.
- **Clip to box** hides anything that spills over the edge.
- **Margins** are the inner padding of the box.
- Untick **Text box** for a free text that grows with its content; then *Fit width* squeezes long text and *Wrap width* wraps it.

### Multiline text

- Press Enter in the text, or send the line break code (`\n` by default) in the CasparCG field, to start a new line.
- **Wrap text onto new lines** wraps long text inside the box.
- **Shrink the text until every line fits the box** makes long text smaller instead of letting it spill out; short text goes back to full size.
- With wrapping off, **Squeeze long text to fit the width** narrows one line of text to fit.

&#91;image: A three-line quote in a text box, shrunk to fit with Shrink the text until every line fits the box\]

### Background and outline

Text can have a background **Fill**, an **Outline** drawn outside its frame (so it never shifts the text), and rounded **Corners**.

### Text styles

Text styles split a text at an invisible separator and give each part its own look. For example, `John|Smith|C` can become a thin italic first name, a bold SURNAME and a small raised (C).

1. Under **Text styles**, tick **Style the parts of the text separately**.
2. Set the **Separator** (`|` by default; it is never shown) and what the parts are **Joined with** (a space by default).
3. Give each part its font, weight, italic, case, size %, raise % (superscript), letter spacing, colour, and text to put **Before** or **After** it.
4. The last part's style is also used for any parts after it.

&#91;image: The Text styles settings with the Name SURNAME (C) preset: three parts, each with its own weight, italic, case, size and raise\]

Parts that are empty are skipped together with the space before them, so `John|Smith` shows no captain mark.

| Preset | Send | Shows |
| --- | --- | --- |
| Name SURNAME (C) | `John\|Smith\|C` | thin italic John, bold SMITH, small raised (C) |
| LABEL  value | `SPORT^Proteas win by 5 wickets` | bold green SPORT, then the headline |
| Big number + small unit | `238\|/4` | large 238 with a small /4 |

&#91;image: A lower third on air: Temba|Bavuma|C shown as a thin italic first name, a bold surname and a small raised (C)\]

Text styles also work in table cells and crawl items. Use a separator there that differs from the cell or item split, such as `^`.

## Animation

Animate any numeric or colour property by setting keyframes at different frames; CG Motion fills in the frames between them.

### Keyframes

1. Move the playhead to a frame.
2. Click the circle beside a property in the inspector to start animating it. A keyframe appears at the playhead.
3. Move the playhead and change the value: a new keyframe is made automatically.
4. In the timeline, drag keyframes to retime them, drag a box around several to select them, and press Delete to remove them. Ctrl+C and Ctrl+V copy keyframes to the playhead.

J and K jump to the previous and next keyframe. Resizing an animated layer with the handles keyframes its size without moving its anchor, so other keyframes are not disturbed.

### Easing

- Select keyframes, then pick an easing in the **Easing** panel or press **F9** for an easy ease.
- The Easing panel has a curve editor and presets: ease, ease in, ease out, smooth, snappy, overshoot and anticipate. Save your own curves as presets to reuse them as a group.
- An easing sits on a keyframe and shapes the move to the next keyframe. **Hold** jumps instead of moving.
- **Project > New keyframes use** sets the easing new keyframes get.

&#91;image: The Easing panel: drag the two green handles to shape the curve, or pick a preset below\]

### Effects

Under **Effects** every layer has blur, brightness, contrast, saturation, hue and a drop shadow. All of them can be keyframed.

A **drop shadow** is never cut off by the layer's own mask or crop mask: it falls outside them, like a shadow on the finished shape. A composition layer clips what is inside it to its frame; tick **Show outside its frame (shadows, overshoot)** on the composition layer to let shadows and overshooting animation show beyond it.

### Motion blur

- Tick **Motion blur** under Effects on a layer. It blurs along the direction the layer travels, including movement from its parents, and only while it moves.
- When the template holds on a stop marker the picture is sharp again.
- The strength is the composition's **Motion blur shutter**: 180° is the film look, 360° doubles it, 90° halves it.
- Spinning and scaling are blurred by how far the layer's centre moves, not as a true spin or zoom blur. Layers used as masks are not blurred.
- Each blurred layer costs some playback speed, so use it on the fast movers.

## Parenting, masks and the node screen

Parenting makes one layer follow another; masks let any layer shape another, like vMix GT Designer.

### Parenting

- Pick a **Parent** in the layer settings, or set it in the Parent column of the timeline.
- **Whole object**: the layer follows the parent's position, rotation and scale.
- **Edges only**: use the pin widget to pick which edge or corner of the parent to follow. The layer keeps its own rotation and scale and is only pushed along, for example a tag that stays at the end of a name bar that grows with longer text.
- **Match parent width / height** makes a plate hug its parent, with an extra margin.

Children follow the parent's position, rotation and scale, but not its skew: skewing a parent leaves its children upright.

### Masks (mattes)

- Under **Matte**, choose **Mask with** and any other layer in the composition. The masked layer only shows where the mask layer is.
- Modes: alpha, inverted alpha, luma and inverted luma.
- The mask layer is hidden unless you tick **Keep this layer visible as well**. Its outline shows in orange while the masked layer is selected.
- Animate the mask layer to make wipes and reveals.

### Crop mask

Every layer also has a simple **Crop mask** (rectangle or ellipse, with corner radius) that can be keyframed, without needing a separate layer.

### The node screen

The **Nodes** button above the viewer shows how layers are connected. Green lines are parents and orange lines are masks.

- Drag from one node's port to another to connect them.
- Add several masks to one layer and set each to add, subtract or intersect, to build a custom mask from several shapes.
- **Tidy** lays the nodes out neatly.

&#91;image: The node screen: Name bar is the parent of Accent (green link) and Name wipe masks Player name (orange link)\]

## Data from CasparCG

A field is a named value CasparCG sends with `CG ADD` or `CG UPDATE`; every field you set up in CG Motion is listed in the Control panel and in the exported template's header.

### Fields on layers

| Layer | How to make it a field | What CasparCG sends |
| --- | --- | --- |
| Text | Tick **Editable from CasparCG**, set the field name | The text (with line break codes and style separators) |
| Image slot | Tick **Replaceable from CasparCG** | A file path or web address of the picture |
| Table | Tick **Filled from CasparCG** | The rows |
| Chart | Tick **Filled from CasparCG** | The chart data |
| Crawl | Tick **Filled from CasparCG** | The items |
| Lottie | Give a Lottie text layer a field name | The text |

For image slots, **Before** and **After** wrap what the operator types: with `logos/` and `.png`, sending `SA` loads `logos/SA.png` from next to the template. Pictures load first and then swap, so a logo never flashes empty on air.

### Single cells from CasparCG

Every table, chart and crawl is controllable from CasparCG. New ones are **Filled from CasparCG** straight away, and older projects get a field name when they open. The main field (for example `standings`) replaces all of the data. With **Every cell as its own field too** (on by default) you can also change one value without sending the whole table. Numbers start at 1.

| Layer | Fields |
| --- | --- |
| Table | `standings_h2` header cell 2 · `standings_r3c2` row 3, cell 2 · `standings_r6` a whole row, e.g. `6\|Pakistan\|6\|1\|6` (adds a row if it is new) |
| Line or bar chart | `worm_n1` series name · `worm_v1` all its values, e.g. `4, 8, 3w` · `worm_v1p13` point 13 only · `worm_c1` colour |
| Pie, donut, horizontal bars | `poll_n2` item name · `poll_v2` its value · `poll_c2` colour |
| Double bars | `stats_n1` and `stats_n2` names · `stats_s3` stat 3 label · `stats_a3` and `stats_b3` its two values · `stats_c1` and `stats_c2` colours |
| Crawl | `crawl_i2` item 2 |

Cell fields are applied on top of the main field, so you can send a new table and then correct one cell. They all show in the Control panel, in the field list at the top of the exported template, and in the CSV export. Chart type, scale maximum, colours, suffix, legend and running total, and a table's header row and column widths, can also be linked to fields with **Link to a field**.

### Mapping any property to a field

Under **CasparCG variables** in the inspector, map any property of a layer to a field: position, size, opacity, colours, visibility, font, alignment, in and out frames and more.

- **Set** uses the value sent; **Add** and **Multiply** change the designed value (useful for nudges or fades).
- **Glide** eases to a new value over a number of frames instead of jumping.

### Shared colours

In the **Colours** panel, make shared colours (for example team colours), link layers' fills and text colours to them, and give a colour a field name so CasparCG can change it everywhere at once.

### Repeaters

**Repeater** in the toolbar turns the selected layers into rows or columns, each copy with its own numbered fields: a field called `name` becomes `name1`, `name2` and so on. Send plain `name` to set all copies at once, and type `{#}` in a text to show the copy's number. A **Copies shown** field lets CasparCG choose how many rows appear. Use it for line-ups and full pagers.

### Text animation (letters, words, lines)

A text layer can animate one letter, word or line after another, for example a title whose letters rise in one by one. Tick **Animate letters, words or lines** in the layer's **Text animation** section.

&#91;image: The Text animation section, with the letters of a title rising in one after another\]

- **Split:** letters, words or lines.
- **In:** a preset, the frame it **Starts** on, **Frames** (how long each letter or word takes), **Stagger** (the gap in frames before the next one starts) and **Order**: first to last, last to first, from the centre, from the edges, or random.
- **Out:** the same settings; it plays the preset in reverse to take the text away.
- **Presets:** Rise, Drop, Fade, Slide in from the right or left, Scale up (pop), Zoom out, Blur in, Typewriter, Flip and Spin.
- **Start at playhead** moves the start to the playhead. Next to it you see the frames the animation covers for the current text.

It runs on the normal timeline, so scrubbing in the editor shows it, and stop markers hold it like any other animation. New text sent from CasparCG is split the same way.

### Update animations

A layer with a field can animate when that field gets a new value, for example a score that pops when it changes. Find **Update animation** in the Inspector of the layer. It plays automatically on every CasparCG `UPDATE` that changes the value; sending the same value again does nothing.

- **Presets:** Fade out and in, Slide up, Slide down, Slide left, Slide right, Pop, Flip, Flash, and Count (numbers count from the old value to the new one). On a text layer, **Per letter / word** takes the old text away one letter, word or line after another (the preset in reverse) and brings the new text in the same way; you set the preset, frames, stagger and order, and the swap happens when the last old unit has gone. Set the duration in frames, and the distance for slides. The new value appears half way, when the old one is out of sight; with Pop and Flash it appears straight away.
- **Custom keyframes:** choose **Custom keyframes (own timeline)...** and the layer's own update timeline opens in a window over the viewer. Each layer has its own.

&#91;image: The update timeline of a layer, with keyframes and the blue update marker\]

In the update timeline:

- **Channels:** Position X and Y, Scale, Scale Y, Rotation, Opacity and Blur. They are offsets from the layer's normal look, so the animation works wherever the layer is on the main timeline.
- **Keyframes:** click a track or the ruler to move the playhead (the viewer shows that frame), then type a value or click the diamond to add a key. Drag keys to move them, double-click a key to delete it, and click a key to set its easing to the next key (ease in and out, linear, ease in, ease out, or hold to jump).
- **Update marker:** the blue marker is the frame where the new value appears. Drag it to where the old value is out of sight.
- **Start from a preset** fills the keyframes from a preset to adjust. **Play** sends a new value in the viewer and plays the whole animation, as CasparCG will.

To test from the Control panel, click **Play** under Test like CasparCG, then type a new value in a field and press Enter. **Test in the viewer** in the Inspector does the same with a made-up value.

### The same fields in two pre-comps

Two composition layers whose insides use the same field names, such as a left and a right shot clock that both have TIME1 and TIME2, would take the same value. The Control panel warns about this. **Give each its own fields** adds a **Field suffix** to each layer, taken from the end of its name: Shot clock_L gets _L and Shot clock_R gets _R, so the fields become TIME1_L, TIME1_R, TIME2_L and TIME2_R. You can also set the Field suffix yourself in the Inspector of a composition layer. Sending the plain name (TIME1) still fills every copy that has no value of its own.

Renaming a layer renames its field too, as long as the field still has the name it got from the layer. A field name you typed yourself is kept.

### Testing in the Control panel

The **Control** panel plays the template in the viewer exactly as CasparCG would: **Play**, **Next**, **Stop**, each invoke, and every field with a test value. **Copy JSON** copies the test values; **Back to editing** returns to the timeline.

&#91;image: The Control panel: Play, Next and Stop, the editable fields with test values, and an invoke\]

### CSV export

**File > Export variables as CSV** saves one row per field and per invoke of the template (name, type, default value, description) for RFP Manager or a spreadsheet.

### Variables sheet (PDF)

**File > Export variables sheet (PDF, all templates)...**, or **Export PDF** in the Control panel, makes one PDF for the whole project. Hand it to the operator or the person building the control software.

- **Cover:** the project name, date, CasparCG channel and layer, totals, and a list of the templates.
- **Each template:** a still frame at its hold point (the first stop marker, or the middle of the timeline), rendered exactly as CasparCG shows it, with the default text.
- **Fields and invokes:** a table of the template's fields (name, type, default, what it is), with cell fields listed separately, and a table of its invokes (what they play, which frames and the CasparCG command).
- **Load command:** a ready-made CG ADD command that loads the template with its default data.

A template here is a composition that isn't used inside another one; nested compositions are covered by the template that contains them. With an export folder set, the PDF is saved there; otherwise CG Motion asks where.

## Playback control

Stop markers, repeat sections and invokes decide how a template moves when CasparCG sends `PLAY`, `NEXT`, `STOP` and `INVOKE`.

| CasparCG command | What the template does |
| --- | --- |
| `CG PLAY` | Plays from the start to the first stop marker and holds there |
| `CG NEXT` | Plays on to the next stop marker |
| `CG STOP` | Plays from the last stop marker to the end, then clears (or plays backwards, if set) |
| `CG INVOKE "name"` | Plays the frame range of that invoke |
| `CG UPDATE` | Changes field values without restarting the animation |

### Stop markers

Press **M** (or **+ Stop marker**) to put a stop marker at the playhead. A template with no stop markers plays to the end and stays on its last frame. A marker on the very first frame is ignored, so the template always shows something.

### Repeat sections

**+ Repeat section** draws a band above the timeline. Playback circles inside it, for example a looping shine, until `NEXT`, `STOP` or another invoke lets it out. Drag the band's ends to set it.

### Invokes

In the **Control** panel, **+ Add** creates an invoke: a name and a range of frames to play. Its band appears above the timeline. Call it with `CG 1-20 INVOKE 1 "name"`; each invoke is also a function of the same name in the template.

- **Plays** chooses the main timeline or a composition layer that runs independently.
- **Repeat** (on invokes that have it) can loop the range or play it back and forth until another invoke or stop.
- Each template only shows and exports its own invokes.

### Independent compositions

Tick **Runs independently** on a composition layer to give it its own playhead, controlled by invokes; choosing the layer in an invoke's Plays list ticks it for you. Tick **Starts by itself when the template plays** for a nested animation that runs on its own, for example a looping background, while the main timeline holds.

### Stop backwards

In the composition settings (click an empty spot in the viewer), **Stop plays the animation backwards** makes `STOP` reverse the in animation instead of playing an out section.

## Exporting and going on air

**Export template** (Ctrl+E) writes the composition you have open into the project folder as one HTML file named after the composition, with its fonts, pictures and sequences inside it.

**Working inside a pre-comp?** Export template writes the template the open composition belongs to, so your change lands in the file CasparCG plays. If the pre-comp is used in several templates, all of them are written. The CasparCG panel works on that template too. To write the pre-comp as a template of its own, use **File > Export this composition on its own**.

**Fonts travel with the template.** When you export, the desktop app embeds every font the template's text uses, from the fonts installed on this PC: the right files for each weight and italic. The CasparCG PC doesn't need them installed. Fonts under **Assets > Fonts** come first. The status bar lists the fonts that were embedded, any that aren't installed here, and any whose licence doesn't allow embedding.

### Exporting

- Each composition is its own template. Only the compositions, fonts and pictures it uses are included.
- The file's header lists its size, frame rate, fields and invokes.
- Open an exported template in a browser with `#preview` at the end of the address to test it: P plays, N is next, S stops.
- Opening an exported template in CG Motion brings back its project, so you can edit it again.

### The CasparCG panel

Set the server's address, port, channel and layer, then use the buttons to send `PLAY`, `NEXT`, `STOP`, `UPDATE` and invokes straight to a running CasparCG server. Replies appear in the log at the bottom. The export folder and an optional sub-folder can also be set here.

&#91;image: The CasparCG panel: server address, export folder and on-air buttons\]

### Smooth playback

1. **Optimise sequences for playback** (File menu, or the button in the Assets panel). Broadcast sequences are often full 1920x1080 pictures with a small graphic in them; this cuts every frame down to the part with pixels. The picture stays identical and plays much smoother. Save afterwards to keep it.
2. In `casparcg.config`, inside `<html>`, set `<enable-gpu>true</enable-gpu>` and restart the server.
3. Keep the heavy things in check. From most to least costly: full-frame image sequences, blur, drop shadow and motion blur on large layers, many masks, animated width and height of text boxes. Position, scale, rotation and opacity are cheap.
4. Match the template's frame rate to the channel (50 or 25 for PAL).

## Importing Loopic projects

**File > Import Loopic project (.loo)** turns a Loopic project into a CG Motion project; the `.loo` file is never changed, and **Save** keeps the result as a `.cgm`.

### What comes across

Every composition, layer, keyframe and easing curve; embedded fonts, pictures and image sequences; masks; nested compositions; image loaders; and text fields with their keys.

### How Loopic code is converted

| In Loopic | In CG Motion |
| --- | --- |
| `this.pause()` on a frame | Stop marker |
| `this.goToAndPlay(0)` on the last frame | Repeat section |
| `useOnInvoke("name", ... goToAndPlay(N))` | Invoke from frame N to the next stop marker |
| `useOnUpdate` setting fill, colour, background or opacity | Field mapped to that property |
| First name / surname code with `split("\|\|")` and a styled span | Text styles with the `\|\|` separator |
| `useOnStop` playing in reverse | Stop plays the animation backwards |

Anything else is listed in the report shown after the import, so you can rebuild it by hand.

&#91;image: The report shown after importing a Loopic project\]

### Check before going on air

- Masks clip to the mask's shape; their colour and opacity are ignored, and several masks on one layer intersect.
- Large projects take a few seconds to import. Click **Optimise sequences for playback** in the report: Loopic sequences are usually full-frame pictures and play much smoother optimised.
- Compare each template with the original before using it on air.

## Importing vMix titles

**File > Import vMix titles (.gtzip)...** (or **Import vMix titles...** on the start screen) turns vMix GT titles into CG Motion compositions. Pick one title or a whole folder of them at once: every title becomes its own composition in one project, ready to export as a CasparCG template. The .gtzip files are never changed.

&#91;image: vMix's own preview next to the same titles imported and exported for CasparCG\]

### What comes across

- **Layout:** every rectangle, picture, text and image object, in its place and size. Pictures inside the title travel with it; solid and bitmap rectangles, opacity, crops, skew and drop shadows are kept.
- **Text:** font, size, weight, alignment, line spacing and Uppercase. **Shrink** keeps the text on its line and makes it smaller until it fits the box, as in vMix.
- **Animations:** the In storyboard plays from the start, a stop marker holds the title, and `CG NEXT` / `CG STOP` play the Out storyboard. Fly, Fade, Zoom, Expand and Reveal become keyframes with vMix's easing, and objects that fly in are hidden outside their vMix layer, exactly like in vMix.
- **Masks:** objects masked by another object stay masked.
- **Fields:** each text keeps its vMix name as a CasparCG field (spaces become `_`, so `PLAYER NAME` is `PLAYER_NAME`). Image objects become replaceable pictures, and rectangles marked as data, like a team colour, become colour fields.

### How vMix animations are converted

| In vMix | In CG Motion |
| --- | --- |
| Storyboard (In) | Keyframes from frame 0, ending at the stop marker |
| TransitionOut | Keyframes after the stop marker, played by `CG STOP` |
| Fly (Left, Right, Top, Bottom) | Position keyframes from (or to) just outside the object's vMix layer, which hides it there |
| Fade | Opacity keyframes |
| Zoom | Scale keyframes around the centre |
| Expand (from an edge, a corner or the centre) | Scale keyframes from that edge, corner or centre |
| Reveal | Crop mask keyframes that open from the centre |
| An animation on a whole vMix layer | A null layer that its objects follow (fades go to each object) |

### Check before going on air

- **Fonts:** a .gtzip does not contain fonts. Install them on this PC (export embeds them in the templates), or add the font files under **Assets > Fonts**. The import report lists the fonts each title uses.
- Pictures vMix did not pack into the .gtzip are listed in the report; add them under Assets and pick them on the layer.
- A rectangle that follows the size of another object in vMix keeps its designed size here.
- Titles import at 50 frames per second. Compare each composition with vMix's preview (shown in the report; click a preview to open that composition) before using it on air.

## Importing Photoshop files

**File > Import Photoshop file (.psd)...** turns a layered .psd or .psb into a CG Motion composition at the document's size. Every layer lands in its place, ready to animate and export as a CasparCG template. The .psd file is never changed.

&#91;image: A Photoshop lower third imported: groups, text fields and the clipping mask in place\]

### What comes across

- **Layers:** every pixel layer becomes a picture in the same place, with its opacity, blend mode and visibility. Hidden layers stay hidden.
- **Groups:** each group becomes a null layer that its layers follow, so you can animate the whole group at once. The group's opacity is applied to its layers.
- **Text:** text layers become editable text with the same font, weight, size, colour and alignment. Each one is a CasparCG field named after the layer (spaces become `_`, so `PLAYER NAME` is `PLAYER_NAME`).
- **Masks:** layer masks are baked into the picture. A clipping mask becomes a matte, so the clipped layer only shows inside the layer under it.
- **Layer styles:** drop shadows come across. Other styles (strokes, glows, bevels) are listed in the import report; rasterise them in Photoshop if you need them.
- **Colour:** RGB, CMYK, greyscale and indexed files, in 8, 16 or 32 bits, are converted to RGB. A flattened file comes in as one picture.

### Other programs

| Program | How to bring it in |
| --- | --- |
| Affinity Photo / Designer | Opens directly, no export needed: see Importing Affinity files below |
| After Effects | Animations: export a Lottie file with Bodymovin (Assets > Lottie) or render a PNG sequence with alpha (Assets > Sequence). A still layout: Composition > Save Frame As > Photoshop Layers..., then import the .psd |
| DaVinci Resolve / Fusion | Render the title as a PNG sequence with alpha and add it under Assets > Sequence |

Opening an After Effects or Fusion file in CG Motion shows these steps.

### Check before going on air

- **Fonts:** a .psd does not contain fonts. Install them on this PC (export embeds them in the templates), or add the font files under **Assets > Fonts**. The import report lists the fonts used.
- Text boxes are made a little wider than the text. Check each text's size and position against Photoshop.
- Smart objects come in as their picture. Adjustment layers are left out; use **Effects** on the layers instead. The report names every layer it changed or left out.

## Importing Affinity files

**File > Import Affinity file (.af, .afphoto, .afdesign)...** opens Affinity Photo, Designer and Publisher files (versions 1, 2 and 3, including Affinity by Canva's .af) directly, with no export step. Opening an Affinity file with **Open...** does the same. The Affinity file is never changed.

&#91;image: Affinity file imported: each artboard a composition, Affinity's own preview in the report\]

### What comes across

- **Artboards:** each artboard becomes its own composition at the artboard's size, so a file of several graphics becomes several templates. A page without artboards becomes one composition.
- **Layers and groups:** each becomes a null layer that its layers follow, keeping opacity, blend mode and visibility. Empty groups are left out.
- **Text:** artistic and frame text become editable text with the same font, weight, size, colour, alignment, rotation and line breaks. Each one is a CasparCG field named after the layer, or after its text when the layer has no name.
- **Shapes:** plain rectangles (with round corners) and ellipses with a solid fill and centred stroke become CG Motion shapes, so their colour stays editable. Other shapes, curves, gradients and dashed strokes are drawn into pictures at the document's resolution.
- **Pictures:** pixel layers and placed images become pictures; a placed PNG or JPEG keeps its original file.
- **Clipping and masks:** a shape that clips text becomes a matte for it. Other clipped artwork, vector masks and pixel masks are drawn into the picture with the mask applied.
- **Effects:** drop shadow and Gaussian blur map onto the layer's shadow and blur. Colour overlay and outline are drawn into the picture. Other effects are listed in the report.
- **Big illustrations:** groups of plain vector artwork (more than 12 shapes and no text) become one picture each, so a template doesn't carry hundreds of layers. In a document with more than 150 parts, every group without text becomes one picture.

### Check before going on air

- **Fonts:** an Affinity file does not contain fonts. Install them on this PC (export embeds them in the templates), or add the font files under **Assets > Fonts**. The import report lists the fonts used.
- The report shows Affinity's own preview of the file; compare each composition with it.
- Adjustment layers, live filters, glows, bevels and Affinity-only blend modes (Add, Linear Light and others) are left out or replaced with the nearest mode; the report names each one.
- If a file can't be read at all, the small preview Affinity stores inside it is imported instead, and the report says so. Export a PSD from Affinity for full quality.

## If CG Motion opens to an empty window

If the editor hasn't finished starting after 12 seconds, CG Motion asks what to do. On most PCs, **Restart without graphics acceleration** fixes it; CG Motion remembers that choice. If the graphics driver crashes, CG Motion restarts without acceleration on its own.

- **Start CG Motion (safe mode).bat**, next to Start CG Motion.bat, starts without graphics acceleration and with the default panel layout.
- Any error while starting shows in a red box at the bottom of the window. Send a screenshot of it.
- A log is kept in `%APPDATA%\cg-motion\cg-motion.log`.
- To turn graphics acceleration back on, delete the file `no-gpu` in that same folder.

## Keyboard and mouse shortcuts

**Help > Keyboard shortcuts** shows the most used ones inside the app.

| Keys | Action |
| --- | --- |
| Space | Play / pause (hold and drag in the viewer to pan) |
| , and . (or Page Up / Page Down) | Step one frame back / forward (Shift = 10) |
| Home / End | First / last frame |
| J / K | Previous / next keyframe |
| M | Add a stop marker |
| F9 | Easy ease on the selected keyframes |
| U | Show / hide the selected layers' properties |
| V, T, R, O | Select, Text, Rectangle, Ellipse tools |
| Arrow keys | Nudge the selection (Shift = 10 pixels) |
| \[ / \] | Move the layer's start / end to the playhead |
| Alt + \[ / \] | Trim the layer's start / end to the playhead |
| Ctrl + \[ / \] | Send backward / bring forward |
| Ctrl+C / Ctrl+V | Copy / paste layers or keyframes |
| Ctrl+D | Duplicate |
| Ctrl+Shift+C | Pre-compose |
| Delete | Delete the selected layers or keyframes |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S / Ctrl+Shift+S | Save / save as |
| Ctrl+O / Ctrl+N | Open / new project |
| Ctrl+E | Export template |
| Escape | Back to the Select tool, deselect keyframes |
| Ctrl (while dragging) | Move without snapping |
| F12 | Developer tools |
| Mouse wheel | Zoom the viewer at the pointer |
| Horizontal wheel or Shift + wheel | Scroll the viewer left / right |
| Middle-drag | Pan the viewer |

## Release notes

A new row is added here, newest first, with every release, listing what's new and what was fixed.

| Version | Released | What's new | Fixes |
| --- | --- | --- | --- |
| 1.0 | 9 October 2026 | First full release: Windows installer and portable app signed as RegemarkFP, RFP splash and colours, multiline text with shrink to fit, text styles with presets, tables, charts (including double bars for stat comparisons), crawls, Loopic import, vMix title import, Photoshop (.psd) import, Affinity file import (.af, .afdesign, .afphoto, .afpub), sequence optimising, motion blur, the Fit and sideways scrolling viewer controls, a tutorial project, the Data panel, textures (with halftone, gradient, radial glow, rays and rings, motion, sizing and refine controls, presets, layer masks and full CasparCG control), shadows that fall outside masks, children that do not take a parent's skew, the Hand tool and trackpad scrolling, this guide as a PDF next to the program, CasparCG control of every table cell, chart value and crawl item, a PDF variables sheet of every template with a still frame, its fields and its invokes, installed fonts embedded into exported templates automatically, and update animations (presets, or custom keyframes on each layer's own update timeline with an update marker) that play when a field changes, and text animation by letter, word or line, in and out on the timeline and per letter or word on updates | An empty grey window at startup on some PCs: CG Motion now recovers on its own, offers a restart without graphics acceleration, shows startup errors on screen, keeps a log, and has a safe-mode start file. Builds are now checked for missing editor files before an installer is made, and an incomplete installation says so instead of opening empty. An invoke's Plays list now offers every composition layer, not only those already set to run independently; choosing one sets it. Changes made inside a pre-comp didn't reach the template: Export template (and the CasparCG panel) now write the template(s) that use the open pre-comp. Pre-comps that share field names (left and right clocks) got the same values: composition layers now have a Field suffix, with a warning and one-click fix in the Control panel; a field also follows its layer when the layer is renamed. |
