import { z } from 'zod';
import type { MemorySession, Segment, Story } from './types';

const MAX_TRANSCRIPT_LENGTH = 200_000;
const MAX_SEGMENTS = 1_000;

export function createSession(overrides: Partial<MemorySession> = {}): MemorySession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), title: '', person: '', relationship: '', topic: '', context: '',
    segments: [], createdAt: now, updatedAt: now, consent: false,
    transcriptReviewed: false, sourceKind: 'text', ...overrides,
  };
}

function parseTime(value: string, line: number): number {
  const parts = value.split(':');
  if ((parts.length !== 2 && parts.length !== 3) || !parts.every(part => /^\d+$/.test(part))) {
    throw new Error(`第 ${line} 行時間格式不正確，請使用 [分:秒] 或 [時:分:秒]。`);
  }
  const values = parts.map(Number);
  const seconds = values.at(-1)!;
  const minutes = values.at(-2)!;
  if (seconds >= 60 || (parts.length === 3 && minutes >= 60)) {
    throw new Error(`第 ${line} 行的秒數或分鐘超出有效範圍。`);
  }
  const result = parts.length === 3 ? values[0]! * 3600 + minutes * 60 + seconds : minutes * 60 + seconds;
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`第 ${line} 行的時間超出有效範圍。`);
  return result;
}

/** Untimed text stays untimed: no alignment is inferred from prose or audio length. */
export function parseTranscript(text: string): Segment[] {
  if (text.length > MAX_TRANSCRIPT_LENGTH) throw new Error('逐字稿太長，請拆成較短的對話。');
  const segments: Segment[] = [];
  let lastTime = -1;
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    let content = rawLine.trim();
    if (!content) continue;
    let start: number | null = null;
    if (content.startsWith('[')) {
      const marker = /^\[([^\]]+)\]\s*/.exec(content);
      if (!marker) throw new Error(`第 ${index + 1} 行的時間標記缺少結尾括號。`);
      start = parseTime(marker[1]!, index + 1);
      if (start < lastTime) throw new Error(`第 ${index + 1} 行的時間比前一段早，請依錄音順序排列。`);
      lastTime = start;
      content = content.slice(marker[0].length).trim();
    }
    if (!content) throw new Error(`第 ${index + 1} 行只有時間，請補上對話。`);
    let speaker: string | undefined;
    const speakerMatch = /^([^：:\n]{1,30})[：:]\s*(.*)$/.exec(content);
    if (speakerMatch && !/^https?$/i.test(speakerMatch[1]!)) {
      speaker = speakerMatch[1]!.trim();
      content = speakerMatch[2]!.trim();
      if (!content) throw new Error(`第 ${index + 1} 行只有說話者，請補上對話。`);
    }
    segments.push({ id: `seg-${String(segments.length + 1).padStart(3, '0')}`, start, end: null, text: content, ...(speaker ? { speaker } : {}) });
    if (segments.length > MAX_SEGMENTS) throw new Error('對話段落太多，請拆成較短的逐字稿。');
  }
  // The next explicit timestamp bounds the preceding timed line only when adjacent.
  for (let i = 0; i < segments.length - 1; i++) {
    const current = segments[i]!;
    const next = segments[i + 1]!;
    if (current.start !== null && next.start !== null && next.start > current.start) current.end = next.start;
  }
  return segments;
}

export function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '未標記時間';
  const total = Math.floor(seconds);
  const sec = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${sec}`
    : `${String(minutes).padStart(2, '0')}:${sec}`;
}

const storySchema = z.object({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(400),
  chapters: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(120),
    segmentIds: z.array(z.string().min(1).max(100)).min(1).max(100),
  })).min(1).max(20),
  nextQuestion: z.string().trim().max(500),
  anchorSegmentId: z.string().min(1).max(100).optional(),
  generatedBy: z.string().trim().min(1).max(200),
  createdAt: z.string().max(50).refine(value => Number.isFinite(Date.parse(value)), '日期格式不正確'),
  durationMs: z.number().finite().nonnegative().optional(),
});

export function validateStory(story: Story, segments: Segment[]): Story {
  const parsed = storySchema.safeParse(story);
  if (!parsed.success) throw new Error(`故事格式不完整或超過長度限制：${parsed.error.issues[0]?.message ?? '請重新整理'}`);
  if (!segments.length || segments.length > MAX_SEGMENTS) throw new Error('故事需要有效的對話來源。');
  const sourceIds = new Set<string>();
  let lastTime = -1;
  for (const segment of segments) {
    if (!segment.id || sourceIds.has(segment.id) || !segment.text?.trim()) throw new Error('對話來源有空白內容或重複編號。');
    if (segment.text.length > 20_000) throw new Error('單段對話過長，請拆成較短段落。');
    if (segment.start !== null) {
      if (!Number.isFinite(segment.start) || segment.start < 0 || segment.start < lastTime) throw new Error('對話來源時間無效或未依序排列。');
      lastTime = segment.start;
    }
    if (segment.end !== null && (segment.start === null || !Number.isFinite(segment.end) || segment.end <= segment.start)) throw new Error('對話來源的結束時間無效。');
    sourceIds.add(segment.id);
  }
  const result = parsed.data;
  const chapterIds = new Set<string>();
  const usedSources = new Set<string>();
  for (const chapter of result.chapters) {
    if (chapterIds.has(chapter.id)) throw new Error('故事章節編號重複。');
    chapterIds.add(chapter.id);
    for (const id of chapter.segmentIds) {
      if (!sourceIds.has(id)) throw new Error(`故事引用了不存在的對話來源：${id}`);
      if (usedSources.has(id)) throw new Error(`故事重複引用同一段對話：${id}`);
      usedSources.add(id);
    }
  }
  if (usedSources.size > 500) throw new Error('故事引用過多段對話，請拆成數篇故事。');
  if (result.anchorSegmentId && !usedSources.has(result.anchorSegmentId)) throw new Error('故事錨點必須是已收錄的對話來源。');
  return result;
}

/** This fallback only arranges verbatim text; it does not pretend to be an AI result. */
export function buildExtractiveStory(session: MemorySession): Story {
  if (!session.segments.length) throw new Error('請先加入逐字稿，再整理故事。');
  if (session.segments.length > 500) throw new Error('對話超過 500 段，請分成數篇故事，避免漏掉原文。');
  const segments = session.segments;
  const chunks: Segment[][] = [];
  const chunkSize = Math.max(1, Math.ceil(segments.length / 5));
  for (let i = 0; i < segments.length; i += chunkSize) chunks.push(segments.slice(i, i + chunkSize));
  const title = session.title.trim() || session.topic.trim() || `${session.person.trim() || '家人'}的一段回憶`;
  return validateStory({
    title: title.slice(0, 120),
    subtitle: '原文整理：依對話順序保留原話，未使用 AI 改寫。',
    chapters: chunks.map((chunk, index) => ({ id: `chapter-${index + 1}`, title: chunks.length === 1 ? '那天聊起的事' : `對話片段 ${index + 1}`, segmentIds: chunk.map(segment => segment.id) })),
    nextQuestion: '回頭看這段經歷，還有哪個畫面是你想留下來的？',
    anchorSegmentId: segments[0]!.id,
    generatedBy: 'manual-extractive / 原文整理（未使用 AI）',
    createdAt: new Date().toISOString(),
  }, session.segments);
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}
