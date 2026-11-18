import { simulateReadableStream } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import type { LanguageModelV2StreamPart } from '@ai-sdk/provider';

/**
 * A scripted stand-in for Claude, used only when WHATSTAYED_MOCK=1.
 * It lets the garden be tested and previewed without an API key.
 * Every second thing the person says gets planted as a blossom.
 */
type Prompt = { role: string; content: unknown }[];

function lastUserText(prompt: Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i];
    if (m.role !== 'user') continue;
    const c = m.content as { type: string; text?: string }[];
    return c.map((p) => p.text ?? '').join(' ').trim();
  }
  return '';
}

const usage = { inputTokens: 10, outputTokens: 10, totalTokens: 20 };

function textChunks(text: string): LanguageModelV2StreamPart[] {
  const words = text.split(' ');
  return [
    { type: 'text-start' as const, id: 't' },
    ...words.map((w, i) => ({ type: 'text-delta' as const, id: 't', delta: (i ? ' ' : '') + w })),
    { type: 'text-end' as const, id: 't' },
    { type: 'finish' as const, finishReason: 'stop' as const, usage },
  ];
}

export function mockModel() {
  return new MockLanguageModelV2({
    doStream: async ({ prompt }) => {
      const p = prompt as unknown as Prompt;
      const justPlanted = p[p.length - 1]?.role === 'tool';
      const userTurns = p.filter((m) => m.role === 'user').length;
      const said = lastUserText(p);
      let chunks: LanguageModelV2StreamPart[];
      if (justPlanted) {
        chunks = textChunks('That one stays. Is there another moment, from this trip or somewhere else?');
      } else if (userTurns % 2 === 0) {
        const place = (said.match(/\b(?:in|at|on)\s+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)?)/) || [])[1] || 'Somewhere';
        const weights = ['light', 'tender', 'heavy'] as const;
        const input = {
          place,
          moment: said.length > 110 ? said.slice(0, 107) + '…' : said,
          feeling: ['free', 'held', 'homesick'][userTurns % 3],
          weight: weights[(userTurns / 2) % 3],
        };
        chunks = [
          { type: 'tool-call' as const, toolCallId: 'c' + userTurns, toolName: 'plantMemory', input: JSON.stringify(input) },
          { type: 'finish' as const, finishReason: 'tool-calls' as const, usage },
        ];
      } else {
        chunks = textChunks('What do you remember most about being there? A sound, a smell, who you were with?');
      }
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 25 }) };
    },
  });
}
