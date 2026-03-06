import botblocks as bk

bot = bk.Robot('SimpleCar')
bot.attach('cam', bk.Camera())

bk.Burger(x=3, z=2)
bk.Burger(x=-3, z=2)
bk.Burger(x=-3, z=-3)
bk.Burger(x=3, z=-3)

brain = bk.AI(bot,
    goal="Visit only 2 burgers. They are at (3,2), (-3,2), (-3,-3), and (3,-3). "
         "Use move_to to drive to each one in order. When you arrive within 0.3m of a burger, "
         "move on to the next. After visiting random 2, explore your enviroment."
         "Visit 3 places on the grid (any) then come back and call done.",
    model="openrouter/free")

async def loop():
    await brain.step()
