import JSZip from 'jszip';
import { buildExtractiveStory, escapeHtml, formatTime, validateStory } from './domain';
import type { MemorySession } from './types';

const audioTypes: Record<string, string> = {
  'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'application/ogg': 'ogg',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
  'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/aac': 'aac',
};
const photoTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

function filename(blob: Blob, original: string | undefined, kind: 'audio' | 'photo'): string {
  const mime = blob.type.split(';')[0]!.toLowerCase();
  const types = kind === 'audio' ? audioTypes : photoTypes;
  const allowed = new Set(Object.values(types));
  const originalExtension = original?.split('.').at(-1)?.toLowerCase();
  const extension = types[mime] ?? (originalExtension && allowed.has(originalExtension) ? originalExtension : 'bin');
  return `${kind === 'audio' ? 'original-audio' : 'photo'}.${extension}`;
}

export function exportTranscript(session: MemorySession): string {
  return session.segments.map(segment => `${segment.start === null ? '' : `[${formatTime(segment.start)}] `}${segment.speaker ? `${segment.speaker}：` : ''}${segment.text}`).join('\n');
}

export async function exportArchive(session: MemorySession): Promise<Blob> {
  const story = validateStory(session.story ?? buildExtractiveStory(session), session.segments);
  const zip = new JSZip();
  const audioFile = session.audio ? filename(session.audio, session.audioName, 'audio') : undefined;
  const photoFile = session.photo ? filename(session.photo, session.photoName, 'photo') : undefined;
  if (session.audio && audioFile) zip.file(audioFile, await session.audio.arrayBuffer());
  if (session.photo && photoFile) zip.file(photoFile, await session.photo.arrayBuffer());
  const { audio: _audio, photo: _photo, ...data } = session;
  const exportedAt = new Date().toISOString();
  const sourceLabels: Record<MemorySession['sourceKind'], string> = { recorded: '錄音對話', uploaded: '上傳原音', text: '文字逐字稿', demo: '虛構示例（非真實家庭資料）' };
  const sourceLabel = sourceLabels[session.sourceKind] ?? '未標示來源';
  const metadata = { ...data, story, archiveVersion: 1, exportedAt, files: { audio: audioFile ?? null, photo: photoFile ?? null }, provenance: { sourceKind: session.sourceKind, sourceLabel, sourceNote: session.sourceNote ?? '', generatedBy: story.generatedBy, questionModel: session.questionModel ?? null, transcriptModel:session.transcriptModel ?? null, transcriptDurationMs:session.transcriptDurationMs ?? null, transcriptReviewed: session.transcriptReviewed, consent: session.consent } };
  zip.file('session.json', JSON.stringify(metadata, null, 2));
  zip.file('transcript.txt', exportTranscript(session));
  zip.file('START-HERE.txt', `家聲 / Jiasheng — your portable memory\n\n1. Extract this entire ZIP into one folder.\n2. Open story.html in a browser. Keep the audio and photo beside it.\n3. Select a passage's Listen button to return to that moment in the original recording.\n\nNo account or internet connection is needed to read this exported story. Browser support for the original audio format may vary.\n\nThe archive contains the original audio and optional photo, the reviewed or unreviewed transcript, and session.json metadata. It does not automatically restore a session into the Jiasheng app. Keep a copy somewhere safe; clearing browser data does not remove this downloaded archive.\n\n請將整個 ZIP 解壓縮到同一資料夾，再開啟 story.html。音檔和照片需與故事頁一起保存；不需登入或連網。記憶包不會自動匯回家聲編輯器。\n\n${session.sourceKind === 'demo' ? 'This example is fictional and uses a synthetic stock voice. It is not a real family interview.\n此示例為虛構故事與合成語音，不是真實家庭訪談。\n' : 'This archive may contain private family recordings. Share only with the people you choose.\n記憶包含家庭原音與文字，請自行決定分享對象。\n'}`);
  const sources = new Map(session.segments.map(segment => [segment.id, segment]));
  const chapters = story.chapters.map(chapter => `<section><h2>${escapeHtml(chapter.title)}</h2>${chapter.segmentIds.map(id => {
    const segment = sources.get(id)!;
    const canPlay = Boolean(audioFile) && segment.start !== null && (session.duration === undefined || segment.start < session.duration);
    return `<blockquote>${segment.speaker ? `<p class="speaker">${escapeHtml(segment.speaker)}</p>` : ''}<p>${escapeHtml(segment.text).replace(/\r?\n/g, '<br>')}</p><footer>${canPlay ? `<button type="button" data-start="${segment.start}">聽原聲 · ${escapeHtml(formatTime(segment.start))}</button>` : `<span>${escapeHtml(formatTime(segment.start))}${audioFile ? ' · 無可播放定位' : ' · 未附原音'}</span>`}<span class="source">來源 ${escapeHtml(segment.id)}</span></footer></blockquote>`;
  }).join('')}</section>`).join('');
  const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(story.title)} · 家聲</title>
