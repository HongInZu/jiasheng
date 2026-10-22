import { env, pipeline, TextStreamer } from '@huggingface/transformers';
import type { TextGenerationPipeline } from '@huggingface/transformers';
import type { AiProgress } from '../types';
import { prepareTextGeneration } from './text-generation';
import {
  type AiRequest, type AiResponse, TEXT_MODEL, TEXT_REVISION, TEXT_MODEL_LABEL,
  SPEECH_MODEL, SPEECH_REVISION, SPEECH_MODEL_LABEL,
  parseQuestions, parseStory, parseTranscript, validateDraftInput,
} from './ai-protocol';

// One CPU thread also works on static hosts without cross-origin-isolation headers.
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AiRequest>) => void) | null;
  postMessage: (message: AiResponse) => void;
};
const progress = (value: AiProgress) => scope.postMessage({ type: 'progress', progress: value });

function downloadProgress(event: unknown) {
  if (!event || typeof event !== 'object') return;
  const entry = event as { status?: string; file?: string; progress?: number; loaded?: number; total?: number };
  if (entry.status === 'progress') {
    progress({ stage: '下載開放模型', progress: entry.progress,
      detail: `${entry.file ?? '模型'}${entry.total ? ` · ${Math.round((entry.loaded ?? 0) / 1e6)} / ${Math.round(entry.total / 1e6)} MB` : ''}` });
  } else if (entry.status === 'done') {
    progress({ stage: '載入開放模型', detail: `${entry.file ?? '模型檔案'} 已就緒` });
  } else if (entry.status === 'initiate') {
    progress({ stage: '準備開放模型', detail: '優先讀取瀏覽器快取；首次使用需要下載。' });
  }
}

type ExampleMessage = { role: 'user' | 'assistant'; content: string };

async function generate(generator: TextGenerationPipeline, system: string, user: string, tokens: number, debugAction?: 'questions' | 'story', examples: ExampleMessage[] = []) {
  let pieces = 0;
  let generatedTokens = 0;
  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    token_callback_function: tokens => { generatedTokens += tokens.length; },
    callback_function: () => {
      pieces++;
      if (pieces % 8 === 0) progress({ stage: '正在整理草稿', detail: `已產生 ${pieces} 個文字片段，完成後會核對引用。` });
    },
  });
  const messages = [
    { role: 'system', content: system },
    ...examples,
    { role: 'user', content: user },
  ];
  const prepared = prepareTextGeneration(generator.tokenizer, messages, tokens);
  let inputTokens: number | undefined;
  let decodedPrompt: string | undefined;
  if (import.meta.env.DEV && debugAction) {
    // Inspect the exact already-rendered string passed to text generation.
    const encoded = generator.tokenizer([prepared.text], { add_special_tokens: false, padding: true, truncation: true });
    inputTokens = encoded.input_ids.dims.at(-1);
    decodedPrompt = generator.tokenizer.decode(Array.from(encoded.input_ids.data, Number), { skip_special_tokens: false });
  }
  // Passing a string is intentional: the pipeline must not apply a second chat
  // template that would discard enable_thinking:false or duplicate role markers.
  const output = await generator(prepared.text, { ...prepared.options, streamer });
  const first = output[0] as unknown as { generated_text: string | Array<{ role: string; content: string }> };
  const generated = first.generated_text;
  const rawText = typeof generated === 'string' ? generated : generated.at(-1)?.content ?? '';
  // Opt-in diagnostics exist only in Vite development builds and remain in memory.
  if (import.meta.env.DEV && debugAction) scope.postMessage({ type: 'diagnostic', diagnostic: {
    action: debugAction, rawText, generatedTokens, maxNewTokens: tokens,
    reachedTokenLimit: generatedTokens >= tokens, model: TEXT_MODEL, revision: TEXT_REVISION,
    inputTokens, decodedPrompt,
  } });
  return rawText;
}

