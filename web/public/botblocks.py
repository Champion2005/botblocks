import _bridge, random, math
from pyodide.ffi import create_proxy, to_js

def Burger(x=None, z=None):
    bx = x if x is not None else random.uniform(-4, 4)
    bz = z if z is not None else random.uniform(-4, -1)
    _bridge.addBurger(bx, bz)

class Camera:
    def __init__(self): self.id = None
    def bind(self, robot_id): self.id = _bridge.addCamera(robot_id)
    def snap(self): return _bridge.snap(self.id)

class Robot:
    def __init__(self, kind='SimpleCar'):
        self.id = _bridge.addRobot()
        self.parts = {}
        _bridge.start()
    def attach(self, name, c):
        self.parts[name] = c
        if hasattr(c, 'bind'): c.bind(self.id)
        return c
    def __getitem__(self, name): return self.parts[name]
    def ok(self): return True
    def turn(self, amount):
        _bridge.setMotorSpeed(self.id, 'left', 1.0 - amount)
        _bridge.setMotorSpeed(self.id, 'right', 1.0 + amount)

class Simulator:
    def __init__(self, robots=[]):
        [R() for R in robots if callable(R)]


class ToolContext:
    """Context object passed to custom tool handlers and lifecycle hooks."""
    def __init__(self, js_ctx):
        self._js = js_ctx
        robot_js = js_ctx.robot
        self.robot = {
            'id': getattr(robot_js, 'id', 0),
            'x': getattr(robot_js, 'x', 0),
            'z': getattr(robot_js, 'z', 0),
            'heading': getattr(robot_js, 'heading', 0),
            'leftMotor': getattr(robot_js, 'leftMotor', 0),
            'rightMotor': getattr(robot_js, 'rightMotor', 0),
        }
        self.sim = js_ctx.sim
        # data is a shared JS object — read/write persists across calls
        self.data = js_ctx.data
        self.agent_id = js_ctx.agent_id


class Tool:
    """Define a custom tool that the LLM agent can call.

    Usage:
        def my_handler(ctx, **kwargs):
            return f"Hello {kwargs.get('name', 'world')}"

        greet = bk.Tool(
            name="greet",
            description="Greet someone by name",
            params={
                "type": "object",
                "properties": {"name": {"type": "string", "description": "Name to greet"}},
                "required": ["name"]
            },
            handler=my_handler
        )
    """
    def __init__(self, name, description, params=None, handler=None):
        self.name = name
        self.description = description
        self.params = params or {"type": "object", "properties": {}, "required": []}
        self._handler = handler

    def _make_js_handler(self):
        """Create a JS-callable proxy that wraps the Python handler."""
        handler = self._handler
        def js_handler(js_ctx, js_args):
            ctx = ToolContext(js_ctx)
            args = {}
            if js_args is not None:
                # Convert JsProxy to Python dict
                for key in object_keys(js_args):
                    args[key] = getattr(js_args, key)
            result = handler(ctx, **args)
            return result
        return create_proxy(js_handler)

    def _to_js_def(self):
        """Convert to a plain JS object for the bridge."""
        return to_js({
            "name": self.name,
            "description": self.description,
            "parameters": self.params,
            "handler": self._make_js_handler(),
        }, dict_converter=_to_js_obj)


def _to_js_obj(pairs):
    """Convert Python dict to JS Object (not Map)."""
    from pyodide.ffi import JsProxy
    from js import Object
    obj = Object.new()
    for k, v in pairs:
        setattr(obj, k, v)
    return obj


def object_keys(js_obj):
    """Get keys from a JS object."""
    from js import Object
    return Object.keys(js_obj)


def _wrap_hook(fn):
    """Wrap a Python hook function as a JS-callable proxy."""
    if fn is None:
        return None
    def hook_wrapper(*js_args):
        # First arg is always the ToolContext JS object
        if len(js_args) >= 1:
            ctx = ToolContext(js_args[0])
            py_args = [ctx] + list(js_args[1:])
        else:
            py_args = []
        result = fn(*py_args)
        return result
    return create_proxy(hook_wrapper)


