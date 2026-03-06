import type { Sim } from '../sim'
import type { AgentMessage, LLMProvider, ToolDef } from './providers'
import { BUILTIN_TOOLS, type AgentTool, type CustomToolDef } from './tools'

/** JS-callable hook function (a Pyodide create_proxy). Returns undefined/null for default behavior, or a value to override. */
export type HookFn = ((...args: unknown[]) => unknown) | null

export interface AgentConfig {
  goal: string
  model: string
  thinkInterval: number   // seconds between LLM calls
  enableVision: boolean
  maxHistory: number
  builtinTools?: string[] | null  // built-in tool name filter; null = all
  customTools?: CustomToolDef[]   // custom tools from Python
  systemPrompt?: string | null    // full system prompt replacement
  promptPreamble?: string | null  // extra text prepended to auto-generated prompt
  maxIterations?: number          // max tool-call iterations per think cycle
  // Lifecycle hook callbacks (Pyodide proxies)
  onBeforeStep?: HookFn
  onObserve?: HookFn
  onBeforeThink?: HookFn
  onAfterThink?: HookFn
  onToolCall?: HookFn
  onDone?: HookFn
  stopCondition?: HookFn
}

const DEFAULT_CONFIG: AgentConfig = {
  goal: 'explore the environment',
  model: 'openrouter/free',
  thinkInterval: 1.5,
  enableVision: false,
  maxHistory: 30,
  builtinTools: null,
  customTools: [],
  systemPrompt: null,
  promptPreamble: null,
  maxIterations: 5,
  onBeforeStep: null,
  onObserve: null,
  onBeforeThink: null,
  onAfterThink: null,
  onToolCall: null,
  onDone: null,
  stopCondition: null,
}

export type AgentStatus = 'idle' | 'thinking' | 'waiting' | 'done'

export type LogEntry =
  | { type: 'status'; time: number; status: AgentStatus }
  | { type: 'thinking'; time: number; content: string }
  | { type: 'tool-call'; time: number; name: string; args: string; result: string }
  | { type: 'observation'; time: number; content: string }
  | { type: 'error'; time: number; message: string }

export class Agent {
  config: AgentConfig
  status: AgentStatus = 'idle'
  history: AgentMessage[] = []
  plan: string | null = null
  totalTokens = 0
  logs: LogEntry[] = []

  private provider: LLMProvider | null
  private sim: Sim
  private robotId: number
  private camId: number | null
  private lastThinkTime = 0 // wall-clock ms; 0 = force first think immediately
  private waitUntilTime = 0
  private builtinTools: AgentTool[]
  private customTools: CustomToolDef[]
  private toolDefs: ToolDef[]
  private thinking = false
  /** Per-agent persistent data dict accessible from custom tools/hooks */
  private userData: Record<string, unknown> = {}
  private _waitingForKey = false
  /** Called when an auth error occurs so the manager can mark the key rejected */
  onAuthError: (() => void) | null = null

  constructor(provider: LLMProvider | null, sim: Sim, robotId: number, camId: number | null, config: Partial<AgentConfig>) {
    this.provider = provider
    this.sim = sim
    this.robotId = robotId
    this.camId = camId
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Filter built-in tools
    const allowVision = this.config.enableVision
    const allowed = this.config.builtinTools
    this.builtinTools = BUILTIN_TOOLS.filter(t => {
      if (t.def.name === 'look_image' && !allowVision) return false
      if (allowed) return allowed.includes(t.def.name)
      return true
    })

    // Custom tools from Python
    this.customTools = this.config.customTools ?? []

    // Merge tool definitions for LLM
    this.toolDefs = [
      ...this.builtinTools.map(t => t.def),
      ...this.customTools.map(ct => ({
        name: ct.name,
        description: ct.description,
        parameters: ct.parameters,
      })),
    ]

    // Initialize system message
    this.history.push({
      role: 'system',
      content: this.buildSystemPrompt(),
    })
  }

  /** Build ToolContext object passed to custom tools and hooks */
  private buildToolContext(): Record<string, unknown> {
    const rs = this.sim.getRobotState(this.robotId)
    const ws = this.sim.getWorldState(this.robotId)
    return {
      robot: rs ? { id: this.robotId, ...rs, leftMotor: ws?.robot.leftMotor ?? 0, rightMotor: ws?.robot.rightMotor ?? 0 } : { id: this.robotId },
      sim: {
        addBurger: (x?: number, z?: number) => this.sim.addBurger(x, z),
        getRobotState: (rid: number) => this.sim.getRobotState(rid),
        getWorldState: (rid: number) => this.sim.getWorldState(rid),
        setMotorSpeed: (rid: number, side: 'left' | 'right', speed: number) => this.sim.setMotorSpeed(rid, side, speed),
        setNavTarget: (rid: number, x: number, z: number) => this.sim.setNavTarget(rid, x, z),
        clearNavTarget: (rid: number) => this.sim.clearNavTarget(rid),
        getNavStatus: (rid: number) => this.sim.getNavStatus(rid),
        snap: (camId: number) => this.sim.snap(camId),
      },
      data: this.userData,
      agent_id: this.robotId,
    }
  }

