# botblocks

Browser-based robotics simulation with AI agents. No setup required — runs entirely in-browser using Three.js, Pyodide (Python in WebAssembly), and LLM-powered reasoning.

## Quick Start

```bash
cd web/
npm install
npm run dev
```

Write Python in the editor, click **restart**, and watch robots act in the 3D simulator.

## Example

```python
import botblocks as bk

bot = bk.Robot('SimpleCar')
bot.attach('cam', bk.Camera())
bk.Burger(x=3, z=2)

brain = bk.AI(bot, goal="Find the burger", model="gpt-4o-mini")

async def loop():
    await brain.step()
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| UI | React 19, Tailwind CSS 4, b44ui |
| 3D Rendering | Three.js 0.183 |
| Code Editor | CodeMirror 6 |
| Python Runtime | Pyodide 0.29 (WebAssembly) |
| AI Providers | OpenAI, Anthropic, OpenRouter |
| Build Tool | Vite 7 |

## Documentation

- [Getting Started](web/docs/getting-started.md) — Setup, first script, adding AI
- [Architecture](web/docs/architecture.md) — System overview, data flow, key files
- [Python API](web/docs/python-api.md) — `Robot`, `Camera`, `Burger`, `AI`, `Tool`, hooks
- [AI System](web/docs/ai-system.md) — Providers, agent loop, built-in tools, custom tools
- [Simulation](web/docs/simulation.md) — Renderer, World, Robot physics, Vision
- [TypeScript API](web/docs/typescript-api.md) — Internal classes and interfaces
