"""Demo: Custom AI agent with custom tools and hooks.

This shows how to:
1. Define custom tools the LLM can call
2. Filter which built-in tools are available
3. Customize the system prompt
4. Use lifecycle hooks
5. Use a stop condition
"""
import botblocks as bk

bot = bk.Robot('SimpleCar')
bot.attach('cam', bk.Camera())

bk.Burger(x=3, z=2)
bk.Burger(x=-3, z=-3)

# --- Custom tool: log a visit ---
visit_log = []

def log_visit(ctx, **kwargs):
    """Record that we visited a location."""
    x = round(ctx.robot['x'], 1)
    z = round(ctx.robot['z'], 1)
    name = kwargs.get('name', 'unknown')
    visit_log.append({'name': name, 'x': x, 'z': z})
    ctx.data.visited = len(visit_log)
    return f"Logged visit #{len(visit_log)} to '{name}' at ({x}, {z})"

log_tool = bk.Tool(
    name="log_visit",
    description="Log that you have visited a location. Call this each time you arrive at a burger.",
    params={
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Name/label for this location"}
        },
        "required": ["name"]
    },
    handler=log_visit
)

# --- Custom tool: check progress ---
def check_progress(ctx, **kwargs):
    """Report how many locations have been visited so far."""
    n = len(visit_log)
    if n == 0:
        return "No locations visited yet. Keep exploring!"
    entries = [f"  {i+1}. {v['name']} at ({v['x']}, {v['z']})" for i, v in enumerate(visit_log)]
    return f"Visited {n} location(s):\n" + "\n".join(entries)

progress_tool = bk.Tool(
    name="check_progress",
    description="Check how many locations have been visited and list them.",
    params={"type": "object", "properties": {}, "required": []},
    handler=check_progress
)

# --- Lifecycle hook: custom observation ---
def my_observe(ctx):
    obs = f"Position: ({ctx.robot['x']:.1f}, {ctx.robot['z']:.1f}), heading: {ctx.robot['heading']:.2f} rad"
    obs += f"\nVisited so far: {len(visit_log)}"
    obs += f"\nMoving (motors: {{'left': {ctx.robot['leftMotor']:.2f}, 'right': {ctx.robot['rightMotor']:.2f}}})"
    return obs  # returning None falls back to default observation

# --- Stop condition ---
def should_stop(ctx):
    return len(visit_log) >= 2

# --- Create AI with everything custom ---
brain = bk.AI(bot,
    goal="Visit both burgers at (3,2) and (-3,-3). When you arrive near each one, "
         "call log_visit with a name. Use check_progress to see your status. "
         "After logging 2 visits, call done.",
    model="openrouter/free",
    tools=[log_tool, progress_tool],
    builtin_tools=["move_to", "look", "wait", "done"],
    prompt_preamble="You are a delivery robot on a burger collection mission.",
    on_observe=my_observe,
    stop_condition=should_stop,
    max_iterations=8,
)

async def loop():
    await brain.step()
