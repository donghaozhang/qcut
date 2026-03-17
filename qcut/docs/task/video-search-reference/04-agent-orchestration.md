# Agent Orchestration — Hierarchy & Workflows

## Agent Hierarchy

```
Top Agent (top_agent.py)
  ├── Search Agent (search_agent.py)
  │     ├── Embed Search Tool
  │     ├── Attribute Search Tool
  │     └── Fusion Reranker
  ├── Critic Agent (optional)
  │     └── VLM Verification (Cosmos Reason2)
  └── Report Agent (for summarization)
        └── Multi-clip analysis + chart generation
```

## Search Agent Workflow

Uses **LangGraph** state machine for:
- Conditional branching (has attributes? has action?)
- Parallel tool execution (embed + attribute search simultaneously)
- State aggregation across search results
- Streaming output via `AgentMessageChunk`

### State Flow

```
User Query
  → Query Decomposition (LLM extracts attributes)
  → Branch:
      ├── has_action=True + attributes → Fusion path
      ├── has_action=False + attributes → Attribute-only
      └── no attributes → Embed-only
  → Execute search(es)
  → Collect results
  → Optional: VLM critic verification
  → Stream results to UI
```

## Configuration

**Source**: `configs/config.yml`

Key sections:
```yaml
functions:
  embed_search:
    _type: embed_search
    cosmos_embed_endpoint: ${COSMOS_EMBED_ENDPOINT}
    es_endpoint: ${ELASTIC_SEARCH_ENDPOINT}
    es_index: ${ELASTIC_SEARCH_INDEX}

  search_agent:
    _type: search_agent
    embed_search_tool: embed_search
    attribute_search_tool: attribute_search
    use_attribute_search: true

workflow:
  _type: top_agent
  subagent_names:
    - search_agent
```

## Critic Agent (VLM Verification)

Optional post-processing step:
1. Extract frames from candidate clips
2. Send to Cosmos Reason2 VLM
3. Ask: "Does this clip contain [search query]?"
4. Rescore based on VLM confidence
5. Filter out false positives

## Streaming Results

Results stream to the UI as `AgentMessageChunk` objects:
```python
class AgentMessageChunk:
    type: str           # "search_result", "status", "error"
    data: dict          # Result payload
    metadata: dict      # Timing, scores, etc.
```

This enables real-time UI updates as results arrive (no waiting for all results).
