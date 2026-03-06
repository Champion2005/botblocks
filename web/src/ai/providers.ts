export interface ToolCall {
  id: string
  name: string
  arguments: string // JSON string
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  image?: string // base64 PNG for multimodal
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema object
}

export interface ProviderResponse {
  message: AgentMessage
  usage?: { prompt_tokens: number; completion_tokens: number }
}

export interface LLMProvider {
  chat(messages: AgentMessage[], tools: ToolDef[]): Promise<ProviderResponse>
}
