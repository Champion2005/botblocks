import _bridge

TestBurger = _bridge.addBurger

class NS:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

class Detections(list):
    def find(self, label):
        matches = [d for d in self if d.label == label]
        return max(matches, key=lambda d: d.score) if matches else None

class Camera:
    def __init__(self): self.id = None
    def bind(self, robot_id): self.id = _bridge.addCamera(robot_id)
    def snap(self): return _bridge.snap(self.id)

class YOLO:
    def __init__(self, model):
        _bridge.initYOLO(model)
        self._cached = Detections([])
    def __call__(self, img):
        _bridge.runYOLO(img, self._on_result)
        return self._cached
    def _on_result(self, results):
        if results:
            self._cached = Detections([NS(label=d['label'], score=d['score'], x=d['x'], y=d['y'], w=d['w'], h=d['h']) for d in results])
        else:
            self._cached = Detections([])
cv = NS(YOLO=YOLO)

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
    def ok(self):
        return _bridge.ok()
    def turn(self, amount):
        _bridge.setMotorSpeed(self.id, 'left', 1.0 - amount)
        _bridge.setMotorSpeed(self.id, 'right', 1.0 + amount)

class Simulator:
    def __init__(self, robots=[]):
        [R() for R in robots if callable(R)]