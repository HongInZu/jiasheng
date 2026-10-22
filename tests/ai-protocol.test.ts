import { describe, expect, it } from 'vitest';
import { parseQuestions, parseStory, parseTranscript, validateDraftInput } from '../src/workers/ai-protocol';
import { validateStory } from '../src/domain';
import type { DraftInput } from '../src/types';

const input: DraftInput = {
  person: '媽媽', topic: '第一份工作', segments: [
    { id: 'first', start: 0, end: 4, text: '我在台南的裁縫店當學徒。' },
    { id: 'uncertain', start: 4, end: 8, text: '哪一年我不太確定，可能是十八歲。' },
    { id: 'detail', start: 8, end: 12, text: '師傅讓我先練穿針。' },
  ],
};
const output = 'TITLE: 裁縫學徒的回憶\nQUESTION: 練穿針的那天，你還記得什麼？';

describe('AI reference boundary', () => {
  it('returns only references and never writes story body, preserving uncertain original words', () => {
    const story = validateStory(parseStory(output, input, 10), input.segments);
    expect(story.chapters[0].segmentIds).toEqual(['first', 'uncertain', 'detail']);
    expect(story).not.toHaveProperty('body');
    expect(input.segments[1].text).toBe('哪一年我不太確定，可能是十八歲。');
  });
  it('never accepts model-written narrative as the original source body', () => {
    const story = parseStory(`${output}\n原話：我在美國當老師。`, input, 10);
    expect(story.chapters[0].segmentIds).toEqual(['first', 'uncertain', 'detail']);
    expect(JSON.stringify(story)).not.toContain('美國');
  });
  it('uses source order regardless of a model suggesting different references', () => {
    const story = parseStory(`${output}\nids: 3, 99, 1`, input, 10);
    expect(story.chapters[0].segmentIds).toEqual(['first', 'uncertain', 'detail']);
  });
  it('always retains every original segment and labels AI responsibility accurately', () => {
    const story = parseStory(output, input, 10);
    expect(story.chapters[0]).toMatchObject({ title: '依對話順序留下的原話', segmentIds: ['first', 'uncertain', 'detail'] });
    expect(story.generatedBy).toContain('AI 擬題與追問');
    expect(validateStory(story, input.segments)).toBeTruthy();
  });
  it('anchors the question to the actual final quote supplied to the prompt', () => {
    expect(parseStory(output, input, 10).anchorSegmentId).toBe('detail');
  });
  it('rejects a missing question rather than inventing one', () => {
    expect(() => parseStory('TITLE: 學徒的回憶', input, 10)).toThrow('兩行');
  });
  it('rejects a truncated question', () => {
    expect(() => parseStory('TITLE: 學徒的回憶\nQUESTION: 練針那天你', input, 10)).toThrow('尚未完成');
  });
  it('rejects an over-limit source instead of silently truncating it', () => {
    expect(() => validateDraftInput({ ...input, segments: [{ id: 'long', start: null, end: null, text: '字'.repeat(6001) }] })).toThrow('截斷');
  });
  it('rejects duplicate source identifiers before inference', () => {
    expect(() => validateDraftInput({ ...input, segments: [input.segments[0], input.segments[0]] })).toThrow('編號');
  });
});

describe('ASR timestamps are evidence, not fabricated alignment', () => {
  it('keeps untimed ASR text untimed', () => {
    expect(parseTranscript({ text: '記得那天。' }, 12)).toEqual([{ id: 'segment-1', start: null, end: null, text: '記得那天。' }]);
  });
  it('preserves a missing end timestamp', () => {
    expect(parseTranscript({ chunks: [{ text: '記得那天。', timestamp: [3, null] }] }, 12)[0]).toMatchObject({ start: 3, end: null });
  });
  it('does not create playable ranges from backwards or out-of-audio timestamps', () => {
    const segments = parseTranscript({ chunks: [
      { text: 'A', timestamp: [5, 8] }, { text: 'B', timestamp: [2, 4] }, { text: 'C', timestamp: [20, 30] },
    ] }, 12);
    expect(segments[1]).toMatchObject({ start: null, end: null });
    expect(segments[2]).toMatchObject({ start: null, end: null });
  });
  it('does not return a made-up transcript for silence', () => {
    expect(() => parseTranscript({ text: '' }, 12)).toThrow('語音');
  });
  it('never extends playable audio to a model-only padding tail', () => {
    const segments = parseTranscript({ chunks: [
      { text: '最後一句。', timestamp: [11, 12.4] },
      { text: '不應有的尾端。', timestamp: [12.5, 13] },
    ] }, 12);
    expect(segments[0]).toMatchObject({ start: 11, end: 12 });
    expect(segments[1]).toMatchObject({ start: null, end: null });
  });
});

describe('question drafts', () => {
  it('accepts exactly three numbered model-generated questions without using a preface', () => {
    expect(parseQuestions('以下是三個問題：\n1. 那是什麼地方？\n2. 當時先做什麼？\n3. 還記得哪個人？')).toEqual(['那是什麼地方？', '當時先做什麼？', '還記得哪個人？']);
  });
  it('rejects repeated questions', () => {
    expect(() => parseQuestions('1. 那天呢？\n2. 那天呢？\n3. 你的感受呢？')).toThrow('重複');
  });
  it('rejects extra questions instead of silently truncating output', () => {
    expect(() => parseQuestions('1. A?\n2. B?\n3. C?\n4. D?')).toThrow('三個');
  });
  it('rejects the actual English-only model failure despite correct numbering', () => {
    expect(() => parseQuestions('1. What is your job?\n2. Where are you from?\n3. How long have you been working here?')).toThrow('中文');
  });
  it('rejects English-only story labels rather than treating structure as language success', () => {
    expect(() => parseStory('TITLE: First job\nQUESTION: What do you remember?', input, 10)).toThrow('中文');
  });
});
