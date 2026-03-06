# Simulation Internals

The simulation runs in-browser using Three.js for rendering and custom physics for differential-drive robots.

## Renderer (`src/sim/Renderer.ts`)

Sets up the Three.js WebGL context and runs the frame loop.

**Scene setup:**
- 20×20 ground plane with grid overlay
- Ambient light (intensity 0.6) + directional sun (intensity 0.8, casts shadows)
- Camera: 50° FOV perspective, positioned at (0, 5, 6) looking at origin

**Frame loop:**
- `start()` — Begins `requestAnimationFrame` loop
- Each frame: calls `onStep(dt)` with delta-time in seconds, then renders
- `stop()` — Halts the loop
- `resize(w, h)` — Updates camera aspect ratio and renderer size
- `dispose()` — Cleans up WebGL resources

## Robot (`src/sim/Robot.ts`)

Differential-drive robot with simple forward kinematics.

**Visual model:**
- Box body: 0.8 × 0.3 × 0.5 (light gray)
- Two orange wheels (cylinder, radius 0.15)
- Blue front indicator box

**State:**

```typescript
{ id: number, left: number, right: number, heading: number, x: number, z: number }
```

- `left`, `right` — motor speeds (range -2.0 to 2.0)
- `heading` — radians, 0 = facing +X, normalized to [-π, π]
- `x`, `z` — world position

**Physics (per frame):**
```
velocity = (left + right) / 2
angular_velocity = right - left
heading += angular_velocity * dt
x += velocity * cos(heading) * dt
z += velocity * sin(heading) * dt
```

## World (`src/sim/World.ts`)

Manages robots, scene objects, and navigation.

**Collections:**
- `robots` — `Map<id, Robot>`
- `objects` — `Map<id, SceneObject>` (burgers, etc.)
- `navTargets` — `Map<robotId, {x, z}>` (active autopilot targets)

**Key methods:**

| Method | Description |
|--------|-------------|
| `addRobot()` | Spawn a robot at origin, returns ID |
| `setMotorSpeed(id, side, speed)` | Set left/right motor |
| `addBurger(x, z)` | Spawn burger (loads GLB model async) |
| `addCamera(robotId)` | Create robot-mounted camera, returns cam ID |
| `snap(camId)` | Capture frame from camera |
| `getRobotState(id)` | Returns `{x, z, heading}` |
| `getWorldState(id)` | Full observation: position, objects with distances/angles, other robots |
| `setNavTarget(id, x, z)` | Start autopilot navigation |
| `clearNavTarget(id)` | Stop navigation, zero motors |
| `getNavStatus(id)` | Returns `{active, target?, distance?}` |

**Navigation controller** (runs in `step(dt)`):
- Two-phase steering: rotate in place if angle error > 0.4 rad, else proportional steer
- Arrival threshold: 0.3m
- Automatically zeros motors on arrival

**World state observation** (`getWorldState`):
- Returns robot position, heading, motor speeds
- Lists all objects with distance and relative angle (normalized to [-π, π])
- Lists other robots with distance and relative angle

## Vision (`src/sim/Vision.ts`)

Captures camera images from robot perspectives.

- Resolution: 320 × 240 RGBA
- Camera offset: 0.45 units forward, 0.45 units high from robot center
- FOV: 60°
- Uses `WebGLRenderTarget` + `readRenderTargetPixels` to extract pixel data
- Returns `{ width, height, data: Uint8Array }`

## Sim Facade (`src/sim/index.ts`)

The `Sim` class is the single entry point used by both the React UI and the Python bridge. It delegates to:

- **Renderer** — `start()`, `stop()`, `resize()`
- **World** — all robot/object/navigation methods
- **AgentManager** — agent creation, stepping, API key management

**Lifecycle:**
1. `new Sim(canvas)` — creates renderer + world + agent manager
2. `start()` — begins frame loop
3. `reset()` — stops renderer, clears world + agents
4. `dispose()` — full cleanup
