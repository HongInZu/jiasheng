import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildExtractiveStory, createSession, parseTranscript } from '../src/domain';
import { exportArchive } from '../src/export';

describe('portable story archive', () => {
  it('preserves original media bytes and explicit source/model/demo metadata', async () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 11]);
    const session = createSession({ person: '虛構媽媽', sourceKind: 'demo', sourceNote: '虛構人物，不是真實訪談', transcriptReviewed: true, audio: new Blob([bytes], { type: 'audio/webm;codecs=opus' }), audioName: '../../unsafe.webm', photo: new Blob([new Uint8Array([33, 99])], { type: 'image/png' }), photoName: '回憶.png', segments: parseTranscript('[00:03] 媽媽：我不確定是哪一年。') });
    session.story = buildExtractiveStory(session);
    const archive = await JSZip.loadAsync(await (await exportArchive(session)).arrayBuffer());
    expect(Object.keys(archive.files).sort()).toEqual(['original-audio.webm', 'photo.png', 'session.json', 'story.html', 'transcript.txt']);
    expect(await archive.file('original-audio.webm')!.async('uint8array')).toEqual(bytes);
    expect(await archive.file('photo.png')!.async('uint8array')).toEqual(new Uint8Array([33, 99]));
    const metadata = JSON.parse(await archive.file('session.json')!.async('string'));
    expect(metadata.audio).toBeUndefined();
    expect(metadata.photo).toBeUndefined();
    expect(metadata.provenance).toMatchObject({ sourceKind: 'demo', sourceNote: '虛構人物，不是真實訪談', generatedBy: 'manual-extractive / 原文整理（未使用 AI）' });
    expect(Number.isFinite(Date.parse(metadata.exportedAt))).toBe(true);
    const html = await archive.file('story.html')!.async('string');
    expect(html).toContain('data-start="3"');
    expect(html).toContain('src="original-audio.webm"');
    expect(html).toContain('虛構示例：人物與故事為展示用途');
    expect(html).toContain('我不確定是哪一年。');
  });
  it('escapes untrusted model text, speaker names, source notes, and filenames', async () => {
    const attack = '<script>alert("x")</script>';
    const session = createSession({ person: attack, sourceNote: attack, sourceKind: 'demo', photoName: `x" onerror="alert(1).png`, photo: new Blob(['pixels'], { type: 'image/png' }), segments: [{ id: 'source-1', text: `<img src=x onerror=alert(1)>`, start: null, end: null, speaker: attack }] });
    session.story = { ...buildExtractiveStory(session), title: attack, subtitle: attack, nextQuestion: attack, generatedBy: attack };
    const archive = await JSZip.loadAsync(await (await exportArchive(session)).arrayBuffer());
    const html = await archive.file('story.html')!.async('string');
    expect(html).not.toContain(attack);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('alt="x&quot; onerror=&quot;alert(1).png"');
    expect((html.match(/<script>/g) ?? []).length).toBe(1);
    expect(html).not.toContain('data-start="null"');
  });
  it('does not manufacture playable timestamps for untimed text or out-of-range timestamps', async () => {
    const session = createSession({ duration: 5, audio: new Blob(['audio'], { type: 'audio/wav' }), segments: parseTranscript('沒有時間的回憶\n[00:12] 超過音檔範圍') });
    const archive = await JSZip.loadAsync(await (await exportArchive(session)).arrayBuffer());
    const html = await archive.file('story.html')!.async('string');
    expect(html).not.toContain('<button type="button" data-start=');
    expect(html).toContain('無可播放定位');
  });
  it('displays the transcript model provenance as escaped text and preserves it in JSON', async () => {
    const transcriptModel = 'whisper-tiny / <img src=x onerror="alert(1)">';
    const session = createSession({ transcriptModel, transcriptDurationMs: 1234, segments: parseTranscript('這是待校對的原話。') });
    const archive = await JSZip.loadAsync(await (await exportArchive(session)).arrayBuffer());
    const html = await archive.file('story.html')!.async('string');
    const metadata = JSON.parse(await archive.file('session.json')!.async('string'));
    expect(html).toContain('逐字稿來源／模型：whisper-tiny / &lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).not.toContain('<img src=x');
    expect(metadata.provenance).toMatchObject({ transcriptModel, transcriptDurationMs: 1234 });
  });
  it('refuses to export a story whose sources have been removed', async () => {
    const session = createSession({ segments: parseTranscript('這是原話。') });
    session.story = buildExtractiveStory(session);
    session.segments = [];
    await expect(exportArchive(session)).rejects.toThrow(/來源/);
  });
});
