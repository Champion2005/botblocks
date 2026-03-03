import sys, js, json

class Part:
    def __init__(self):
        self._robot_id = None
        self._slot = None

    def _bind(self, robot_id, slot):
        self._robot_id = robot_id
        self._slot = slot

    def _cmd(self, action, **kwargs):
        import json
        payload = json.dumps({
            "type": "part_cmd",
            "robot_id": self._robot_id,
            "slot": self._slot,
            "action": action, 
            **kwargs
        })
        js.wasm_mock_http_request("POST", "/v1", payload)

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

class cv:
    class YOLO:
        def __init__(self, url=None):
            self.url = url
            self._web_yolo = js.window.WebYOLO.new(url)

        def find(self, label, image):
            box = self._web_yolo.find(label, image)
            if box:
                return type('Box', (), {'x': box.x, 'y': box.y, 'w': box.w, 'h': box.h})()
            return None

class Core:
    def __init__(self, robot_id):
        self._robot_id = robot_id
        self._parts = {}

    def set(self, slot: str, part: Part) -> Part:
        import json
        part._bind(self._robot_id, slot)
        self._parts[slot] = part
        payload = json.dumps({
            "type": "part_attach",
            "robot_id": self._robot_id,
            "slot": slot,
            "part_type": part.__class__.__name__
        })
        js.wasm_mock_http_request("POST", "/v1", payload)
        return part

    def get(self, slot: str):
        return self._parts.get(slot)

class SimWorld:
    def __init__(self):
        import json
        js.wasm_mock_http_request("POST", "/v1", json.dumps({"type": "world_reset"}))

    def add(self, robot):
        pass

    def show(self, cam: Camera):
        print("[block] rendering camera (web)")

    def snapshot(self, path: str):
        pass

    def state(self):
        import json
        res = js.wasm_mock_http_request("POST", "/v1", json.dumps({"type": "world_state"}))
        return json.loads(res)

class SimRobot:
    def __init__(self):
        import json
        res = js.wasm_mock_http_request("POST", "/v1", json.dumps({"type": "robot_create"}))
        data = json.loads(res)
        self.id = data["id"]
        self.core = Core(self.id)
        self._ticks = 0

    def set(self, slot: str, part: Part) -> Part:
        return self.core.set(slot, part)

    def ok(self):
        self._ticks += 1
        return self._ticks < 100
