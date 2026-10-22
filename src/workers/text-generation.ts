import type { PreTrainedTokenizer } from '@huggingface/transformers';

export type PromptMessage = { role: string; content: string };

/** Qwen3's thinking switch belongs to the chat template, not generation kwargs. */
export function prepareTextGeneration(tokenizer: Pick<PreTrainedTokenizer, 'apply_chat_template'>, messages: PromptMessage[], maxNewTokens: number) {
  const templateOptions = { tokenize: false, add_generation_prompt: true, enable_thinking: false };
  const text = tokenizer.apply_chat_template(messages, templateOptions);
  if (typeof text !== 'string' || !text.trim()) throw new Error('模型聊天模板沒有產生有效的文字輸入。');
  return {
    text,
    options: {
      max_new_tokens: maxNewTokens,
      do_sample: false,
      repetition_penalty: 1.05,
      return_full_text: false,
      add_special_tokens: false,
    },
  };
}