<style>body{margin:0;background:#f8f4ed;color:#303a31;font:17px/1.85 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:48px 24px 80px}header{border-bottom:1px solid #d8d4ca;padding-bottom:28px}.brand{letter-spacing:.2em;color:#617160;font-size:14px}h1{font-size:clamp(32px,6vw,52px);line-height:1.3;font-weight:600}h2{font-size:23px;margin:40px 0 14px}p{overflow-wrap:anywhere}img{width:100%;max-height:480px;object-fit:contain;border-radius:16px;background:#ede9df;margin:24px 0}audio{width:100%}.player{position:sticky;top:0;background:#f8f4edf2;padding:14px 0;z-index:1}blockquote{margin:14px 0;padding:20px 24px;background:#fffdf8;border-left:3px solid #7f927a;border-radius:0 12px 12px 0}blockquote p{margin:0 0 12px}.speaker{font-size:13px;color:#617160}footer,.meta,.note{font-size:13px;color:#616a61}blockquote footer{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.source{font-size:11px}button{border:1px solid #a1ad98;background:#edf2e7;color:#29462f;padding:8px 12px;border-radius:999px;font:inherit;cursor:pointer}button:hover{background:#dfe8d8}.next{padding:20px 24px;border:1px dashed #aab69e;border-radius:14px}.notice{background:#efe5cb;padding:12px 16px;border-radius:10px}details{margin-top:36px}#playback-status:empty{display:none}@media print{.player,button{display:none}body{background:white}main{padding:0}blockquote{break-inside:avoid}}</style></head>
<body><main><header><div class="brand">家聲 JIASHENG · 一段值得留下的對話</div><h1>${escapeHtml(story.title)}</h1><p>${escapeHtml(story.subtitle)}</p><p class="meta">${escapeHtml(session.person || '家人')}${session.relationship ? ` · ${escapeHtml(session.relationship)}` : ''}</p>${session.sourceKind === 'demo' ? '<p class="notice">虛構示例：人物與故事為展示用途，不是真實家庭訪談。</p>' : ''}${!session.transcriptReviewed ? '<p class="notice">逐字稿尚未經人工確認，請對照原音核對。</p>' : ''}</header>
${photoFile ? `<img src="${escapeHtml(photoFile)}" alt="${escapeHtml(session.photoName || '這段回憶的照片')}">` : ''}
${audioFile ? `<div class="player"><audio id="original-audio" controls preload="metadata" src="${escapeHtml(audioFile)}"></audio><p id="playback-status" role="status" class="note"></p></div>` : '<p class="note">這份故事未附錄音，文字中的時間不代表已驗證音訊定位。</p>'}
${chapters}${story.nextQuestion ? `<section class="next"><p class="brand">下次，可以接著聊</p><p>${escapeHtml(story.nextQuestion)}</p></section>` : ''}
<details><summary>來源與保存資訊</summary><p>來源：${escapeHtml(sourceLabel)}</p>${session.sourceNote ? `<p>${escapeHtml(session.sourceNote)}</p>` : ''}<p>故事整理方式／模型：${escapeHtml(story.generatedBy)}</p>${session.questionModel ? `<p>開場問題來源：${escapeHtml(session.questionModel)}</p>` : ''}${session.transcriptModel ? `<p>逐字稿來源／模型：${escapeHtml(session.transcriptModel)}</p>` : ''}<p>建立日期：${escapeHtml(session.createdAt)}<br>故事日期：${escapeHtml(story.createdAt)}<br>匯出日期：${escapeHtml(exportedAt)}</p><p>逐字稿人工確認：${session.transcriptReviewed ? '已確認' : '尚未確認'}<br>錄音同意記錄：${session.consent ? '已勾選同意' : '未勾選同意'}</p><p>故事引文直接來自逐字稿；標題、章節與下一個問題由人編輯。請保留 session.json、transcript.txt 和媒體檔案，並將整個壓縮檔解壓到同一資料夾後開啟 story.html。</p></details>
<footer><p>家聲 · 原話有出處，回憶能帶走。</p></footer></main>
<script>const audio=document.getElementById('original-audio');const status=document.getElementById('playback-status');document.querySelectorAll('button[data-start]').forEach(button=>{button.addEventListener('click',async()=>{if(!audio||!status)return;const seconds=Number(button.dataset.start);if(!Number.isFinite(seconds)||seconds<0)return;try{if(audio.readyState<1){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(new Error('timeout')),10000);const loaded=()=>done();const failed=()=>done(new Error('audio'));function done(error){clearTimeout(timer);audio.removeEventListener('loadedmetadata',loaded);audio.removeEventListener('error',failed);error?reject(error):resolve();}audio.addEventListener('loadedmetadata',loaded,{once:true});audio.addEventListener('error',failed,{once:true});audio.load();});}if(Number.isFinite(audio.duration)&&seconds>=audio.duration){status.textContent='這個時間超出音檔長度，請核對逐字稿。';return;}audio.currentTime=seconds;await audio.play();status.textContent='正在播放原始錄音。';}catch(error){status.textContent='無法播放原音。請確認音檔與 story.html 位於同一資料夾，或使用音訊控制列播放。';}});});</script></body></html>`;
  zip.file('story.html', html);
  // Uint8Array is supported consistently in browsers and test runtimes.
  const content = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return new Blob([content as BlobPart], { type: 'application/zip' });
}
