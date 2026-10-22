import { describe, expect, it } from 'vitest';
import { buildExtractiveStory, createSession, escapeHtml, formatTime, parseTranscript, validateStory } from '../src/domain';

describe('transcript timestamps', () => {
  it('keeps untimed speech untimed, and preserves explicit speakers and times', () => {
    const segments = parseTranscript('[00:12] 媽媽：那年我搭火車去台北。\n[01:03] 我：後來呢？\n媽媽：日期我記不清了。\n[1:02:04] 媽媽：最後回家了。');
    expect(segments.map(({ start, end }) => [start, end])).toEqual([[12, 63], [63, null], [null, null], [3724, null]]);
    expect(segments[0]).toMatchObject({ speaker: '媽媽', text: '那年我搭火車去台北。' });
    expect(segments[2]!.text).toBe('日期我記不清了。');
    expect(formatTime(3724)).toBe('1:02:04');
    expect(formatTime(null)).toBe('未標記時間');
  });
  it.each(['[00:60] 錯誤', '[1:60:00] 錯誤', '[-1:01] 錯誤', '[Infinity:01] 錯誤', '[999999999999999999999:00] 錯誤', '[00:12 缺括號', '[00:12]', '[00:12] 媽媽：'])('rejects malformed or empty timed speech: %s', input => expect(() => parseTranscript(input)).toThrow());
  it('rejects reversed time even across untimed lines', () => expect(() => parseTranscript('[00:12] 先說\n無時間\n[00:11] 後說')).toThrow(/時間比前一段早/));
  it('does not turn URLs into speakers', () => expect(parseTranscript('https://example.com')[0]).toMatchObject({ text: 'https://example.com', start: null }));
});

describe('source-backed story', () => {
  const session = () => createSession({ person: '媽媽', segments: parseTranscript('[00:01] 媽媽：我不記得確切年份。\n[00:06] 媽媽：那時在一間工廠上班。') });
  it('manual fallback only groups original source references and identifies its origin', () => {
    const input = session();
    const story = buildExtractiveStory(input);
    expect(story.generatedBy).toContain('未使用 AI');
    expect(story.subtitle).toContain('原文整理');
    expect(story.chapters.flatMap(chapter => chapter.segmentIds)).toEqual(input.segments.map(segment => segment.id));
    expect(input.segments[0]!.text).toContain('不記得');
  });
  it('rejects fabricated or duplicated source references', () => {
    const input = session();
    const story = buildExtractiveStory(input);
    const bad = structuredClone(story);
    bad.chapters[0]!.segmentIds = ['invented-source'];
    expect(() => validateStory(bad, input.segments)).toThrow(/不存在/);
    const repeated = structuredClone(story);
    repeated.chapters.push({ id: 'duplicate', title: '重複', segmentIds: [input.segments[0]!.id] });
    expect(() => validateStory(repeated, input.segments)).toThrow(/重複引用/);
  });
  it('rejects empty chapters, ungrounded anchor, and excessive output', () => {
    const input = session();
    const story = buildExtractiveStory(input);
    expect(() => validateStory({ ...story, chapters: [{ id: 'empty', title: '空章', segmentIds: [] }] }, input.segments)).toThrow();
    expect(() => validateStory({ ...story, anchorSegmentId: 'absent' }, input.segments)).toThrow(/錨點/);
    expect(() => validateStory({ ...story, title: 'x'.repeat(121) }, input.segments)).toThrow(/長度/);
  });
  it('rejects invalid segment timing before exporting any story', () => {
    const input = session();
    const story = buildExtractiveStory(input);
    input.segments[0]!.start = Infinity;
    expect(() => validateStory(story, input.segments)).toThrow(/時間/);
  });
  it('escapes HTML syntax and both attribute quote characters', () => expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;'));
});
