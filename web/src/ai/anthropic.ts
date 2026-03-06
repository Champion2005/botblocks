import type { AgentMessage, LLMProvider, ProviderResponse, ToolDef } from './providers'

export class AnthropicProvider implements LLMProvider {
  constructor(private apiKey: string, private model: string) {}

  async chat(messages: AgentMessage[], tools: ToolDef[]): Promise<ProviderResponse> {
    const systemMsg = messages.find(m => m.role === 'system')
    const nonSystemMsgs = messages.filter(m => m.role !== 'system')

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 1024,
      messages: nonSystemMsgs.map(m => this.toAnthropic(m)),
    }
    if (systemMsg) body.system = systemMsg.content ?? ''
    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }))
    }

    const res = await fetch('/proxy/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Anthropic API error ${res.status}: ${text}`)
    }
    const data = await res.json()

    let content: string | null = null
    const toolCalls: { id: string; name: string; arguments: string }[] = []

    for (const block of data.content) {
      if (block.type === 'text') content = (content ?? '') + block.text
      else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, arguments: JSON.stringify(block.input) })
      }
    }

    return {
      message: {
        role: 'assistant',
        content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      usage: data.usage ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens } : undefined,
    }
  }

  private toAnthropic(m: AgentMessage): Record<string, unknown> {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content ?? '' }],
      }
    }
    if (m.role === 'assistant' && m.tool_calls) {
      const content: Record<string, unknown>[] = []
      if (m.content) content.push({ type: 'text', text: m.content })
      for (const tc of m.tool_calls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: JSON.parse(tc.arguments) })
      }
      return { role: 'assistant', content }
    }
    if (m.image && m.role === 'user') {
      return {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: m.image } },
          { type: 'text', text: m.content ?? '' },
        ],
      }
    }
    return { role: m.role === 'system' ? 'user' : m.role, content: m.content ?? '' }
  }
}
