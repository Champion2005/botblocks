import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import block, time

sim = block.SimWorld()
bot = block.SimRobot()

left = bot.core.set('left', block.Motor())
rght = bot.core.set('right', block.Motor())
cam = bot.core.set('front', block.Camera(pos=[0, 0, 1]))

sim.add(bot)
sim.show(cam)
print(f'made {bot.id}')

sim.snapshot('example/testbefore.png')
left.set_speed(1.0)
rght.set_speed(0.5)
time.sleep(3)
sim.snapshot('example/testafter.png')
print('ok')