# TypeScript API Reference

Internal TypeScript classes and interfaces. These are not directly used by Python scripts, but are relevant for contributors working on the platform.

## Sim (`src/sim/index.ts`)

Main facade. Created with a canvas element.

```typescript
class Sim {
  constructor(canvas: HTMLCanvasElement)

  // World
  addRobot(): number
  setMotorSpeed(robotId: number, side: 'left' | 'right', speed: number): void
  setNavTarget(robotId: number, x: number, z: number): void
  clearNavTarget(robotId: number): void
  getNavStatus(robotId: number): { active: boolean; target?: {x,z}; distance?: number }
  addCamera(robotId: number): number
  snap(camId: number): { width: number; height: number; data: Uint8Array } | undefined
  addBurger(x?: number, z?: number): number
  getRobotState(robotId: number): { x: number; z: number; heading: number } | null
  getWorldState(robotId: number): WorldState | null
  setStepCallback(fn: () => void): void

  // Agents
  createAgent(robotId, camId, goal, model, thinkInterval, enableVision): number
  createAgentEx(robotId, camId, config: Record<string, unknown>): number
  agentStep(agentId: number, dt: number): Promise<void>
  getAgentIds(): number[]
  getAgentLogs(agentId: number): LogEntry[]
  getAgentStatus(agentId: number): AgentStatus
  setApiKey(provider: string, key: string): void
  getApiKey(provider: string): string

  // Renderer
  start(): void
  stop(): void
  resize(w: number, h: number): void
  reset(): void
  dispose(): void

  // Direct access
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  rendererInstance: THREE.WebGLRenderer
}
```

## Renderer (`src/sim/Renderer.ts`)

```typescript
class Renderer {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer

  constructor(canvas: HTMLCanvasElement, onStep: (dt: number) => void)
  start(): void
  stop(): void
  resize(w: number, h: number): void
  render(): void
  dispose(): void
}
```

## World (`src/sim/World.ts`)

```typescript
interface SceneObject {
  id: number
  type: string
  model: THREE.Object3D
  x: number
  z: number
}

interface WorldState {
  robot: { x: number; z: number; heading: number; leftMotor: number; rightMotor: number }
  objects: { id: number; type: string; x: number; z: number; distance: number; angle: number }[]
  otherRobots: { id: number; distance: number; angle: number }[]
}

class World {
  robots: Map<number, Robot>
  objects: Map<number, SceneObject>

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer)
  addRobot(): number
  setMotorSpeed(robotId: number, side: 'left' | 'right', speed: number): void
  addCamera(robotId: number): number
  snap(camId: number): { width: number; height: number; data: Uint8Array } | undefined
  addBurger(x?: number, z?: number): number
  getRobotState(robotId: number): { x: number; z: number; heading: number } | null
  getWorldState(robotId: number): WorldState | null
  step(dt: number): void
  setNavTarget(robotId: number, x: number, z: number): void
  clearNavTarget(robotId: number): void
  getNavStatus(robotId: number): { active: boolean; target?: {x: number; z: number}; distance?: number }
  reset(): void
}
```

## Robot (`src/sim/Robot.ts`)

```typescript
type RobotState = {
  id: number; left: number; right: number; heading: number; x: number; z: number
}

class Robot {
  state: RobotState
  group: THREE.Group

  constructor(id: number)
  setMotorSpeed(side: 'left' | 'right', speed: number): void
  step(dt: number): void
}
```

## Vision (`src/sim/Vision.ts`)

```typescript
class Vision {
  addCamera(camId: number, robotId: number): void
  snap(camId: number, robots: Map<number, Robot>, renderer: THREE.WebGLRenderer, scene: THREE.Scene):
    { width: number; height: number; data: Uint8Array } | undefined
  reset(): void
  dispose(): void
}
```

## AgentManager (`src/ai/index.ts`)

```typescript
type ProviderName = 'openai' | 'anthropic' | 'openrouter'

class AgentManager {
  setApiKey(provider: ProviderName, key: string): void
  getApiKey(provider: ProviderName): string
  createAgent(sim: Sim, robotId: number, camId: number | null, config: Partial<AgentConfig>): number
  createAgentFromConfig(sim: Sim, robotId: number, camId: number | null, config: Record<string, unknown>): number
  stepAgent(agentId: number, dt: number): Promise<void>
  getAgentIds(): number[]
  getAgentLogs(agentId: number): LogEntry[]
  getAgentStatus(agentId: number): AgentStatus
  reset(): void
}
```

## Agent (`src/ai/Agent.ts`)

```typescript
interface AgentConfig {
  goal: string
  model: string
  thinkInterval: number
  enableVision: boolean
  maxHistory: number
  builtinTools?: string[] | null
  customTools?: CustomToolDef[]
  systemPrompt?: string | null
  promptPreamble?: string | null
  maxIterations?: number
  onBeforeStep?: HookFn
  onObserve?: HookFn
  onBeforeThink?: HookFn
  onAfterThink?: HookFn
  onToolCall?: HookFn
  onDone?: HookFn
  stopCondition?: HookFn
}

type AgentStatus = 'idle' | 'thinking' | 'waiting' | 'done'

type LogEntry =
  | { type: 'status'; time: number; status: AgentStatus }
  | { type: 'thinking'; time: number; content: string }
  | { type: 'tool-call'; time: number; name: string; args: string; result: string }
  | { type: 'observation'; time: number; content: string }
  | { type: 'error'; time: number; message: string }

class Agent {
  config: AgentConfig
  status: AgentStatus
  history: AgentMessage[]
  logs: LogEntry[]

  constructor(provider: LLMProvider, sim: Sim, robotId: number, camId: number | null, config: Partial<AgentConfig>)
  step(dt: number): Promise<void>
}
```

## Provider Types (`src/ai/providers.ts`)

```typescript
interface ToolCall { id: string; name: string; arguments: string }

interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  image?: string  // base64 PNG
}

interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema
}

interface ProviderResponse {
  message: AgentMessage
  usage?: { prompt_tokens: number; completion_tokens: number }
}

interface LLMProvider {
  chat(messages: AgentMessage[], tools: ToolDef[]): Promise<ProviderResponse>
}
```

## Tool Types (`src/ai/tools.ts`)

```typescript
interface AgentTool {
  def: ToolDef
  execute(args: Record<string, unknown>, sim: Sim, robotId: number, camId: number | null): string
}

interface CustomToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  handler: (ctx: Record<string, unknown>, args: Record<string, unknown>) => unknown
}
```
