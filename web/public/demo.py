import botblocks as bk

bot = bk.Robot('SimpleCar')
bot.attach('cam', bk.Camera())
sim = bk.Simulator([bot, bk.Burger()])

yolo = bk.cv.YOLO()

def loop():
    img = bot['cam'].snap()
    res = yolo(img).find('burger')
    bot.turn(res.x if res else 1)