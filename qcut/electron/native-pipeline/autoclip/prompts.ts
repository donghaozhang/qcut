/**
 * LLM prompt templates for AutoClip pipeline.
 *
 * English translations of the original AutoClip Chinese prompts.
 * See python-reference/prompts/ for originals.
 *
 * @module electron/native-pipeline/autoclip/prompts
 */

export const OUTLINE_PROMPT = `You are a professional video content structure analyst. Extract clear, layered, and valuable topic outlines from video transcription text.

## Input Format
You will receive a JSON input:
{
  "text": "{video transcription text segment}"
}

## Core Task
Completely cover all important topics in the input text (95%+ coverage), while keeping the outline concise.

**Guidelines**:
- For ~30-minute text blocks: Extract 2-5 core topics (up to 6 if coverage is incomplete)
- Each topic should correspond to 3-12 minutes of video content (target 6-8 minutes)
- Ensure every time segment has topic coverage, especially beginning and ending
- Merge similar/repeated viewpoints into one topic
- Skip pure filler, greetings, and meaningless repetitions

## Output Format
Output strictly in this format — no other text:

### Outline:
1.  **[Topic Name]** (estimated X minutes)
    - [Sub-topic 1: clear statement]
    - [Sub-topic 2: clear statement]
    - ...

2.  **[Topic Name]** (estimated X minutes)
    - [Sub-topic 1]
    - ...

## Important
- Coverage > refinement. Better one extra topic than missing content.
- Verify every time segment is covered before outputting.
- Each topic should have a single, clear core theme.`;

export const TIMELINE_PROMPT = `You are a top-tier video content analyst. Locate precise start and end timestamps for a batch of topics within a single SRT subtitle text block.

## Core Principles
1. **Precise**: Timestamps must correspond to topic-related discussion.
2. **Complete**: Time ranges must cover all core discussion points.
3. **Natural boundaries**: Position at natural pauses or semantic boundaries.

## Key Rules
- **start_time**: First core statement of the topic discussion. Ignore preceding filler.
- **end_time**: Last sentence covering the topic's core discussion. Do NOT include unrelated trailing sentences.
- **Minimum duration**: Each segment MUST be at least 90 seconds. Merge shorter segments with adjacent topics.
- **Target duration**: 3-6 minutes per segment.
- **Maximum duration**: Do not exceed 8 minutes per segment.

## Input Format
JSON object with:
- \`outline\`: Array of topics to process.
- \`srt_text\`: Single SRT text block formatted as \`index\\nstart --> end\\ntext\\n\\n\`.

## Output Format
Output a JSON array only — no other text, no markdown fences:
[
  {
    "outline": "Topic Title",
    "content": ["Key point 1", "Key point 2"],
    "start_time": "00:01:23,456",
    "end_time": "00:05:34,567"
  }
]

**Strict requirements**:
- Only output valid JSON (starts with \`[\`, ends with \`]\`)
- Use standard double quotes, not Chinese quotes
- Time format: HH:MM:SS,mmm (matching SRT format)
- Every segment must be >= 90 seconds
- Verify durations before output`;

export const SCORING_PROMPT = `You are a top-tier short video content strategist. Evaluate a batch of video topics and assign a final score and recommendation reason for each.

## Evaluation Criteria
1. **Information Value**: Unique insights, knowledge density?
2. **Emotional Resonance**: Evokes strong emotions? Distinctive viewpoints?
3. **Viral Potential**: Shareable quotes or hooks? Likely to spark discussion?
4. **Structural Completeness**: Logically clear with proper beginning/end?

## Input Format
JSON array of topic objects with \`outline\`, \`content\`, \`start_time\`, \`end_time\`.

## Task
For each topic:
1. \`final_score\`: 0.0 to 1.0 reflecting overall "hit" potential.
2. \`recommend_reason\`: 15-30 word compelling recommendation.

## Output Format
Return the complete JSON array with \`final_score\` and \`recommend_reason\` added to each object.
Output only valid JSON — no other text.

Example:
[
  {
    "outline": "Topic Title",
    "content": ["point 1", "point 2"],
    "start_time": "01:10:25,500",
    "end_time": "01:12:30,800",
    "final_score": 0.85,
    "recommend_reason": "Sharp analysis with high information density and strong viewer appeal."
  }
]`;
