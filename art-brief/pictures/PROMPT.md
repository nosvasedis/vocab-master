# Vocab Master: the complete picture set (instructions for Codex / ChatGPT)

You are making every picture for **Vocab Master**, an English-vocabulary app for Greek children aged 8–12. Today the app shows **emoji**. Emoji are often wrong or ambiguous: *sing* and *chant* share 🎤, and 🏃 stands for gym, race, escape, compete and warm-up. Your pictures replace them.

Work through `jobs.json` until every job has a picture. Follow this document exactly. When something isn't covered, choose what a child would understand **instantly and unambiguously**.

---

## 0. What is in this folder

| file | what it is |
|---|---|
| `jobs.json` | **Source of truth.** 2,828 jobs, one per image: `id`, `file`, `phase`, `kind`, `frame`, `word`, `type`, `greek`, `meaning`, `examples`, `lookalikes`, `sameLesson`, plus characters' `look` and `personas`. |
| `jobs.csv` | The same data for spreadsheets. |
| `sheets.json` | **Sheet mode:** which jobs are drawn together, six per image, and in which cell (see §10). Also lists the 95 `singles` drawn one per image. |
| `batches/` | The same jobs as paste-ready batches of 40, in phase order. `batches/INDEX.md` lists them. |
| `lookalikes.md` | 169 groups of words that currently share one emoji. These are the hardest; read it before Phase 1. |
| `characters.md` | All 86 story characters, with fixed looks for the recurring ones. Append the looks you design. |
| `../style-reference.png` | Six of the app's lesson backgrounds. Match their colours and softness. |
| `sheets-incoming/` | **Save every generated sheet here** as `sheets-incoming/<sheet id>.png`. The slicer cuts it and moves it to `sheets-done/`. |
| `incoming/` | Finished single pictures, `incoming/<file>` (for example `incoming/w-carrot.png`): cut from sheets by the slicer, or saved there directly for singles. |

Helper scripts (run from the repository root):

- `node scripts/art/check-pictures.mjs`: what's done, missing or invalid. It writes `art-brief/pictures/PROGRESS.md`.
- `node scripts/art/slice-sheet.mjs`: cuts every sheet in `sheets-incoming/` into single pictures in `incoming/` and flags cells it could not cut cleanly.
- `node scripts/art/picture-sheet.mjs --batch <batch file name>` or `--phase <n>`: a review sheet in `art-brief/pictures/review/` for checking finished pictures at a glance.
- `node scripts/art/import-pictures.mjs`: converts finished pictures for the app. Claude normally runs this, but you may run it at the end of each phase.

---

## 1. Where the pictures appear (why the rules exist)

- **Word cards:** about 290 px on a 1920×1080 projector stage, often 8–14 side by side on a word wall.
- **Inline in sentences**, next to the word at about **44 px**: "my hat 🎩". The picture must still read at that size.
- **Pop-ups:** 230 px, floating over a lesson background.
- **Quiz answers and game tiles:** a child must pick the right picture among four, so pictures from the same lesson must be **instantly distinguishable**.
- **Story characters:** about 260 px tall, standing on the ground of an illustrated background, beside speech bubbles.
- **Phone avatars** in the live quiz game: about 60 px.

So every picture needs **one clear subject, a bold readable silhouette, few details, no thin lines, and no text**.

---

## 2. Output format (every image)

- **PNG, 1024 × 1024, transparent background (alpha).** With an OpenAI image model use `size: "1024x1024"`, `background: "transparent"`, `output_format: "png"`, `quality: "high"`.
  - If your tool cannot make transparency, use a **flat pure magenta `#FF00FF` background** and never use magenta in the subject. The importer removes it.
- Subject **centred**, filling about **80 %** of the canvas, with at least **6 % empty margin** on every side. Nothing may touch or be cut by the edge.
- One image per job, saved as exactly `incoming/<file>` (the `file` field), lowercase. No other files in `incoming/`.
- A soft, light contact shadow under objects and people is allowed, as part of the image. Nothing else around the subject: no card, frame, border, sticker outline or background colour.

---

## 3. Style bible (paste this into every generation)

