import _bridge, random, math

burgX, burgY = random.uniform(-4, 4), random.uniform(-4, -1)
def Burger():
    _bridge.addBurger(burgX, burgY)

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
            angle_to_burger = math.atan2(burgY - state.z, burgX - state.x)
            diff = angle_to_burger - state.heading
            # normalize to [-pi, pi]
            diff = (diff + math.pi) % (2 * math.pi) - math.pi
            return cv.Coords(max(-1, min(1, diff)), 0)