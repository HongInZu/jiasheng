import { describe, expect, it, vi } from 'vitest';
import { prepareTextGeneration } from '../src/workers/text-generation';

describe('Qwen3 prompt boundary', () => {
  it('disables thinking in the tokenizer and hands one rendered string to generation', () => {
    const messages = [
      { role: 'system', content: '只用繁體中文。' },
      { role: 'user', content: '範例：學腳踏車。' },
      { role: 'assistant', content: '標題：第一段路' },
      { role: 'user', content: '真正的來源：我在裁縫店練穿針。' },
    ];
    const rendered = '<|im_start|>system\n只用繁體中文。<|im_end|>\n<|im_start|>user\n真正的來源：我在裁縫店練穿針。<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n';
    const tokenizer = { apply_chat_template: vi.fn(() => rendered) };
    const prepared = prepareTextGeneration(tokenizer, messages, 180);
    expect(tokenizer.apply_chat_template).toHaveBeenCalledExactlyOnceWith(messages, {
      tokenize: false, add_generation_prompt: true, enable_thinking: false,
    });
    // A chat array here would cause the pipeline to apply its default template
    // again, which silently drops Qwen3's non-thinking template switch.
    expect(prepared.text).toBe(rendered);
    expect(typeof prepared.text).toBe('string');
    expect(prepared.options).toMatchObject({ add_special_tokens: false, return_full_text: false });
  });
  it('rejects accidental tokenized output before it reaches the string pipeline', () => {
    const tokenizer = { apply_chat_template: vi.fn(() => [151644, 151645]) };
    expect(() => prepareTextGeneration(tokenizer, [{ role: 'user', content: '來源' }], 180)).toThrow('文字輸入');
  });
});
