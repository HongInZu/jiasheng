import type { DraftInput, ProgressCallback, QuestionInput, Segment, Story } from './types';
import { validateStory } from './domain';
import { type AiDiagnostic, type AiRequest, type AiResponse, type AiResult, MAX_AUDIO_SECONDS, validateDraftInput } from './workers/ai-protocol';

type Job = { controller: AbortController; worker?: Worker; cancel?: () => void };
let currentJob: Job | undefined;
let diagnosticListener: ((event: AiDiagnostic) => void) | undefined;
const abortError = () => new DOMException('已取消 AI 工作，原始資料仍然保留。', 'AbortError');

/** Explicit opt-in for synthetic-input local evaluation; unavailable in production. */
export function setAiDiagnosticListener(listener?: (event: AiDiagnostic) => void): void {
  if (!import.meta.env.DEV) throw new Error('AI 診斷只在本機開發環境提供。');
  diagnosticListener = listener;
}

function beginJob(signal?: AbortSignal): Job {
  if (currentJob) throw new Error('請先等待目前的 AI 工作完成，或按取消。');
  if (signal?.aborted) throw abortError();
  const job = { controller: new AbortController() };
  currentJob = job;
  return job;
}

function releaseJob(job: Job) {
  job.worker?.terminate();
  if (currentJob === job) currentJob = undefined;
}

function connectSignal(job: Job, signal?: AbortSignal): () => void {
  const cancel = () => { job.controller.abort(); job.cancel?.(); releaseJob(job); };
  signal?.addEventListener('abort', cancel, { once: true });
  return () => signal?.removeEventListener('abort', cancel);
}

function infer<T extends AiResult>(job: Job, request: AiRequest, onProgress?: ProgressCallback): Promise<T> {
  if (job.controller.signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workers/ai.worker.ts', import.meta.url), { type: 'module' });
    job.worker = worker;
    let finished = false;
    // Termination is a hard bound for both model downloads and CPU execution.
    const timer = setTimeout(() => finish(new Error('AI 工作超過 10 分鐘，已停止並保留原始資料。請縮短內容後重試。')), 10 * 60 * 1000);
    function finish(error?: Error, result?: T) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      releaseJob(job);
      if (error) reject(error); else resolve(result!);
    }
    job.cancel = () => finish(abortError());
    worker.onmessage = ({ data }: MessageEvent<AiResponse>) => {
      if (data.type === 'progress') onProgress?.(data.progress);
      else if (data.type === 'diagnostic') {
        if (import.meta.env.DEV) diagnosticListener?.(data.diagnostic);
      }
      else if (data.type === 'error') finish(new Error(`本機 AI 未完成：${data.message}`));
      else finish(undefined, data.result as T);
    };
    worker.onerror = () => finish(new Error('瀏覽器無法啟動本機模型。請確認網路與可用記憶體，使用最新版桌面瀏覽器後重試。'));
    worker.onmessageerror = () => finish(new Error('瀏覽器無法讀取本機 AI 結果，請重試。'));
    const message: AiRequest = { ...request, diagnostics: Boolean(import.meta.env.DEV && diagnosticListener) };
    if (request.action === 'transcribe') worker.postMessage(message, [request.audio.buffer]);
    else worker.postMessage(message);
  });
}

export function cancelAi(): void {
  if (!currentJob) return;
  const job = currentJob;
  job.controller.abort();
  job.cancel?.();
  releaseJob(job);
}

export async function prepareQuestions(input: QuestionInput, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<{ questions: string[]; model: string; durationMs: number }> {
  if (!input.topic.trim()) throw new Error('請先選一個想聊的主題。');
  if (JSON.stringify(input).length > 3000) throw new Error('開場背景請控制在 3,000 字內。');
  const job = beginJob(signal);
  const disconnect = connectSignal(job, signal);
  try {
    const plainInput: QuestionInput = { person: input.person, relationship: input.relationship, topic: input.topic, context: input.context };
    return await infer(job, { action: 'questions', input: plainInput }, onProgress);
  }
  finally { disconnect(); releaseJob(job); }
}

export async function draftStory(input: DraftInput, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<Story> {
  validateDraftInput(input);
  const job = beginJob(signal);
  const disconnect = connectSignal(job, signal);
  try {
    const plainInput: DraftInput = {
      person: input.person, topic: input.topic,
      segments: input.segments.map(s => ({ id: s.id, start: s.start, end: s.end, text: s.text, ...(s.speaker ? { speaker: s.speaker } : {}) })),
    };
    const story = await infer<Story>(job, { action: 'story', input: plainInput }, onProgress);
    return validateStory(story, input.segments);
  }
  finally { disconnect(); releaseJob(job); }
}

export async function transcribeAudio(blob: Blob, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<{ segments: Segment[]; model: string; durationMs: number }> {
  if (!blob.size || blob.size > 100 * 1024 * 1024) throw new Error('請使用 100 MB 以內、具有聲音的音檔。');
  const job = beginJob(signal);
  const disconnect = connectSignal(job, signal);
  let audioContext: AudioContext | undefined;
  try {
    onProgress?.({ stage: '讀取錄音', detail: '在本機解碼音檔，不上傳原音。' });
    audioContext = new AudioContext({ sampleRate: 16000 });
    const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
    if (job.controller.signal.aborted) throw abortError();
    if (decoded.duration > MAX_AUDIO_SECONDS) throw new Error('這一版支援最長 10 分鐘的錄音，請先分段。');
    if (decoded.duration < 0.5) throw new Error('錄音太短，請使用至少半秒的語音。');
    if (decoded.sampleRate !== 16000) throw new Error('瀏覽器無法以 16 kHz 解碼音檔，請換用最新版桌面瀏覽器。');
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const samples = decoded.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / decoded.numberOfChannels;
    }
    let sum = 0;
    for (let i = 0; i < mono.length; i++) sum += mono[i] * mono[i];
    if (Math.sqrt(sum / mono.length) < 0.0001) throw new Error('這份錄音接近無聲，請確認麥克風後再試。');
    await audioContext.close();
    audioContext = undefined;
    return await infer(job, { action: 'transcribe', audio: mono }, onProgress);
  } finally {
    if (audioContext && audioContext.state !== 'closed') await audioContext.close();
    disconnect(); releaseJob(job);
  }
}