> Warm, joyful children's picture-book illustration in soft flat vector shapes with gentle gradients and a very subtle paper grain. Rounded, friendly forms; bold simple silhouette; minimal detail; no thin lines. Bright but soft palette (sky blue, mint, sunny yellow, coral, lavender, leaf green, warm skin tones), slightly more saturated than a pastel background so the subject pops. Soft daylight from the upper left, a slightly darker edge tone instead of black outlines. Friendly faces with simple dot eyes and small smiles. Single subject, centred, on a transparent background. Absolutely no text, letters, numbers, labels, logos, signs or writing anywhere. Not a photo, not 3D render, not emoji style.

Also attach as references: `../style-reference.png`, and after Phase 0, `anchor-sheet.png`.

**Consistency matters more than variety.** The finished set should look as if one illustrator drew all 2,828 pictures in one week.

---

## 4. Allowed and forbidden visual conventions

**Allowed**, because children read these instantly:
- Musical notes ♪ (only for singing, music, melody, humming).
- Speech or thought bubbles that contain **pictures only**.
- Small sparkles or light rays (shine, bright, new, clean).
- A sweat drop or a blush.
- Small dust puffs behind running feet.
- Hearts only where the meaning is love or kindness.
- Steam over hot food.
- A clock face **without digits** (dots for hours) for time words.

**Forbidden:**
- Letters, words, numbers or digits, including on books, posters, signs, shirts, flags and screens.
- Arrows, ticks, crosses, equals signs, plus or minus signs.
- Question and exclamation marks.
- Red "no" circles.
- Split panels, before/after diptychs, comic strips.
- Emoji-like smiley faces as the whole picture.
- Brand logos, real celebrities.
- Anything scary, violent, sad-and-dark, or adult. For danger or harm words show the safe or helpful side: *fire* is a campfire safely in a ring of stones; *sting* is a bee near a slightly startled child, no wound.

---

## 5. Frames: how to compose each kind of job

Every job has a `frame`. Follow its rule.

| frame | rule |
|---|---|
| `object` | The thing itself, isolated, in its most typical child-recognisable form, from a clear angle (usually three-quarter view). Plural words such as *apples* or *ants* get 2–3 of them. Collective words such as *food*, *clothes* or *furniture* get 3–4 typical items grouped tightly as one cluster. |
| `scene` | A **round vignette**: a soft-edged circle about 90 % of the canvas, containing a tiny scene of the place, weather or time of day, transparent outside the circle. *beach*, *city*, *winter*, *night*, *flood*. |
| `person` | One person, or a small group if plural, who is clearly this role, recognisable by clothes and one tool: firefighter with helmet and hose, doctor with stethoscope. Family words: show the relation with two figures, e.g. *aunt* is a woman holding a child's hand, warm and close. |
| `action` | **Mia or Leo** (see §6) clearly **doing** the action, one action only, with the key object. Show motion with pose; small dust puffs are allowed, arrows never. Phrasal verbs and phrases (*put on*, *take care of*, *play soccer*) work the same way. |
| `quality` | Adjectives and adverbs: one clear example that makes the quality obvious. Use contrast **inside one picture** when needed: *enormous* is an enormous elephant beside a small Leo; *slowly* is Mia walking a snail on a leash, relaxed. Never symbols. |
| `relation` | Prepositions: a **yellow ball** and a simple **blue box or table** placed to show the relation exactly (*under*, *on*, *between*, *behind*, *in front of*). Keep the same yellow ball and blue box across all prepositions so the set reads as a series. |
| `character` | Story character, full body, standing, slight three-quarter turn towards the viewer, friendly expression, arms relaxed, feet on a soft contact shadow, the whole figure inside the margins. |

**Abstract nouns** (*advice*, *opinion*, *memory*, *invention*, *culture*, *tradition*): show the most typical **concrete moment**, using the `examples` sentence. *advice*: Grandma Eleni kindly talking to Leo with a thought bubble of a bicycle helmet. *memory*: Mia smiling with a thought bubble of a birthday cake. *invention*: Leo proudly beside a small home-made robot. Keep each one different from its look-alikes.

**Words whose meaning depends on context:** use `meaning`, `greek` and `examples` to pick the right sense. *bat* (νυχτερίδα) is the animal. *plate* (in "Plates under the Earth's crust") is two big pieces of rocky ground. *seal* (envelope) is a wax seal on an envelope. When `greek` is present it decides the meaning.

**Irregular verb entries** (*sting-stung*, *hide - hid - hidden*): one picture of the action.

