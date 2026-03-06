# Getting Started

## What is botblocks?

botblocks is a browser-based robotics simulation platform. It runs a 3D simulator (Three.js), a Python runtime (Pyodide/WebAssembly), and optional LLM-powered AI agents — all in the browser with zero setup.

## Prerequisites

- A modern browser (Chrome, Edge, Firefox)
- Node.js 18+ and npm (for local development)
- An [OpenRouter](https://openrouter.ai) API key (only if using AI agents; free tier available)

## Quick Start

```bash
git clone <repo-url>
cd web
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

## Your First Script

If no API key is set, the editor defaults to `demo.py` (the Basic demo — no AI required). With a key saved, it defaults to `demo_ai.py`. You can switch between Basic, AI, and Custom AI demos using the buttons in the Editor tab header.

The Basic demo:

```python
import botblocks as bk

bot = bk.Robot('SimpleCar')
bot.attach('cam', bk.Camera())
sim = bk.Simulator([bot, bk.Burger()])

yolo = bk.cv.YOLO()

def loop():
    img = bot['cam'].snap()
    res = yolo(img).find('burger')
    bot.turn(res.x if res else 1)
```

Click **restart** to run. The robot will spin until it detects the burger, then drive toward it.

## Adding AI

To give the robot an LLM brain:

1. Get a free API key from [openrouter.ai](https://openrouter.ai).
2. Paste it into the **OpenRouter** key field and click **save**.
3. Switch to the **AI** demo (or write your own):

```python
import botblocks as bk

bot = bk.Robot('SimpleCar')
bot.attach('cam', bk.Camera())

bk.Burger(x=3, z=2)
bk.Burger(x=-3, z=2)
bk.Burger(x=-3, z=-3)
bk.Burger(x=3, z=-3)

brain = bk.AI(bot,
    goal="Visit only 2 burgers. They are at (3,2), (-3,2), (-3,-3), and (3,-3). "
         "Use move_to to drive to each one in order. After visiting 2, call done.",
    model="openrouter/free")

async def loop():
    await brain.step()
```

The AI agent will observe the world, reason about what to do, and navigate autonomously. Watch the AI Log panel for real-time agent activity.

## Project Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
