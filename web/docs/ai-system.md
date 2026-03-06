# AI System

The AI system gives robots LLM-powered brains that observe, reason, and act in the simulation. It uses [OpenRouter](https://openrouter.ai) as the sole active provider, giving access to 100+ models with a single API key.

## Provider Architecture

All providers implement the `LLMProvider` interface:

```typescript
interface LLMProvider {
  chat(messages: AgentMessage[], tools: ToolDef[]): Promise<ProviderResponse>
}
```

### Active Provider

| Provider | Endpoint | Key Header |
|----------|----------|------------|
| **OpenRouter** | `https://openrouter.ai/api/v1/chat/completions` | `Authorization: Bearer` |

All models (including `gpt-4o-mini`, `claude-*`, etc.) are routed through OpenRouter. Direct OpenAI and Anthropic providers are implemented but currently commented out in `src/ai/index.ts`.

The default model is `openrouter/free` which selects a free model automatically.

## Agent Reasoning Loop

Each agent runs this cycle on `step(dt)`:

```
1. Check wait timer → skip if still waiting
2. Check think interval → skip if too soon
3. Call onBeforeStep hook → skip if truthy
4. Enter think():
   a. Get observation (onObserve hook or built-in "look")
   b. Capture camera image (if vision enabled)
   c. Call LLM with history + tools
   d. Loop: execute tool calls, append results to history
   e. Handle __WAIT__ (pause agent) or __DONE__ (stop agent)
   f. Check stopCondition hook
   g. Repeat tool loop up to maxIterations
5. Trim history to maxHistory messages
```

### Agent States

| State | Meaning |
|-------|---------|
| `idle` | Waiting for next think interval |
| `thinking` | LLM call in progress |
| `waiting` | Paused (e.g., after `move_to`, waiting for robot to arrive) |
| `done` | Goal achieved or stop condition met |

## Built-in Tools

| Tool | Arguments | Description |
|------|-----------|-------------|
| `move_to` | `x: number, z: number` | Navigate to coordinates. Returns `__WAIT__` with ETA. |
| `look` | (none) | Observe world: position, heading, objects, distances, angles. |
| `look_image` | (none) | Capture camera frame (vision mode only). |
| `turn` | `amount: number` | Differential steering. -1.0 (right) to 1.0 (left). |
| `drive` | `left: number, right: number` | Direct motor control. Each -2.0 to 2.0. |
| `stop` | (none) | Zero both motors. |
| `get_position` | (none) | Returns `x, z, heading`. |
| `wait` | `seconds: number` | Pause for 0.5–10 seconds. Robot keeps current motion. |
| `done` | `reason: string` | Signal goal achieved. Stops agent permanently. |

## Custom Tools

Define tools in Python and pass them to `bk.AI()`:

```python
def my_handler(ctx, **kwargs):
    return f"Result: {kwargs.get('value')}"

tool = bk.Tool(
    name="my_tool",
    description="Does something useful",
    params={"type": "object", "properties": {"value": {"type": "string"}}, "required": ["value"]},
    handler=my_handler
)

brain = bk.AI(bot, goal="...", tools=[tool])
```

The handler receives a `ToolContext` (`ctx`) and keyword arguments parsed from the LLM's JSON call.

## Lifecycle Hooks

All hooks receive a `ToolContext` as the first argument.

| Hook | Signature | Behavior |
|------|-----------|----------|
| `on_before_step` | `fn(ctx)` | Return truthy to skip this step entirely |
| `on_observe` | `fn(ctx) → str` | Return string to replace default observation |
| `on_before_think` | `fn(ctx)` | Called just before the LLM call |
| `on_after_think` | `fn(ctx, text)` | Called after LLM responds with `text` |
| `on_tool_call` | `fn(ctx, name, args, result) → str` | Return string to override tool result |
| `on_done` | `fn(ctx, reason)` | Called when agent finishes |
| `stop_condition` | `fn(ctx) → bool` | Return truthy to end agent |

## AgentManager

`AgentManager` (in `src/ai/index.ts`) handles:
- API key storage/retrieval (persisted to `localStorage`)
- Provider selection based on model string and available keys
- Agent creation (`createAgent`, `createAgentFromConfig`)
- Per-frame stepping of all active agents
- Agent log and status retrieval

## System Prompt

The auto-generated system prompt includes:
- The goal statement
- Available tool descriptions
- Coordinate system explanation (heading 0 = +X, angles: positive = left)
- Navigation strategy (observe → calculate → move_to → repeat)

Override with `system_prompt` (full replacement) or `prompt_preamble` (prepended to the auto-generated prompt).