**Countries and nationalities** (*Japan*, *Colombia*, *Turkish*): a soft single-colour map silhouette of the country with one iconic landmark or object on it (Mount Fuji, a coffee plant, a tulip and simit). No flags with writing, no text.

**Time words** (*nine o'clock*, *Monday*, *weekend*): *nine o'clock* is a round clock with dot markers and hands at nine. Days of the week are a scene of what typically happens: *Saturday* is Mia and Leo at the park, *Monday* is Leo walking to school with his schoolbag.

**Colour words:** a friendly object in that colour (*orange*: a fruit-free paint splash or a crayon in that colour), so it doesn't clash with the fruit *orange*.

---

## 6. The model kids, and adults

Verb and adjective pictures use the two most familiar story children, so pupils recognise them:

- **Mia**: 9-year-old girl, warm light-brown skin, dark brown hair in two puffy pigtails with yellow bobbles, big brown eyes, sunny yellow T-shirt with a small star (no letters), denim dungaree shorts, white trainers with yellow laces.
- **Leo**: 9-year-old boy, light olive skin, short messy black hair with a tuft at the front, green eyes, freckles, sky-blue hoodie with a white stripe, navy shorts, red trainers.

Alternate them fairly. Use both when the action needs two people (*share*, *agree*, *take turns*). For adult actions, use **Grandma Eleni** or **Grandpa Nikos** (looks in `characters.md`) or a generic adult that fits.

---

## 7. Telling look-alikes apart (the most important section)

Every word job lists `lookalikes` (words that used to share its emoji) and `sameLesson` (words shown beside it in the same lesson). **No two of those may look alike.** Before drawing a word, read both lists and choose a subject, pose, setting or colour story that the others won't use.

Worked examples. Apply the same thinking to every group in `lookalikes.md`:

| words | how to make them unmistakable |
|---|---|
| **sing (songs)** vs **chant** | *sing*: Mia alone, eyes happily closed, mouth open in an "O", hand on chest, three floating music notes. *chant*: a small group (Mia, Leo and a friend) facing forward, fists punching the air in rhythm, mouths open together, clap-lines between hands, **no music notes**. |
| **hum** | Leo with lips closed, a gentle smile, two tiny wavy notes coming from his closed mouth, eyes half closed. |
| **run / race / run away / escape / compete / warm-up / gym / move / activity** | *run*: Leo running on a path. *race*: two kids side by side at a finish ribbon. *run away*: Mia running away from a playful puppy, looking back. *escape*: a hamster squeezing out of an open cage door. *compete*: two kids each lifting a trophy-shaped cup in a tug-of-war. *warm-up*: Leo stretching his arms up beside a football. *gym*: a vignette of a sports hall with a climbing rope and mats. *move*: Mia pushing a big box across the floor. *activity*: Mia doing a craft with scissors and paper at a table. |
| **turn on / turn off / switch off / go out / light bulb** | *turn on*: Leo's finger pressing a wall switch, ceiling lamp glowing. *turn off*: the same switch pressed down, lamp dark, room dimmer, Leo in pyjamas. *switch off*: Mia pressing the power button on a TV that goes dark. *go out*: a candle flame becoming a curl of smoke. *light bulb*: the bulb object, alone, glowing. |
| **suggest / suggestion / explanation / invention / invent / main idea** | *suggest*: Mia leaning in, pointing to a park on a map, with Leo listening. *explanation*: Leo at a small whiteboard drawing a simple picture of the water cycle (pictures only). *invention*: a home-made robot on a table. *invent*: Leo building that robot with a screwdriver. *main idea*: an open picture book with one big bright picture of a lion in the centre of the page. |
| **agree / disagree** | *agree*: Mia and Leo smiling and nodding, doing a high five. *disagree*: Mia and Leo facing each other, both with arms crossed and heads shaking, frowning gently. |
| **compare / investigate / discover / identify / clue / detail / observation** | *compare*: Mia holding two apples, one in each hand, looking from one to the other. *investigate*: Leo crouching with a magnifying glass over footprints. *discover*: Mia opening a small treasure chest, glowing. *identify*: Leo pointing at one leaf among three different leaves. *clue*: a single muddy footprint beside a dropped glove. *detail*: a close-up of a ladybird's spots inside a magnifying-glass circle. *observation*: Mia writing in a notebook (pictures only) while watching a bird. |
| **bright / shine / daylight / weather** | *bright*: a lamp beaming strong light, Leo shading his eyes. *shine*: Mia polishing a shoe until it sparkles. *daylight*: a window vignette with sunshine pouring in. *weather*: a vignette with sun, cloud and rain together over a hill. |
| **huge / enormous / large** | *huge*: a huge pumpkin with Mia beside it. *enormous*: an enormous whale beside a small boat. *large*: a large T-shirt hanging down to Leo's knees. |
| **calm / relaxed / relaxing / comfortable** | *calm*: a still lake with a duck. *relaxed*: Leo lying in a hammock. *relaxing*: a warm bath with bubbles. *comfortable*: Mia sinking happily into a soft armchair with a blanket. |
| **happy / excited / amazing / wonderful / feelings / express** | *happy*: Mia smiling with a balloon. *excited*: Leo jumping with both arms up beside a present. *amazing*: Mia's face with a wide-open mouth looking at fireworks. *wonderful*: a rainbow over a meadow. *feelings*: three small faces of Mia in a row, happy, sad and surprised, as one cluster. *express*: Leo painting a big smiling sun on an easel. |
| **hold / keep / pick up** | *hold*: Mia holding a kitten gently in both arms. *keep*: Leo putting a shell into his treasure box. *pick up*: Mia bending to pick up a ball from the floor. |
| **toy / teddy bear / broken / fit** | *toy*: a wooden toy train. *teddy bear*: a teddy bear. *broken*: a toy car with a wheel off. *fit*: a puzzle piece clicking into its place. |
| **noise / thunder / booming** | *noise*: Leo covering his ears next to a loud drum. *thunder*: a dark-grey cloud with a lightning bolt over a house. *booming*: a big hound barking, with three wide sound arcs. |
| **violin / double bass / orchestra / string instrument / classical music / tune** | *violin*: the violin and bow. *double bass*: a tall double bass taller than Leo beside it. *orchestra*: a semicircle of tiny musicians. *string instrument*: a harp. *classical music*: a vignette of a concert stage with a grand piano. *tune*: Mia tuning a guitar, ear close to the strings. |

**Within one lesson** (`sameLesson`), make sure colours and subjects differ too. Eight pictures from one lesson should not all be orange, or all be Mia.

---

## 8. Characters (kind `character`, 86 jobs)

- Use the fixed `look` when one is given. Otherwise design one from `role` and `personas`, keeping it **different** from every look already used (hair, skin tone, main outfit colour). Then add a line to `characters.md` under "Looks chosen", for example `c-mila-child: girl, long auburn plait, green raincoat, yellow boots`.
- **Same name with a different role means a different character**: `c-nikos-child`, `c-nikos-doctor`, `c-nikos-tour-guide` and `c-ranger-nikos-ranger` are four separate people. `c-maya-child` and `c-maya-firefighter` are different too.
- **Animals** (`hare`, `chipmunk`, `hound`, `rooster`, `squirrel`, `donkey`, `bee`): natural animals with friendly faces and natural colours, no clothes unless the persona says so. Each animal character gets one small identifying detail: Hector the shy hare has drooping ears and a slight blush; Hetty the brave hare has a perky stance and one ear up.
- **Puppets** (`c-pino-puppet`, `c-pinocchio-puppet`): wooden puppet boys with visible joints; Pinocchio has a slightly long nose and a little hat. Keep the two different from each other.
- **The bread bun** (`c-bun-bread-bun`): a round golden bread bun with a happy face and little arms and legs (the gingerbread-man idea).
- **Giants** (`c-bruno-the-giant-giant`, `c-gus-giant`): very tall, gentle, kind faces, simple clothes. Draw a tiny tree at their ankle for scale.
- Children are about 9–10 years old, in modern everyday Greek-school clothes, a diverse mix. Professionals wear their uniform.

---

## 9. Game avatars (`ui-*`, 20 jobs)

The 16 phone avatars are head-and-shoulders animal portraits, big friendly eyes, front view, each with a different dominant colour. The 4 team mascots are a rocket, a tiger cub, a dolphin and a baby dragon. All are designed to be recognisable at 60 px.

---

## 10. How to work (exact loop)

Most pictures are drawn **six at a time on one sheet** and cut apart by a script (*sheet mode*). That makes 589 generations instead of 2,828. `sheets.json` says which jobs go on which sheet.

- **Singles (95 jobs, one image each):** the 12 Phase 0 anchors and all 83 other story characters. Faces and outfits need full attention.
- **Sheets (494 sheets, 2,733 jobs):** everything else. Phase 1 sheets are grouped by lesson (`s1-CPP1-U1-A-1` holds lesson words from CPP1 Unit 1 Part A), so the words on a sheet are the look-alikes a child must tell apart. Drawing them side by side helps you make them different.

### Sheet format (every sheet)

- **1536 × 1024 PNG**, transparent background (or flat `#FF00FF` magenta), a **3 × 2 grid of invisible 512 × 512 cells**:

  ```
  +-----+-----+-----+
  |  1  |  2  |  3  |
  +-----+-----+-----+
  |  4  |  5  |  6  |
  +-----+-----+-----+
  ```
- Cell `n` in `sheets.json` goes in that position (row by row, left to right).
- **Each item sits in the middle of its own cell** and stays inside the inner 80 % of it (about 410 × 410 px), so there is a **wide empty gap (at least 60 px) between items**. Nothing touches, overlaps or crosses into another cell. Shadows and small parts (music notes, motion puffs) stay close to their item.
- **Cells not listed stay completely empty.** Many sheets have 4 or 5 items.
- **No grid lines, no frames, no numbers, no labels, no text**, and no background scene. Only the six (or fewer) separate pictures.
- Every item follows §2–§9 exactly as if it were drawn alone (frame, model kids, look-alikes). Plurals show two or three of the thing, close together, so they read as one item.

### The loop

1. **Phase 0, anchors (12 singles).** Generate the 12 jobs in `batches/phase-0-anchors-001.md`, one image each, saved as `incoming/<file>`. Then run
   `node scripts/art/picture-sheet.mjs --phase 0`
   and copy `art-brief/pictures/review/phase-0.png` to `art-brief/pictures/anchor-sheet.png`. Check it against §2–§7.
   - It must include *sing songs* and *chant* looking clearly different, Mia and Leo exactly as described, and every picture with a transparent background and no text. Redo any anchor that fails, then rebuild the anchor sheet.
   - Do not wait for a human. Continue straight away.
   - From now on, **attach `anchor-sheet.png` and `../style-reference.png` to every generation** as style references.
2. **Characters (83 singles, Phase 1).** Generate every job whose `kind` is `character` that is still missing, one image each, as `incoming/<file>`. Append any look you design to `characters.md`.
3. **Sheets, in `sheets.json` order** (phase 1, then 2, 3, 4, 5). For each sheet:
   1. Look up each cell's job in `jobs.json` (`id`).
   2. Build the sheet prompt from the template below.
   3. Generate one image and save it as **`sheets-incoming/<sheet id>.png`** (for example `sheets-incoming/s1-CPP1-U1-A-1.png`).
   4. Run **`node scripts/art/slice-sheet.mjs`**. It cuts each item into `incoming/<file>` (1024 × 1024, centred) and moves the sheet to `sheets-done/`. It prints the cells it could not cut cleanly (empty, spilling into a neighbour, or touching another item).
   5. **Open every picture it just cut** and check it shows *its own* word: an item in the wrong cell is cut under the wrong name. If a picture shows the wrong word or breaks a rule, delete it from `incoming/` and draw that job **as a single image** (1024 × 1024, template for singles below).
   6. Draw every **flagged** cell as a single image too. `check-pictures` lists them under "Redraw as single images".
   7. If a whole sheet comes out badly (wrong layout, merged items), delete its pictures from `incoming/`, delete the sheet from `sheets-done/` and generate the sheet again once. If it fails twice, draw its jobs as singles.
4. **After every 10 sheets:**
   1. Run `node scripts/art/check-pictures.mjs` (progress, problems, flagged cells, next sheets).
   2. Run `node scripts/art/picture-sheet.mjs --phase <n>` and look at `review/phase-<n>.png`. **Redo** (as singles) any picture that breaks a rule: text or letters, cut off, background not transparent, wrong meaning, looks like one of its look-alikes, off-style, scary.
5. **Truly unpicturable words** (rare, for example *yourself*, *type* in the abstract sense): add `{ "id": "<id>", "reason": "<why>" }` to `art-brief/pictures/skipped.json` instead of drawing, and leave its cell empty if its sheet isn't drawn yet. Use this for under 1 % of jobs; almost every word can be shown as a concrete moment.
6. When a phase is complete (no missing jobs and no flagged cells left in it), run `node scripts/art/import-pictures.mjs`. It converts `incoming/` pictures for the app and moves the originals to `done/`. Then continue with the next phase. Stop only when `check-pictures` reports 0 missing.

**Resuming:** `check-pictures` is the memory. Sheets in `sheets-done/` are finished; sheets in `sheets-incoming/` still need slicing; "Next sheets" and "Redraw as single images" in `PROGRESS.md` say what to do next. Never redraw a job whose file is already in `incoming/` or `done/`.

**Sheet prompt template** (one block per listed cell):

```
STYLE: <the style bible from §3>
REFERENCES: style-reference.png (backgrounds) and anchor-sheet.png (picture style, Mia and Leo).
LAYOUT: one 1536x1024 PNG, transparent background, an invisible 3x2 grid of 512x512 cells numbered
1 2 3 (top row) and 4 5 6 (bottom row). Draw exactly one separate picture in the centre of each listed
cell, inside the inner 80% of the cell, with wide empty space between pictures. Leave unlisted cells empty.
No grid lines, frames, numbers, labels, text or background scene.
CELL <n>: "<word>" (<type>). Meaning: <meaning, or the sense given by the Greek "<greek>">.
  Used in: "<examples[0]>". FRAME: <frame> — <direction>.
  Must differ from: <lookalikes + sameLesson words>. <Your one-line plan for how it differs.>
CELL <n>: …
```

**Single-image template** (anchors, characters, flagged or redone cells):

```
STYLE: <the style bible from §3>
REFERENCES: style-reference.png (backgrounds) and anchor-sheet.png (picture style, Mia and Leo).
SUBJECT: "<word>" (<type>). Meaning: <meaning, or the sense given by the Greek "<greek>">.
Used in: "<examples[0]>"
FRAME: <frame> — <direction>
MAKE IT DIFFERENT FROM: <lookalikes + sameLesson words>. <Your one-line plan for how this picture differs.>
OUTPUT: 1024x1024 PNG, transparent background, subject centred with a 6% margin, no text, no letters, no numbers, no arrows.
```

For characters: `SUBJECT: story character <name> (<role>). Look: <look>. Personality: <personas[0]>. FRAME: character …`

For avatars (on sheets): `CELL <n>: <what>.`

---

## 11. Quality checklist (every picture)

- [ ] Shows the right **meaning**, checked against `meaning`, `greek` and `examples`.
- [ ] A 9-year-old would name it correctly in 2 seconds, even at 44 px.
- [ ] Clearly different from every word in `lookalikes` and `sameLesson`.
- [ ] No text, letters, numbers, arrows, ticks, crosses, question or exclamation marks.
- [ ] Transparent background (or flat `#FF00FF`), centred, nothing touching the edges.
- [ ] Same style as `anchor-sheet.png`: soft flat vector, rounded, gentle gradients, no black outlines.
- [ ] Mia and Leo look exactly like their descriptions. Named characters match `characters.md`.
- [ ] Friendly and safe for children.
- [ ] Saved as exactly `incoming/<file>` (singles) or cut there by the slicer (sheets), and showing *its own* word.

---

## 12. Phases and counts

| phase | what | images | generations |
|---|---|---|---|
| 0 | anchors (style check: Mia, Leo, Grandma Eleni, house, carrot, bee, beach, sing songs, chant, run, enormous, under) | 12 | 12 singles |
| 1 | the other story characters and all lesson words | 781 | 83 character singles + sheets |
| 2 | things the stories mention (props) that aren't lesson words | 230 | sheets |
| 3 | game avatars and team mascots | 20 | sheets |
| 4 | the rest of the coursebook word bank: nouns (worksheets and games) | 994 | sheets |
| 5 | the rest of the word bank: verbs, adjectives, phrases, adverbs, prepositions | 791 | sheets |
| | **total** | **2,828** | **589** (95 singles + 494 sheets) |

Phases 0–3 make the lessons and the live quiz fully illustrated. Phases 4–5 cover every worksheet and game word.
