# Getting Started

## What is botblocks?

botblocks is a browser-based robotics simulation platform. It runs a 3D simulator (Three.js), a Python runtime (Pyodide/WebAssembly), and optional LLM-powered AI agents — all in the browser with zero setup.

## Prerequisites

- A modern browser (Chrome, Edge, Firefox)
- Node.js 18+ and npm (for local development)
- An API key from OpenAI, Anthropic, or OpenRouter (only if using AI agents)

## Quick Start

```bash
git clone <repo-url>
cd web
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

## Your First Script

The editor loads `demo_custom_ai.py` by default. To start simple, replace it with:

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

To give the robot an LLM brain instead of manual code:

1. Enter your API key in the top bar (OpenAI, Anthropic, or OpenRouter).
2. Click **save**.
3. Use this script:

```python
import botblocks as bk

bot = bk.Robot('SimpleCar')
bot.attach('cam', bk.Camera())
bk.Burger(x=3, z=2)

brain = bk.AI(bot,
    goal="Find and navigate to the burger",
    model="gpt-4o-mini")

async def loop():
    await brain.step()
```

The AI agent will observe the world, reason about what to do, and navigate autonomously. Watch the AI Log panel below the simulator for real-time agent activity.

## Project Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
