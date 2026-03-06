# Architecture

## Overview

botblocks runs entirely in the browser. There is no backend server — LLM API calls are proxied through Vite's dev server to avoid CORS issues. The application is structured in three layers:

```
┌─────────────────────────────────────────────────┐
│  React UI                                       │
│  ├── Editor (CodeMirror 6)                      │
│  ├── SimView (Three.js canvas)                  │
│  └── AiLog (agent activity monitor)             │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  Sim (facade)       │
        │  Coordinates:       │
        │  - Renderer          │
        │  - World             │
        │  - AgentManager      │
        └─┬──────────────┬────┘
          │              │
    ┌─────▼──────┐  ┌────▼────────────┐
    │ Renderer   │  │ World           │
    │ Three.js   │  │ ├── Robot[]     │
    │ WebGL      │  │ ├── SceneObject[]│
    │ Camera     │  │ ├── Vision      │
    │ Lights     │  │ └── NavControl  │
    └────────────┘  └─────────────────┘

    ┌─────────────────────────────────────┐
    │ AgentManager                        │
    │ ├── OpenRouterProvider (active)     │
    │ ├── OpenAIProvider (commented out)  │
    │ ├── AnthropicProvider (commented out)│
    │ └── Agent[] (observe → think → act) │
    └─────────────────────────────────────┘

    ┌─────────────────────────────────────┐
    │ Pyodide (Python in WebAssembly)     │
    │ └── botblocks.py (user scripts)     │
    └─────────────────────────────────────┘
```

## Data Flow

1. **User writes Python** in the CodeMirror editor.
2. **Pyodide** executes the Python code in-browser via WebAssembly.
3. Python calls `botblocks.py` which talks to the **Sim facade** through a JS bridge (`_bridge`).
4. **Sim** delegates to **World** (physics, objects) and **Renderer** (Three.js scene rendering).
5. When AI is used, **AgentManager** runs agents that call LLM providers, execute tools, and control robots through the same Sim facade.
6. **AiLog** polls agent state every 400ms and renders activity in the UI.

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Root layout, API key management, Pyodide boot |
| `src/SimView.tsx` | Canvas container with ResizeObserver |
| `src/Editor.tsx` | CodeMirror 6 Python editor |
| `src/AiLog.tsx` | AI agent activity log |
| `src/sim/index.ts` | Sim facade — coordinates renderer, world, agents |
| `src/sim/Renderer.ts` | Three.js WebGL setup, frame loop |
| `src/sim/World.ts` | Scene objects, robot physics, navigation |
| `src/sim/Robot.ts` | Differential-drive robot model |
| `src/sim/Vision.ts` | Robot camera capture (320×240) |
| `src/ai/Agent.ts` | LLM reasoning loop, tool execution |
| `src/ai/tools.ts` | Built-in agent tools |
| `src/ai/providers.ts` | Provider interface types |
| `src/ai/openai.ts` | OpenAI API provider |
| `src/ai/anthropic.ts` | Anthropic API provider |
| `src/ai/openrouter.ts` | OpenRouter API provider |
| `src/ai/index.ts` | AgentManager — agent lifecycle |
| `public/botblocks.py` | Python API exposed to user scripts |

## Build System

- **Vite 7** — dev server + production bundler
- **React 19** — UI framework
- **Tailwind CSS 4** + **b44ui** — styling and component library
- **Pyodide 0.29** — Python WebAssembly runtime
- **Three.js 0.183** — 3D rendering
- **CodeMirror 6** — code editor

### Dev Server Proxies

Vite proxies are configured but not currently used (direct OpenAI/Anthropic providers are commented out):
- `/proxy/openai/*` → `https://api.openai.com/*`
- `/proxy/anthropic/*` → `https://api.anthropic.com/*`

OpenRouter is called directly from the browser (it supports CORS).
