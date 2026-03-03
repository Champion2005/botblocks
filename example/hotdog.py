import blockbots as bk

simulator = bk.SimWorld()
bot = bk.SimRobot()
yolo = bk.cv.YOLO(download=True)

camera = bot.set('front', bk.Camera())
turret = bot.set('bottom', bk.Motor())
simulator.add(bot)

while bot.ok():
    box = yolo.find('hot dog', camera.snap())
    v = box.x - 0.5 if box else 0
    turret.set_speed(v)