let busy = false;
scope.onmessage = async ({ data }) => {
  if (busy) { scope.postMessage({ type: 'error', message: '上一項 AI 工作尚未結束。' }); return; }
  busy = true;
  const started = performance.now();
  try {
    if (data.action === 'transcribe') {
      progress({ stage: '準備語音模型', detail: 'Whisper base · 約 77 MB 模型權重 · 語音在這部裝置辨識' });
      const transcriber = await pipeline('automatic-speech-recognition', SPEECH_MODEL, {
        revision: SPEECH_REVISION, dtype: 'q8', device: 'wasm', progress_callback: downloadProgress,
      });
      progress({ stage: '正在聽寫原音', detail: '本版以華語辨識；口音、名字與年份仍需人工確認。' });
      let completedPieces = 0;
      const duration = data.audio.length / 16000;
      // Give the decoder a short quiet tail to finish an utterance ending exactly
      // at the recording boundary. This does not alter or extend the saved audio.
      const paddedAudio = new Float32Array(data.audio.length + 16000);
      paddedAudio.set(data.audio);
      const output = await transcriber(paddedAudio, {
        language: 'chinese', task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5,
        streamer: new TextStreamer(transcriber.tokenizer, {
          skip_prompt: true,
          callback_function: () => {
            completedPieces++;
            if (completedPieces % 8 === 0) progress({ stage: '正在聽寫原音', detail: `已辨識 ${completedPieces} 個文字片段，仍在核對時間。` });
          },
        }),
      });
      if (import.meta.env.DEV && data.diagnostics) {
        const raw = output as { text?: string; chunks?: unknown };
        scope.postMessage({ type: 'diagnostic', diagnostic: {
          action: 'transcribe', rawText: raw.text ?? '', chunks: raw.chunks ?? null,
          originalDuration: duration, paddedDuration: paddedAudio.length / 16000,
          model: SPEECH_MODEL, revision: SPEECH_REVISION,
        } });
      }
      // Keep all playable ranges bounded by the ORIGINAL recording length.
      const segments = parseTranscript(output, duration);
      if (!segments.length) throw new Error('沒有辨識到語音，請使用更清楚的錄音或手動輸入逐字稿。');
      await transcriber.dispose();
      scope.postMessage({ type: 'result', result: { segments, model: SPEECH_MODEL_LABEL, durationMs: Math.round(performance.now() - started) } });
      return;
    }

    if (data.action === 'story') validateDraftInput(data.input);
    progress({ stage: '準備文字模型', detail: 'Qwen3 0.6B · 約 618 MB 模型權重 · 文字在這部裝置整理' });
    const generator = await pipeline('text-generation', TEXT_MODEL, {
      revision: TEXT_REVISION, dtype: 'q8', device: 'wasm', progress_callback: downloadProgress,
    });
    progress({ stage: '正在整理草稿', detail: '第一次載入與 CPU 推論可能需要數分鐘，可隨時取消。' });
    if (data.action === 'questions') {
      const input = data.input;
      const text = await generate(generator,
        '你是親切的家庭訪談助手。只用繁體中文。',
        `受訪者：${input.person}（${input.relationship}）\n主題：${input.topic}\n背景：${input.context}\n請直接對受訪者問三個簡短問題，問當時的畫面、人物和感受，不問年份或年齡。每題一行，用 1.、2.、3. 編號。`, 220, data.diagnostics ? 'questions' : undefined, [
          { role: 'user', content: '受訪者：爸爸\n主題：第一次旅行\n背景：年輕時第一次搭夜車到花蓮。\n請直接對受訪者問三個簡短問題，問當時的畫面、人物和感受，不問年份或年齡。每題一行，用 1.、2.、3. 編號。' },
          { role: 'assistant', content: '1. 夜車開動後，你最先注意到窗外什麼？\n2. 旅途中哪個人讓你印象最深？\n3. 第一次到花蓮，你當時是什麼心情？' },
        ]);
      const questions = parseQuestions(text);
      await generator.dispose();
      scope.postMessage({ type: 'result', result: { questions, model: TEXT_MODEL_LABEL, durationMs: Math.round(performance.now() - started) } });
    } else {
      const source = data.input.segments.map(segment => segment.text).join('\n');
      const anchor = data.input.segments.at(-1)!.text;
      const text = await generate(generator,
        '你是家庭回憶編輯。只用繁體中文。',
        `主題：${data.input.topic}\n原話：\n${source}\n\n請接著這句問細節：「${anchor}」\n請只回答兩行：「標題：」和「追問：」。標題簡短，追問直接問「你」，不問年份、不補造故事。`, 180, data.diagnostics ? 'story' : undefined, [
          { role: 'user', content: '主題：學騎腳踏車\n原話：哥哥扶著腳踏車，我第一次自己騎到巷口。\n請接著這句問細節：「哥哥扶著腳踏車，我第一次自己騎到巷口。」\n請只回答兩行：「標題：」和「追問：」。標題簡短，追問直接問「你」，不問年份、不補造故事。' },
          { role: 'assistant', content: '標題：巷口的第一段路\n追問：第一次自己騎到巷口時，你眼前是什麼畫面？' },
        ]);
      const story = parseStory(text, data.input, Math.round(performance.now() - started));
      await generator.dispose();
      scope.postMessage({ type: 'result', result: story });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scope.postMessage({ type: 'error', message: message.slice(0, 400) });
  } finally { busy = false; }
};