  /** Safely call a hook. Returns the hook's return value or undefined. */
  private callHook(hook: HookFn, ...args: unknown[]): unknown {
    if (!hook) return undefined
    try {
      return hook(...args)
    } catch (err) {
      console.error('[Agent] hook error:', err)
      this.logs.push({ type: 'error', time: Date.now(), message: `Hook error: ${err instanceof Error ? err.message : String(err)}` })
      return undefined
    }
  }

  private buildSystemPrompt(): string {
    // Full replacement
    if (this.config.systemPrompt) return this.config.systemPrompt

    const customToolDesc = this.customTools.length > 0
      ? this.customTools.map(ct => `- "${ct.name}": ${ct.description}`).join('\n') + '\n'
      : ''

    const base = `You are an AI brain controlling a differential-drive robot in a 3D simulation.

YOUR GOAL: ${this.config.goal}

CAPABILITIES:
- Use "move_to" to navigate to a specific (x, z) coordinate. It steers the robot automatically. Call it, then "wait", then "look" to check progress. Repeat until arrived.
- You can observe the world with the "look" tool to see objects, distances, and angles relative to your heading.
${this.config.enableVision ? '- You can capture a camera image with "look_image" for visual inspection.\n' : ''}- You can also use "turn" or "drive" for manual motor control if needed.
- Call "done" when you believe the goal is achieved.
${customToolDesc ? `\nCUSTOM TOOLS:\n${customToolDesc}` : ''}
STRATEGY:
1. Observe with "look" to find your target
2. Calculate the target's world coordinates from your position + the reported distance and angle:
   target_x = your_x + distance * cos(your_heading + angle)
   target_z = your_z + distance * sin(your_heading + angle)
3. Use "move_to" with those coordinates
4. Wait a few seconds, then re-observe and re-check distance
5. Repeat until close, then call "done"

Keep responses concise. Focus on achieving the goal efficiently.
Angles: positive = object is to your left, negative = to your right, near 0 = straight ahead.
A heading of 0 rad means facing +X direction.`

    if (this.config.promptPreamble) return this.config.promptPreamble + '\n\n' + base
    return base
  }

  async step(_dt: number): Promise<void> {
    if (this.status === 'done') return
    if (this.thinking) return

    const now = Date.now()

    // Handle wait timer (wall-clock)
    if (this.status === 'waiting') {
      if (now < this.waitUntilTime) return
      this.setStatus('idle')
    }

    // Check elapsed time since last think (wall-clock)
    const elapsed = (now - this.lastThinkTime) / 1000
    if (this.lastThinkTime !== 0 && elapsed < this.config.thinkInterval) return

    // onBeforeStep hook — return truthy to skip
    const skipStep = this.callHook(this.config.onBeforeStep!, this.buildToolContext())
    if (skipStep) return

    if (!this.provider) {
      if (!this._waitingForKey) {
        this._waitingForKey = true
        this.logs.push({ type: 'error', time: Date.now(), message: 'Waiting for API key — add one in the settings panel above.' })
      }
      return
    }
    if (this._waitingForKey) {
      this._waitingForKey = false
      this.logs.push({ type: 'status', time: Date.now(), status: 'idle' })
    }

    this.thinking = true
    this.setStatus('thinking')
    this.lastThinkTime = now

    try {
      await this.think()
    } catch (err) {
      console.error('[Agent] think error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      // On auth errors, drop provider so agent waits for a valid key
      if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('forbidden')) {
        this.provider = null
        this._waitingForKey = true
        this.logs.push({ type: 'error', time: Date.now(), message: 'Invalid API key — update it in the settings panel above.' })
        this.onAuthError?.()
      } else {
        this.logs.push({ type: 'error', time: Date.now(), message: msg })
        this.history.push({ role: 'user', content: `Error: ${msg}. Try a different approach.` })
      }
    } finally {
      this.thinking = false
      if (this.status === 'thinking') this.setStatus('idle')
    }
  }

  private setStatus(s: AgentStatus) {
    this.status = s
    this.logs.push({ type: 'status', time: Date.now(), status: s })
  }

