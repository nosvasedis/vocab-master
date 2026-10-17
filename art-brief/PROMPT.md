# Vocab Master: 16 lesson backgrounds for ChatGPT / Codex

**Attach:** `art-brief/style-reference.png` (6 existing backgrounds; the new ones must match).
**Bring back:** 16 PNGs named exactly as listed (`cave.png`, `snow.png` …) into `art-brief/incoming/`, then tell Claude.
Claude runs `node scripts/art/import-art.mjs` (crops to 1344×768, converts to WebP, adds them to the app).

---

## Prompt to paste (with the reference image attached)

```
You are illustrating background scenes for a children's English-vocabulary app (pupils aged 8–12). The pictures are projected on a classroom smartboard behind animated lessons. I've attached a style reference sheet with 6 backgrounds we already use: match that style exactly.

STYLE (identical for every image)
- Warm, joyful children's picture-book illustration: soft flat vector shapes, gentle gradients, subtle paper grain, rounded friendly forms.
- Bright pastel palette: sky blue, mint, sunny yellow, coral, lavender. Soft daylight, no harsh shadows, no dark or scary mood.
- One continuous full-bleed scene from edge to edge, with the ground reaching the bottom edge. No split panels, borders, frames or white margins.
- ABSOLUTELY NO TEXT: no letters, numbers, signs, labels, logos, writing on books or posters, clock numbers or watermarks.
- No people and no faces (the app adds its own characters on top). Animals only where the scene asks for them, small and in the background.

COMPOSITION (the app places cards, speech bubbles and characters over the picture)
- Landscape 3:2 (1536×1024). The app crops a strip from the top and bottom, so keep important things away from those edges.
- Keep the centre calm and fairly empty, with soft low-detail background there. Put the interesting details towards the left and right sides.
- Leave an open ground or floor strip across the bottom third where cartoon characters could stand.
- Put the horizon or back wall about 55–60% of the way down from the top.

THE 16 SCENES (file name: scene)
1. cave.png: a big friendly cave entrance in a rocky hillside, ferns and moss around it, soft warm light glowing inside, a sandy path leading in.
2. snow.png: a snowy winter landscape with snow-covered pine trees, a frozen pond, gentle falling snowflakes and soft blue shadows.
3. zoo.png: a cheerful zoo with wooden-fenced animal enclosures, a giraffe and an elephant small in the distance, trees and a winding path.
4. river.png: a gentle river winding through green meadows, smooth stones, reeds, a little wooden footbridge on one side.
5. museum.png: a bright museum hall with a big dinosaur skeleton to one side, glass display cases with fossils and vases (no labels), tall windows.
6. mountain.png: tall rounded mountains with snowy tops, a winding trail, pine trees and a clear blue sky.
7. jungle.png: a lush tropical jungle with giant leaves, hanging vines, colourful flowers, a small waterfall at one side, a parrot far away.
8. underwater.png: a calm underwater sea scene with coral, swaying seaweed, small colourful fish, bubbles and sunbeams from above, a sandy sea floor.
9. bedroom.png: a cosy child's bedroom with a bed with a patterned quilt, a bookshelf (blank book spines), a teddy bear and toys, a window with curtains.
10. library.png: a calm library with tall bookshelves (blank spines), reading tables and chairs, soft lamps, a big window.
11. station.png: a friendly train station platform with a red train at one side, benches, a round clock without numbers, a canopy roof.
12. volcano.png: a cartoon volcano far away with a gentle white smoke cloud, green hills and palm trees in front. Safe and friendly, no lava near the viewer.
13. savanna.png: the African savanna with golden grass, flat-topped acacia trees, a waterhole, a zebra and an elephant small in the distance, warm sunlight.
14. camp.png: a campsite by a lake with two colourful tents, a small campfire with a ring of stones, pine trees and calm water.
15. castle.png: a fairytale castle on a green hill with round towers and plain coloured flags (no symbols), a winding path and soft clouds.
16. market.png: an outdoor street market with colourful striped stalls, crates of fruit and vegetables, awnings and bunting (no price signs).

Make the images one at a time, in this order. After each image, write its file name. I will reply "next". Keep the style, palette and level of detail consistent with the reference sheet and with the images you have already made.
```

## If you use Codex (it can save files)

Add this line at the end of the prompt:

```
Save each image as art-brief/incoming/<file name> in this repository (PNG, 1536×1024). When all 16 are saved, run: node scripts/art/import-art.mjs
```

## Quality check before you accept an image

- No letters or numbers anywhere: look at clocks, books, posters and flags.
- No people.
- The centre is calm and the bottom third is open ground.
- It looks like it belongs next to the reference sheet: the same pastel colours and soft, flat style.
- If one is off, say: "Redo <file name>: <what's wrong>. Same style as the reference."
