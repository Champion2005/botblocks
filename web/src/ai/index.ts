import type { Sim } from '../sim'
import type { LLMProvider } from './providers'
import { Agent, type AgentConfig, type LogEntry } from './Agent'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import { OpenRouterProvider } from './openrouter'

const LS_PREFIX = 'botblocks_apikey_'

export type ProviderName = 'openai' | 'anthropic' | 'openrouter'
export type { LogEntry } from './Agent'

let nextAgentId = 1

export class AgentManager {
  private agents = new Map<number, Agent>()
  private keys: Record<ProviderName, string> = { openai: '', anthropic: '', openrouter: '' }

  constructor() {
    this.loadKeys()
  }

  private loadKeys() {
    for (const p of ['openai', 'anthropic', 'openrouter'] as ProviderName[]) {
      this.keys[p] = localStorage.getItem(LS_PREFIX + p) ?? ''
    }
  }

  setApiKey(provider: ProviderName, key: string) {
    this.keys[provider] = key
    localStorage.setItem(LS_PREFIX + provider, key)
  }

  getApiKey(provider: ProviderName): string {
    return this.keys[provider]
  }

  private getProvider(model: string): LLMProvider {
    // Models with :free suffix or slash → always OpenRouter
    if (model.includes('/') || model.includes(':free')) {
      if (this.keys.openrouter) return new OpenRouterProvider(this.keys.openrouter, model)
      // Try Anthropic direct for claude models without OpenRouter
      if ((model.startsWith('claude') || model.startsWith('anthropic/')) && this.keys.anthropic) {
        return new AnthropicProvider(this.keys.anthropic, model.replace('anthropic/', ''))
      }
      throw new Error('OpenRouter API key not set. Add it in the settings panel.')
    }
    // Plain model names (gpt-4o-mini, claude-sonnet, etc.)
    if (model.startsWith('claude')) {
      if (this.keys.anthropic) return new AnthropicProvider(this.keys.anthropic, model)
      if (this.keys.openrouter) return new OpenRouterProvider(this.keys.openrouter, `anthropic/${model}`)
      throw new Error('Anthropic or OpenRouter API key required. Add one in the settings panel.')
    }
    if (this.keys.openai) return new OpenAIProvider(this.keys.openai, model)
    if (this.keys.openrouter) return new OpenRouterProvider(this.keys.openrouter, `openai/${model}`)
    throw new Error('OpenAI or OpenRouter API key required. Add one in the settings panel.')
  }

  createAgent(sim: Sim, robotId: number, camId: number | null, config: Partial<AgentConfig>): number {
    const provider = this.getProvider(config.model ?? 'gpt-4o-mini')
    const id = nextAgentId++
    const agent = new Agent(provider, sim, robotId, camId, config)
    this.agents.set(id, agent)
    return id
  }

  /** Create an agent from a full config object (used by extended Python API) */
  createAgentFromConfig(sim: Sim, robotId: number, camId: number | null, config: Record<string, unknown>): number {
    // Convert the raw JS object (from Pyodide) into a typed AgentConfig
    const agentConfig: Partial<AgentConfig> = {
      goal: String(config.goal ?? 'explore the environment'),
      model: String(config.model ?? 'gpt-4o-mini'),
      thinkInterval: Number(config.thinkInterval ?? 1.5),
      enableVision: Boolean(config.enableVision),
      maxHistory: Number(config.maxHistory ?? 30),
      maxIterations: Number(config.maxIterations ?? 5),
    }

    // Built-in tool filter
    if (config.builtinTools != null) {
      const arr = config.builtinTools as unknown
      if (Array.isArray(arr)) agentConfig.builtinTools = arr.map(String)
      else if (typeof arr === 'object' && arr && 'toJs' in arr) {
        agentConfig.builtinTools = (arr as { toJs: () => string[] }).toJs()
      }
    }

    // Custom tools — array of {name, description, parameters, handler}
    if (config.customTools != null) {
      const raw = config.customTools as unknown
      const arr = Array.isArray(raw) ? raw : (typeof raw === 'object' && raw && 'toJs' in raw) ? (raw as { toJs: () => unknown[] }).toJs() : []
      agentConfig.customTools = arr.map((t: Record<string, unknown>) => ({
        name: String(t.name ?? ''),
        description: String(t.description ?? ''),
        parameters: (typeof t.parameters === 'object' && t.parameters) ? t.parameters as Record<string, unknown> : { type: 'object', properties: {}, required: [] },
        handler: t.handler as (ctx: Record<string, unknown>, args: Record<string, unknown>) => unknown,
      }))
    }

    // String overrides
    if (config.systemPrompt != null) agentConfig.systemPrompt = String(config.systemPrompt)
    if (config.promptPreamble != null) agentConfig.promptPreamble = String(config.promptPreamble)

    // Hook callbacks (Pyodide proxies — already JS-callable functions)
    const hookNames = ['onBeforeStep', 'onObserve', 'onBeforeThink', 'onAfterThink', 'onToolCall', 'onDone', 'stopCondition'] as const
    for (const h of hookNames) {
      if (typeof config[h] === 'function') {
        (agentConfig as Record<string, unknown>)[h] = config[h]
      }
    }

    return this.createAgent(sim, robotId, camId, agentConfig)
  }

  async stepAgent(agentId: number, dt: number): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)
    await agent.step(dt)
  }

  getAgent(agentId: number): Agent | undefined {
    return this.agents.get(agentId)
  }

  getAgentIds(): number[] {
    return [...this.agents.keys()]
  }

  getAgentLogs(agentId: number): LogEntry[] {
    return this.agents.get(agentId)?.logs ?? []
  }

  getAgentStatus(agentId: number): Agent['status'] | undefined {
    return this.agents.get(agentId)?.status
  }

  reset() {
    this.agents.clear()
    nextAgentId = 1
  }
}
