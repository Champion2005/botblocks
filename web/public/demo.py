import botblocks as bk

bot = bk.Robot('SimpleCar')
bot.attach('cam', bk.Camera())
sim = bk.Simulator([bot, bk.TestBurger])

yolo = bk.cv.YOLO('Xenova/yolos-tiny')

while bot.ok():
    run = yolo(bot['cam'].snap())
    bot.turn(run.find('hamburger').x - 0.5)
