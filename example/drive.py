import blockbots as bk

simulator = bk.SimWorld()
bot = bk.SimRobot()

left = bot.set('left', bk.Motor())
right = bot.set('right', bk.Motor())
simulator.add(bot)

left.set_speed(1.0)
right.set_speed(0.5)