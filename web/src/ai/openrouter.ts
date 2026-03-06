import type { AgentMessage, LLMProvider, ProviderResponse, ToolDef } from './providers'

/**
 * OpenRouter uses the OpenAI-compatible API format, routed through openrouter.ai.
 * Supports 100+ models from multiple providers via a single API key.
 */
export class OpenRouterProvider implements LLMProvider {
  constructor(private apiKey: string, private model: string) {}

  async chat(messages: AgentMessage[], tools: ToolDef[]): Promise<ProviderResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(m => this.toOpenAI(m)),
    }
    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'botblocks',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`OpenRouter API error ${res.status}: ${text}`)
    }
    const data = await res.json()
    const choice = data.choices?.[0]
    if (!choice?.message) {
      throw new Error(`OpenRouter returned no choices: ${JSON.stringify(data).slice(0, 200)}`)
    }
    const msg = choice.message

    const toolCalls = msg.tool_calls?.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }))

    return {
      message: {
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: toolCalls,
      },
      usage: data.usage ? { prompt_tokens: data.usage.prompt_tokens, completion_tokens: data.usage.completion_tokens } : undefined,
    }
  }

  private toOpenAI(m: AgentMessage): Record<string, unknown> {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content ?? '' }
    }
    if (m.image && (m.role === 'user' || m.role === 'system')) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content ?? '' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${m.image}` } },
        ],
      }
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return {
        role: 'assistant',
        content: m.content ?? null,
        tool_calls: m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      }
    }
    return { role: m.role, content: m.content ?? '' }
  }
}
