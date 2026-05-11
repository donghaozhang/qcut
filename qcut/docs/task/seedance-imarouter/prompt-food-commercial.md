# Prompt — Luxury Food Commercial, First 5s (seedance-2.0-fast)

**Source:** `/Users/peter/Desktop/media/food.jpeg` (12-panel storyboard, 15s total)
**Cut:** First 4 panels (0:00–5:00)
**Model:** `seedance-2.0-fast`
**Duration:** 5 s
**Resolution:** 1080p, 16:9
**Aspect ratio:** 16:9

## Storyboard reference (panels 01–04)

| t (s)       | Camera                          | Action                                | Sound design       |
| ----------- | ------------------------------- | ------------------------------------- | ------------------ |
| 0.00–1.25   | Macro / close-up                | Shrimp placed on cold plating surface | Soft ice touch     |
| 1.25–2.50   | Extreme close-up / slight push  | Shrimp hits hot sear surface          | Sizzle, sear       |
| 2.50–3.75   | Macro / slow motion             | Shrimp sears, turns golden            | Sizzle intensifies |
| 3.75–5.00   | Close-up / side angle           | Chef lifts shrimp with tongs          | Metal touch, sizzle |

**Style cues from storyboard:** cinematic realistic; dramatic / delicious / luxurious; dark fine-dining plating station at night; chef hands only (black jacket + gloves); low-key high-contrast lighting; strong backlight for steam and powder; warm highlights on shrimp; black plate, dark background; shallow depth of field, creamy bokeh. No dialogue — sound-design driven (sizzle, sprinkle, steam, plate contact, gentle kitchen ambience).

## Prompt

5-second cinematic luxury food commercial sequence. Dark fine-dining plating station at night; black plate; low-key high-contrast lighting; dramatic strong backlight; warm amber highlights on the shrimp; shallow depth of field with creamy bokeh; deep blacks, charcoal grays, golden caramel and brick-red palette.

Beat 1 (0–1.25 s): Extreme close-up of a raw plump shrimp being placed by a gloved black-clad chef hand onto a chilled black plating surface — soft delicate touch, faint kitchen ambience.

Beat 2 (1.25–2.50 s): Extreme close-up with subtle push-in as the shrimp meets a sizzling hot sear surface; first wisps of steam rise into the sharp backlight.

Beat 3 (2.50–3.75 s): Macro slow-motion of the shrimp searing — oil glistening, edges turning a rich caramel-golden, swirling steam and glowing powdered spice particles backlit against the dark backdrop.

Beat 4 (3.75–5.00 s): Close-up side angle of the chef's gloved hand lifting the perfectly seared golden shrimp with polished metal tongs; droplets catch the warm rim light.

Style: cinematic realistic, dramatic / delicious / luxurious. Macro and extreme close-ups, slow-motion highlights, subtle push-ins, stable minimal framing. Sound-design driven (sizzle, steam, plate contact, gentle kitchen ambience). No dialogue. 16:9.

## Run

```bash
cd docs/task/seedance-imarouter
node seedance-generate.mjs \
  --prompt "$(awk '/^## Prompt$/{p=1;next} /^## Run$/{exit} p' prompt-food-commercial.md)" \
  --model seedance-2.0-fast \
  --duration 5 \
  --resolution 1080p \
  --aspect-ratio 16:9 \
  --out test-food-5s.mp4
```