  private async think(): Promise<void> {
    // onObserve hook — return string to override default observation
    const ctx = this.buildToolContext()
    const hookObs = this.callHook(this.config.onObserve!, ctx)
    const observation = typeof hookObs === 'string' ? hookObs : this.executeBuiltinTool('look', {})
    this.logs.push({ type: 'observation', time: Date.now(), content: observation })
    this.history.push({ role: 'user', content: `[Observation]\n${observation}` })

    // If vision enabled, try to get image
    let image: string | undefined
    if (this.config.enableVision && this.camId != null) {
      const frame = this.sim.snap(this.camId)
      if (frame) {
        image = this.rgbaToBase64PNG(frame.data, frame.width, frame.height)
      }
    }

    // Add image to the latest user message if available
    if (image) {
      const lastMsg = this.history[this.history.length - 1]
      if (lastMsg.role === 'user') lastMsg.image = image
    }

    // onBeforeThink hook
    this.callHook(this.config.onBeforeThink!, this.buildToolContext())

    // LLM call with tool loop
    let iterations = 0
    const maxIter = this.config.maxIterations ?? 5
    while (iterations++ < maxIter) {
      const response = await this.provider!.chat([...this.history], this.toolDefs)
      if (response.usage) this.totalTokens += response.usage.prompt_tokens + response.usage.completion_tokens

      this.history.push(response.message)

      // Extract plan from text content
      if (response.message.content) {
        this.plan = response.message.content
        this.logs.push({ type: 'thinking', time: Date.now(), content: response.message.content })
      }

      // onAfterThink hook
      this.callHook(this.config.onAfterThink!, this.buildToolContext(), response.message.content ?? '')

      // If no tool calls, we're done for this cycle
      if (!response.message.tool_calls || response.message.tool_calls.length === 0) break

      // Execute tool calls
      let shouldBreak = false
      for (const tc of response.message.tool_calls) {
        let args: Record<string, unknown>
        try {
          args = JSON.parse(tc.arguments)
        } catch {
          // Fix malformed JSON from LLM — also sanitize what goes back into history
          args = {}
          tc.arguments = '{}'
          this.logs.push({ type: 'error', time: Date.now(), message: `Bad tool args for ${tc.name}: ${tc.arguments}` })
        }
        let result = await this.executeTool(tc.name, args)

        // onToolCall hook — return string to override result
        const hookResult = this.callHook(this.config.onToolCall!, this.buildToolContext(), tc.name, args, result)
        if (typeof hookResult === 'string') result = hookResult

        this.logs.push({ type: 'tool-call', time: Date.now(), name: tc.name, args: tc.arguments, result })
        this.history.push({ role: 'tool', tool_call_id: tc.id, content: result })

        // Handle special results
        if (result.startsWith('__DONE__')) {
          this.callHook(this.config.onDone!, this.buildToolContext(), result.slice(8))
          this.setStatus('done')
          shouldBreak = true
        } else if (result.startsWith('__WAIT__')) {
          const secs = parseFloat(result.slice(8))
          this.waitUntilTime = Date.now() + secs * 1000
          this.setStatus('waiting')
          shouldBreak = true
        }

        // stopCondition hook — return truthy to end agent
        if (!shouldBreak && this.config.stopCondition) {
          const shouldStop = this.callHook(this.config.stopCondition, this.buildToolContext())
          if (shouldStop) {
            this.callHook(this.config.onDone!, this.buildToolContext(), 'Stop condition met')
            this.setStatus('done')
            shouldBreak = true
          }
        }
      }
      if (shouldBreak) break
    }

    this.trimHistory()
  }

  private executeBuiltinTool(name: string, args: Record<string, unknown>): string {
    const tool = this.builtinTools.find(t => t.def.name === name)
    if (!tool) return `Error: unknown built-in tool "${name}"`
    return tool.execute(args, this.sim, this.robotId, this.camId)
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    // Check built-in tools first
    const builtin = this.builtinTools.find(t => t.def.name === name)
    if (builtin) return builtin.execute(args, this.sim, this.robotId, this.camId)

    // Check custom tools
    const custom = this.customTools.find(ct => ct.name === name)
    if (custom) {
      try {
        const ctx = this.buildToolContext()
        const result = custom.handler(ctx, args)
        if (result == null) return ''
        if (typeof result === 'string') return result
        if (typeof result === 'object') return JSON.stringify(result)
        return String(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logs.push({ type: 'error', time: Date.now(), message: `Custom tool "${name}" error: ${msg}` })
        return `Error: ${msg}`
      }
    }

    return `Error: unknown tool "${name}"`
  }

  setProvider(provider: LLMProvider) {
    this.provider = provider
  }

  get hasProvider(): boolean {
    return this.provider !== null
  }

  private trimHistory(): void {
    // Keep system message + last N messages
    if (this.history.length <= this.config.maxHistory + 1) return
    const system = this.history[0]
    const recent = this.history.slice(-(this.config.maxHistory))
    this.history = [system, ...recent]
  }

  private rgbaToBase64PNG(data: Uint8Array, w: number, h: number): string {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(w, h)
    imageData.data.set(data)
    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png').split(',')[1]
  }
}
