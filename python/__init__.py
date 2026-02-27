import requests, subprocess, time, atexit, os, signal

BASE = "http://localhost:3000"
_SIM_DIR = os.path.join(os.path.dirname(__file__), "..", "sim")


class Part:
    def __init__(self):
        self._client = None
        self._robot_id = None
        self._slot = None

    def _bind(self, client, robot_id, slot):
        self._client = client
        self._robot_id = robot_id
        self._slot = slot

    def _cmd(self, action, **kwargs):
        self._client.post(
            f"{BASE}/robots/{self._robot_id}/parts/{self._slot}/cmd",
            json={"action": action, **kwargs},
        )


class Motor(Part):
    def set_speed(self, speed: float):
        self._cmd("set_speed", speed=speed)

    def stop(self):
        self._cmd("stop")


class Camera(Part):
    def __init__(self, pos=None):
        super().__init__()
        self.pos = pos or [0, 0, 0]

    def snap(self, path: str = None):
        """Capture an image from this camera. Optionally save to path."""
        r = self._client.get(f"{BASE}/robots/{self._robot_id}/parts/{self._slot}/camera", timeout=10)
        r.raise_for_status()
        if path:
            with open(path, "wb") as f:
                f.write(r.content)
        return r.content


class Core:
    def __init__(self, robot_id, client):
        self._robot_id = robot_id
        self._client = client
        self._parts = {}

    def set(self, slot: str, part: Part) -> Part:
        part._bind(self._client, self._robot_id, slot)
        self._parts[slot] = part
        self._client.post(
            f"{BASE}/robots/{self._robot_id}/parts",
            json={"slot": slot, "type": part.__class__.__name__},
        )
        return part

    def get(self, slot: str):
        return self._parts.get(slot)


class SimWorld:
    """Launches the Bevy sim as a subprocess and waits for it to be ready."""

    def __init__(self):
        self._client = requests.Session()
        self._proc = subprocess.Popen(
            ["cargo", "run"],
            cwd=os.path.abspath(_SIM_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        atexit.register(self._cleanup)
        self._wait_ready()

    def _wait_ready(self, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                self._client.get(f"{BASE}/world/state", timeout=0.5)
                return
            except Exception:
                time.sleep(0.3)
        raise TimeoutError("Sim server didn't start in time")

    def _cleanup(self):
        if self._proc and self._proc.poll() is None:
            self._proc.terminate()
            self._proc.wait(timeout=5)

    def add(self, robot):
        """Robot was already spawned on creation."""
        pass

    def show(self, cam: Camera):
        """TODO: open a window showing the camera feed."""
        print("[block] show camera (not yet implemented)")

    def snapshot(self, path: str):
        """Capture the current window and save as PNG."""
        r = self._client.get(f"{BASE}/world/snapshot", timeout=10)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)

    def state(self):
        r = self._client.get(f"{BASE}/world/state")
        return r.json()


class SimRobot:
    def __init__(self):
        self._client = requests.Session()
        r = self._client.post(f"{BASE}/robots")
        data = r.json()
        self.id = data["id"]
        self.core = Core(self.id, self._client)