class AI:
    """Give a robot an LLM brain that observes, reasons, and acts.

    Basic usage (backward compatible):
        brain = bk.AI(bot, goal="find the burger", model="gpt-4o-mini")

    Extended usage with custom tools and hooks:
        brain = bk.AI(bot,
            goal="deliver packages",
            tools=[my_tool1, my_tool2],
            builtin_tools=["move_to", "look", "done"],
            system_prompt="You are a delivery robot...",
            on_observe=lambda ctx: f"Custom observation: robot at {ctx.robot['x']}",
            stop_condition=lambda ctx: ctx.robot['x'] > 5,
            max_iterations=10,
        )
    """
    def __init__(self, robot, goal="explore the environment", model="gpt-4o-mini",
                 think_every=1.5, vision=False,
                 tools=None, builtin_tools=None,
                 system_prompt=None, prompt_preamble=None,
                 max_iterations=5, stop_condition=None,
                 on_before_step=None, on_observe=None,
                 on_before_think=None, on_after_think=None,
                 on_tool_call=None, on_done=None):
        cam_id = None
        for p in robot.parts.values():
            if isinstance(p, Camera):
                cam_id = p.id

        # Detect if any extended features are used
        has_extended = any([
            tools, builtin_tools, system_prompt, prompt_preamble,
            max_iterations != 5, stop_condition,
            on_before_step, on_observe, on_before_think,
            on_after_think, on_tool_call, on_done,
        ])

        if not has_extended:
            # Legacy path — use old positional createAgent for backward compat
            self.agent_id = _bridge.createAgent(robot.id, cam_id, goal, model, think_every, vision)
        else:
            # Extended path — build config object
            config = {
                "goal": goal,
                "model": model,
                "thinkInterval": think_every,
                "enableVision": vision,
                "maxIterations": max_iterations,
            }

            if builtin_tools is not None:
                config["builtinTools"] = to_js(builtin_tools)

            if tools:
                config["customTools"] = to_js([t._to_js_def() for t in tools])

            if system_prompt is not None:
                config["systemPrompt"] = system_prompt
            if prompt_preamble is not None:
                config["promptPreamble"] = prompt_preamble

            # Hooks
            if on_before_step: config["onBeforeStep"] = _wrap_hook(on_before_step)
            if on_observe: config["onObserve"] = _wrap_hook(on_observe)
            if on_before_think: config["onBeforeThink"] = _wrap_hook(on_before_think)
            if on_after_think: config["onAfterThink"] = _wrap_hook(on_after_think)
            if on_tool_call: config["onToolCall"] = _wrap_hook(on_tool_call)
            if on_done: config["onDone"] = _wrap_hook(on_done)
            if stop_condition: config["stopCondition"] = _wrap_hook(stop_condition)

            config_js = to_js(config, dict_converter=_to_js_obj)
            self.agent_id = _bridge.createAgentEx(robot.id, cam_id, config_js)

    async def step(self):
        await _bridge.agentStep(self.agent_id, 0)

class cv:
    class Coords:
        def __init__(self, x, y):
            self.x = x
            self.y = y
        def find(self, item): return self
    class YOLO:
        def __call__(self, frame):
            state = _bridge.getRobotState(1)
            if not state: return None
            ws = _bridge.getWorldState(1)
            if not ws or not ws.objects or ws.objects.length == 0:
                return cv.Coords(0, 0)
            obj = ws.objects[0]
            angle_to_burger = math.atan2(obj.z - state.z, obj.x - state.x)
            diff = angle_to_burger - state.heading
            # normalize to [-pi, pi]
            diff = (diff + math.pi) % (2 * math.pi) - math.pi
            return cv.Coords(max(-1, min(1, diff)), 0)