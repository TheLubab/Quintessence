import { llm } from './config';

export interface Msg { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatOptions {
  model?: string;
  temperature?: number;
}

/** Streams content deltas from any OpenAI-compatible endpoint. */
export async function* streamChat(
  messages: Msg[],
  signal?: AbortSignal,
  options: ChatOptions = {},
): AsyncGenerator<string> {
  const res = await fetch(llm.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: options.model ?? llm.model,
      messages,
      stream: true,
      temperature: options.temperature ?? llm.temperature,
      ...llm.extra,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`LLM ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const text = JSON.parse(data).choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch { /* partial or keepalive frame */ }
    }
  }
}
