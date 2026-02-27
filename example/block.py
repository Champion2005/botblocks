class Part:
    pass

class Core(Part):
    def __init__(self):
        self.parts = { 'left': None, 'right': None, 'front': None, 'back': None }

    def set(self, loc, part):
        self.parts[loc] = part
    
    def get(self, loc):
        return self.parts[loc]

class SimRobot:
    def __init__(self):
        self.core = Core()