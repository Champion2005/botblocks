import sys, js

class Part:
    def __init__(self):
        self._robot_id = None
        self._slot = None

    def _bind(self, robot_id, slot):
        self._robot_id = robot_id
        self._slot = slot

    def _cmd(self, action, **kwargs):
        import json
        payload = json.dumps({"action": action, **kwargs})
        js.wasm_mock_http_request("POST", f"/robots/{self._robot_id}/parts/{self._slot}/cmd", payload)

class Motor(Part):
    def set_speed(self, speed: float):
        self._cmd("set_speed", speed=speed)

    def stop(self):
        self._cmd("stop")

class Camera(Part):
    def __init__(self, pos=None):
        super().__init__()
        self.pos = pos or [0, 0, 0]

    def snap(self):
        return None

class Core:
    def __init__(self, robot_id):
        self._robot_id = robot_id
        self._parts = {}

    def set(self, slot: str, part: Part) -> Part:
        import json
        part._bind(self._robot_id, slot)
        self._parts[slot] = part
        js.wasm_mock_http_request("POST", f"/robots/{self._robot_id}/parts", json.dumps({"slot": slot, "type": part.__class__.__name__}))
        return part

    def get(self, slot: str):
        return self._parts.get(slot)

class SimWorld:
    def __init__(self):
        pass

    def add(self, robot):
        pass

    def show(self, cam: Camera):
        print("[block] rendering camera (web)")

    def snapshot(self, path: str):
        pass

    def state(self):
        import json
        res = js.wasm_mock_http_request("GET", "/world/state", "")
        return json.loads(res)

class SimRobot:
    def __init__(self):
        import json
        res = js.wasm_mock_http_request("POST", "/robots", "")
        data = json.loads(res)
        self.id = data["id"]
        self.core = Core(self.id)
