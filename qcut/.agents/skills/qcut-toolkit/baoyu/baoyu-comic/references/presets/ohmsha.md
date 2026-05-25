# ohmsha

Ohmsha预设 - Educational manga with visual metaphors

## Base Configuration

| Dimension | Value |
|-----------|-------|
| Art Style | manga |
| Tone | neutral |
| Layout | webtoon (default) |

Equivalent to: `--art manga --tone neutral`

## Unique Rules

This preset includes special rules beyond the art+tone combination. When `--style ohmsha` is used, ALL rules below must be applied.

### Visual Metaphor Requirements (CRITICAL)

Every technical concept MUST be visualized as a metaphor:

| Concept Type | Visualization Approach |
|-------------|----------------------|
| Algorithm | Gadget/machine that demonstrates the process |
| Data structure | Physical space characters can enter/explore |
| Mathematical formula | Transformation visible in environment |
| Abstract process | Tangible flow of particles/objects |

**Wrong approach**: Character points at blackboard explaining
**Right approach**: Character uses "Concept Visualizer" gadget, steps into metaphorical space

### Visual Metaphor Examples

| Concept | Wrong (Talking Head) | Right (Visual Metaphor) |
|---------|---------------------|------------------------|
| Attention mechanism | Character points at formula on blackboard | "Attention Flashlight" gadget illuminates key words in dark room |
| Gradient descent | "The algorithm minimizes loss" | Character rides ball rolling down mountain valley |
| Neural network | Diagram with arrows | Living network of glowing creatures passing messages |
| Overfitting | "The model memorized the data" | Character wearing clothes that fit only one specific pose |

### Character Roles (Required)

**DEFAULT: Use original, non-infringing character archetypes** unless user explicitly specifies `--characters` with licensed/authorized references or has approved character presets in EXTEND.md.

| Role | Default Character | Visual | Traits |
|------|-------------------|--------|--------|
| Student (Role A) | Curious Student | Young learner with round glasses and bright casual clothes | Confused, asks basic but crucial questions, represents reader |
| Mentor (Role B) | Gadget Mentor | Friendly guide with a compact tool satchel and glowing teaching props | Knowledgeable, patient, uses gadgets as technical metaphors |
| Challenge (Role C) | Misconception Rival | Expressive peer with bold posture and warm-colored outfit | Represents misunderstanding, or "noise" in the data |
| Support (Role D) | Insight Friend | Thoughtful classmate with neat short hair and soft-colored clothes | Asks clarifying questions, provides alternative perspectives |

**IMPORTANT**: Do not default to proprietary characters. Generate original characters with equivalent narrative roles unless the user provides authorized references.

To use custom characters: `--characters "Student:小明,Mentor:教授"` or define in EXTEND.md.

### Page Title Convention

Every page MUST have a narrative title (not section header):

**Wrong**: "Chapter 1: Introduction to Transformers"
**Right**: "The Day Nobita Couldn't Understand Anyone"

### Gadget Reveal Pattern

When introducing a concept:

1. Student expresses confusion with visual indicator (？, spiral eyes)
2. Mentor dramatically produces gadget with sparkle effects
3. Gadget name announced in bold with explanation
4. Demonstration begins - student enters metaphorical space

### Ending Requirements

Final page MUST include:

1. Student demonstrating understanding (applying the concept)
2. Callback to opening problem (now resolved)
3. Mentor's satisfied expression
4. Optional: hint at next topic

### NO Talking Heads Rule

**Critical**: Characters must DO things, not just explain.

Every panel should show:
- Action being performed
- Metaphor being demonstrated
- Character interaction with concept-space
- NOT: two characters facing each other talking

### Special Visual Elements

| Element | Usage |
|---------|-------|
| Gadget reveals | Dramatic unveiling with sparkle effects |
| Concept spaces | Rounded borders, glowing edges for "imagination mode" |
| Information displays | Holographic UI style for technical details |
| Aha moments | Radial lines, light burst effects |
| Confusion | Spiral eyes, question marks floating above head |

## Quality Markers

- ✓ Every concept is a visual metaphor
- ✓ Characters are DOING things, not just talking
- ✓ Clear student/mentor dynamic
- ✓ Gadgets and props drive the explanation
- ✓ Expressive manga-style emotions
- ✓ Information density through visual design, not text walls
- ✓ Narrative page titles

## Reference

For complete guidelines, see `references/ohmsha-guide.md`
