# Python API Reference

All user scripts `import botblocks as bk`. The module provides classes for robots, sensors, objects, AI agents, and custom tools.

## Robot

```python
bot = bk.Robot('SimpleCar')
```

Creates a differential-drive robot and adds it to the simulation.

**Properties:**
- `bot.id` — Unique integer ID assigned by the sim.
- `bot.parts` — Dict of attached components.

**Methods:**
- `bot.attach(name, component)` — Attach a component (e.g., Camera). Auto-calls `component.bind(bot.id)`.
- `bot[name]` — Shortcut for `bot.parts[name]`.
- `bot.turn(amount)` — Set differential steering. Positive = left, negative = right. Range: -1.0 to 1.0.
- `bot.ok()` — Returns `True` (health check placeholder).

## Camera

```python
cam = bk.Camera()
bot.attach('cam', cam)
```

Captures 320×240 RGBA images from the robot's perspective.

**Methods:**
- `cam.bind(robot_id)` — Bind to a robot (called automatically by `attach`).
- `cam.snap()` — Capture a frame. Returns raw pixel data.

## Burger

```python
bk.Burger(x=3, z=-2)   # specific position
bk.Burger()             # random position in [-4, 4] × [-4, -1]
```

Spawns a burger object in the scene. Used as a target for testing navigation.

## Simulator

```python
sim = bk.Simulator(robots=[bot, bk.Burger()])
```

Initializes the simulation. The `robots` list can contain `Robot` instances or `Burger()` calls.

## AI

```python
brain = bk.AI(bot, goal="find the burger", model="openrouter/free")
```

Attaches an LLM-powered brain to a robot. The agent observes the world, reasons via tool-calling LLMs, and acts autonomously.

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `robot` | Robot | required | Robot to control |
| `goal` | str | `"explore the environment"` | Natural language goal |
| `model` | str | `"openrouter/free"` | LLM model identifier |
| `think_every` | float | `1.5` | Seconds between LLM calls |
| `vision` | bool | `False` | Enable camera image in LLM context |
| `tools` | list[Tool] | `None` | Custom tools the LLM can call |
| `builtin_tools` | list[str] | `None` | Filter built-in tools by name. `None` = all |
| `system_prompt` | str | `None` | Replace the auto-generated system prompt entirely |
| `prompt_preamble` | str | `None` | Prepend text to the auto-generated prompt |
| `max_iterations` | int | `5` | Max tool-call rounds per think cycle |
| `stop_condition` | callable | `None` | `fn(ctx) → bool`. Ends agent when truthy |
| `on_before_step` | callable | `None` | `fn(ctx)`. Return truthy to skip this step |
| `on_observe` | callable | `None` | `fn(ctx) → str`. Return string to override default observation |
| `on_before_think` | callable | `None` | `fn(ctx)`. Called before LLM call |
| `on_after_think` | callable | `None` | `fn(ctx, response_text)`. Called after LLM responds |
| `on_tool_call` | callable | `None` | `fn(ctx, name, args, result) → str`. Return string to override tool result |
| `on_done` | callable | `None` | `fn(ctx, reason)`. Called when agent finishes |

**Usage in loop:**
```python
async def loop():
    await brain.step()
```

### Model Selection

All models are routed through OpenRouter. Use your OpenRouter API key.

| Pattern | Example | Notes |
|---------|---------|-------|
| `openrouter/free` | `openrouter/free` | Default. Free model selected automatically by OpenRouter |
| Any OpenRouter model slug | `meta-llama/llama-3.3-70b-instruct:free` | Full model ID from openrouter.ai/models |
| OpenAI models | `gpt-4o-mini` | Routed via OpenRouter; requires credits |
| Anthropic models | `claude-3-5-haiku` | Routed via OpenRouter; requires credits |

## Tool

Define custom tools the LLM agent can call:

```python
def greet(ctx, **kwargs):
    name = kwargs.get('name', 'world')
    return f"Hello {name}!"

tool = bk.Tool(
    name="greet",
    description="Greet someone by name",
    params={
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Name to greet"}
        },
        "required": ["name"]
    },
    handler=greet
)
```

**Parameters:**
- `name` — Tool name (used by the LLM to invoke it).
- `description` — What the tool does (shown to the LLM).
- `params` — JSON Schema object describing arguments.
- `handler` — `fn(ctx, **kwargs) → str`. Called when the LLM invokes the tool.

## ToolContext (`ctx`)

Passed to all custom tool handlers and lifecycle hooks:

```python
ctx.robot    # dict: {id, x, z, heading, leftMotor, rightMotor}
ctx.sim      # object with methods: addBurger, getRobotState, getWorldState,
             #   setMotorSpeed, setNavTarget, clearNavTarget, getNavStatus, snap
ctx.data     # persistent dict (shared across all calls for this agent)
ctx.agent_id # robot ID
```

`ctx.data` persists for the lifetime of the agent — use it to track state across tool calls and hooks.

## cv.YOLO

```python
yolo = bk.cv.YOLO()
result = yolo(frame)
coords = result.find('burger')
```

Placeholder computer vision module. Returns a `Coords` object with `.x` (steering hint: -1 to 1) and `.y`.
