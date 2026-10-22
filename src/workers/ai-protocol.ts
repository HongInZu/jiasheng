import type { AiProgress, DraftInput, QuestionInput, Segment, Story } from '../types';

export const TEXT_MODEL = 'onnx-community/Qwen3-0.6B-ONNX';
export const TEXT_REVISION = '58ca03a5e7b354b480b1a82b34bde8dc7b854cc0';
export const SPEECH_MODEL = 'onnx-community/whisper-base';
export const SPEECH_REVISION = '1846881b6b3a3024392c1eea3ad983695bc23925';
export const TEXT_MODEL_LABEL = 'Qwen3-0.6B · q8 · 本機瀏覽器';
export const SPEECH_MODEL_LABEL = 'Whisper base · q8 · 華語 · 本機瀏覽器';
export const MAX_AUDIO_SECONDS = 600;
export const MAX_TEXT_CHARACTERS = 6000;

export type AiRequest = (
  | { action: 'questions'; input: QuestionInput }
  | { action: 'story'; input: DraftInput }
  | { action: 'transcribe'; audio: Float32Array }
) & { diagnostics?: boolean };

export type AiDiagnostic = {
  action: 'questions' | 'story';
  rawText: string;
  generatedTokens: number;
  maxNewTokens: number;
  reachedTokenLimit: boolean;
  model: string;
  revision: string;
  inputTokens?: number;
  decodedPrompt?: string;
} | {
  action: 'transcribe';
  rawText: string;
  chunks: unknown;
  originalDuration: number;
  paddedDuration: number;
  model: string;
  revision: string;
};

export type AiResult =
  | { questions: string[]; model: string; durationMs: number }
  | { segments: Segment[]; model: string; durationMs: number }
  | Story;

export type AiResponse =
  | { type: 'progress'; progress: AiProgress }
  | { type: 'diagnostic'; diagnostic: AiDiagnostic }
  | { type: 'result'; result: AiResult }
  | { type: 'error'; message: string };

export function readJson(text: string): Record<string, unknown> {
  // Permit a Markdown fence, but do not repair malformed or truncated model JSON.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); }
  catch { throw new Error('模型沒有完成有效的結構化草稿。請縮短內容後重試；原文已保留。'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('模型回傳的草稿格式不正確，請重試。');
  }
  return parsed as Record<string, unknown>;
}

function shortText(value: unknown, max: number, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new Error(`模型回傳的${name}無效，請重試。`);
  }
  return value.trim();
}

export function parseQuestions(text: string): string[] {
  // Numbered natural language is the model's reliable native format. Do not invent
  // missing questions or treat its explanatory preface as an interview question.
  const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const numbered = lines.map(line => /^(?:(\d+)[.、．):：]|[（(](\d+)[）)])\s*(.+)$/.exec(line)).filter(match => match !== null);
  if (numbered.length !== 3 || numbered.some((match, i) => Number(match[1] || match[2]) !== i + 1)) {
    throw new Error('模型需要提供依序編號的三個開場問題，請重試。');
  }
  const questions = numbered.map(match => shortText(match[3], 180, '問題'));
  if (questions.some(question => !/\p{Script=Han}/u.test(question))) throw new Error('模型沒有以中文提供問題，草稿未套用。請重試。');
  if (questions.some(question => !/[？?]$/.test(question))) throw new Error('模型沒有完成三個問題，請重試。');
  if (new Set(questions).size !== 3) throw new Error('模型回傳重複問題，請重試。');
  return questions;
}

export function validateDraftInput(input: DraftInput): void {
  if (!Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > 60) {
    throw new Error('請使用 1 至 60 段已確認的原話。較長的訪談可以分成幾篇故事。');
  }
  if (input.segments.some(s => !s.id || !s.text.trim()) || new Set(input.segments.map(s => s.id)).size !== input.segments.length) {
    throw new Error('原話片段需要不同的編號，且內容不能空白。');
  }
  if (input.segments.reduce((n, s) => n + s.text.length, 0) > MAX_TEXT_CHARACTERS) {
    throw new Error('這一版每篇最多整理 6,000 字，請先分成較短的訪談。原文不會被截斷。');
  }
}

/** Model supplies two draft labels only. Source order and anchor are deterministic. */
export function parseStory(text: string, input: DraftInput, durationMs: number): Story {
  validateDraftInput(input);
  const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const titles = lines.map(line => /^(?:TITLE|標題)\s*[:：]\s*(.+)$/i.exec(line)).filter(match => match !== null);
  const questions = lines.map(line => /^(?:QUESTION|追問|問題)\s*[:：]\s*(.+)$/i.exec(line)).filter(match => match !== null);
  if (titles.length !== 1 || questions.length !== 1) throw new Error('模型沒有完成標題與追問兩行草稿。原話仍保留，請重試。');
  const title = shortText(titles[0][1], 100, '故事標題');
  const nextQuestion = shortText(questions[0][1], 240, '追問');
  if (!/\p{Script=Han}/u.test(title) || !/\p{Script=Han}/u.test(nextQuestion)) throw new Error('模型沒有以中文提供標題與追問，草稿未套用。');
  if (!/[？?]$/.test(nextQuestion)) throw new Error('模型的追問尚未完成，請重試。');
  return {
    title,
    subtitle: 'AI 擬題與追問；內文由程式依對話順序保留原話。請家人確認草稿。',
    chapters: [{ id: 'chapter-original', title: '依對話順序留下的原話', segmentIds: input.segments.map(segment => segment.id) }],
    nextQuestion,
    anchorSegmentId: input.segments.at(-1)!.id,
    generatedBy: `${TEXT_MODEL_LABEL} · AI 擬題與追問；原話依序保留`,
    createdAt: new Date().toISOString(),
    durationMs,
  };
}

export function parseTranscript(output: unknown, duration: number): Segment[] {
  if (!output || typeof output !== 'object') throw new Error('沒有收到有效的逐字稿。');
  const value = output as { text?: unknown; chunks?: unknown };
  if (!Array.isArray(value.chunks) || !value.chunks.length) {
    // A result without model-provided timestamps must never be presented as synchronized audio.
    if (typeof value.text !== 'string' || !value.text.trim()) throw new Error('沒有辨識到語音。請確認錄音有聲音，或改用手動逐字稿。');
    return [{ id: 'segment-1', start: null, end: null, text: value.text.trim() }];
  }
  let previousStart = 0;
  return value.chunks.flatMap((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') return [];
    const chunk = item as { text?: unknown; timestamp?: unknown };
    if (typeof chunk.text !== 'string' || !chunk.text.trim()) return [];
    const timestamps = Array.isArray(chunk.timestamp) ? chunk.timestamp : [];
    const validStart = typeof timestamps[0] === 'number' && Number.isFinite(timestamps[0]) && timestamps[0] >= previousStart && timestamps[0] >= 0 && timestamps[0] < duration;
    const start = validStart ? timestamps[0] as number : null;
    if (start !== null) previousStart = start;
    const validEnd = start !== null && typeof timestamps[1] === 'number' && Number.isFinite(timestamps[1]) && timestamps[1] > start && timestamps[1] <= duration + 0.5;
    const end = validEnd ? Math.min(timestamps[1] as number, duration) : null;
    return [{ id: `segment-${index + 1}`, start, end, text: chunk.text.trim() }];
  });
}
