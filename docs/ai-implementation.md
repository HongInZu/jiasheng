# Browser AI implementation and rejected text experiments

**Released interface:** Whisper base transcription, human-written opening questions, and deterministic verbatim story assembly. Qwen text generation remains a development experiment after real tests produced low-quality questions; it is not offered in the UI. The released first download is approximately **100 MB**, including speech weights and runtime. The text-model details below document the rejected experiment and do not describe an enabled feature.

This implementation runs open-weight models in a dedicated browser Worker with Transformers.js. No audio, transcript, or photo is sent to an inference service. Hugging Face receives model-file download requests; those requests expose normal network metadata. Model files and runtime must be available from the network or browser cache. First use is not offline. Clearing browser site data may clear model caches.

## Models and execution

- Text: `onnx-community/Qwen3-0.6B-ONNX`, fixed revision `58ca03a5e7b354b480b1a82b34bde8dc7b854cc0`, **q8**, CPU WASM. Model file is 617,687,575 bytes. The installed Transformers.js 3.8.1 contains the Qwen3 model/config mapping. Qwen3's thinking mode is explicitly disabled through `apply_chat_template({enable_thinking:false, tokenize:false, add_generation_prompt:true})`. The resulting **string** is passed to text generation with `add_special_tokens:false` and `return_full_text:false`; the pipeline cannot apply another chat template. Greedy decoding is used in this non-thinking mode to make comparisons reproducible.
- Speech: multilingual `onnx-community/whisper-base`, fixed revision `1846881b6b3a3024392c1eea3ad983695bc23925`, q8, CPU WASM. Quantized encoder (23,201,314 bytes) and merged decoder (53,693,315 bytes) total 76,894,629 bytes, approximately 77 MB.
- Additional tokenizer/config/runtime files are required. The experimental text-plus-speech path would require approximately **750 MB for both features on first use**, not promise an exact download size or cache persistence.
- One WASM thread avoids a requirement for cross-origin-isolation headers on static hosting. No WebGPU requirement. Browser/model support still needs to be verified on target devices.
- A new Worker runs each task. On success, error, cancellation, or ten-minute timeout it is terminated, releasing its model memory. Successful downloads can remain in the browser cache. No Ollama server or API key is used.

## Public API

`src/ai.ts` exports `prepareQuestions(input, onProgress?, signal?)`, `transcribeAudio(blob, onProgress?, signal?)`, `draftStory(input, onProgress?, signal?)`, and `cancelAi()` using the shared `src/types.ts` contract. Only one AI job may run at a time. The UI obtains first-download consent before calling these functions. The functions never silently replace failed model output with a prerecorded or manually generated result.

Audio is decoded locally, resampled to 16 kHz by Web Audio, and mixed to mono. Files must be at most 100 MB and ten minutes. Near-silent files are rejected before model download. This version explicitly sets Whisper's language to **Chinese** with 30-second windows, five-second overlap, and actual model timestamps. It does not identify speakers. Missing/invalid timestamps stay null; they are not guessed. Whisper may be inaccurate for Mandarin names, dates, regional accents, and Taiwanese; listening and correction remain necessary. An initial Chinese fixture was incorrectly decoded in English with automatic language selection, so automatic selection is not used in this version. For the same approximately 50-second synthetic fixture, tiny with forced Chinese still produced homophone errors, misheard an uncertain year, and omitted a final sentence. Base was selected for a follow-up comparison at about 36 MB more model weight. The comparison is recorded in `model-evaluation.md`: base improved several words, and inference-only tail padding recovered the final sentence on this fixture; neither result establishes general accuracy.

The inference-only PCM receives one second of zero-valued silence at the end so an utterance ending at the recording boundary has room to finish decoding. The stored original audio is unchanged. Timestamp parsing still receives the original duration; playable ranges never extend into the added silence. This is a candidate fix for an observed missing final utterance, and must be assessed against the same fixture rather than presumed successful.

Story input is limited to 60 segments and 6,000 characters so a small desktop browser can attempt it. Over-limit text is rejected, never silently truncated. The language model now has only two responsibilities: suggest a short title and suggest an open-ended follow-up question about the final source segment. It returns two labeled lines, `TITLE:` and `QUESTION:`. Deterministic code places **all original segments, in their original order**, in one explicitly labeled chapter, and links the follow-up to the actual final segment included in the prompt. The model cannot supply or change source IDs, source body, or chapter ordering. Missing, repeated, incomplete, and overlong labeled fields are rejected. The final story also passes the shared `validateStory()` function. This is AI-assisted titling and follow-up preparation; it is not claimed to be AI thematic grouping.

**The model never supplies the story body.** The body must be rendered by resolving `chapter.segmentIds` against the original, user-reviewed `segments`. This protects verbatim source text; it does not guarantee that the model's title or question are factually correct. Those remain drafts for family review. The transcript also needs review against the actual recording. Opening questions use a short Chinese system instruction, Chinese user input, and one conversation-format example from a different topic. Output must contain exactly three numbered Chinese questions; model text is parsed without inventing omitted questions. Titles and follow-ups must also contain Han characters. This language check rejects English-only failures but does not establish semantic relevance or Traditional Chinese orthography.

This narrower design follows actual failed browser tests: the original question prompt asked for JSON but returned a numbered list with irrelevant year/birthday questions (59 generated tokens; 260-token limit was not reached). The original story prompt returned rewritten source text instead of source-ID groups and omitted its follow-up (67 generated tokens; 480-token limit was not reached). The first failure was not a token-limit issue. The revised product removes unproven grouping capability and requires fresh real-model evaluation; a change in prompt is not itself evidence of improved accuracy.

A subsequent short English instruction produced three generic English job-interview questions (25 tokens), while its story task returned only “请问您需要什么帮助？” (7 tokens). Correct numbering was not semantic success. The next candidate uses a minimal Chinese system prompt, all-Chinese input, and one example conversation on a different topic. Before that change, the exact failed story prompt was rendered and re-decoded with the installed v3.8.1 tokenizer: all instructions and source lines were present in 155 tokens, ending with the expected `<|im_start|>assistant\n`; the tokenizer limit was 131,072. There was no tokenizer-level truncation in this check. Real browser diagnostics now include the decoded prompt and input token count, only when explicitly enabled in development.

The Chinese few-shot attempt still produced generic third-person questions and repeated questions about feelings, despite structurally valid Chinese output. Qwen2.5 0.5B was therefore rejected for the first release. Qwen3 0.6B completed both parsers but still produced awkward, generic questions and an unsupported assumption about independent tailoring. Language-model features were removed from the released interface. See `model-evaluation.md` for the evidence and release decision.

## Validation and real-model smoke test

`npm test -- tests/ai-protocol.test.ts tests/ai-lifecycle.test.ts tests/ai-text-generation.test.ts` exercises the reference boundary, retained source text, malformed outputs, missing/invalid timestamp handling, cancellation, model failures, worker memory release, and Qwen3's explicit template/string boundary. Unit tests do not establish model accuracy.

For actual inference, start Vite, open its page in a desktop browser, and run in that page:

```js
const { runAiEvaluation } = await import('/scripts/evaluate-ai.js');
window.aiSmokeProgress = {};
window.aiSmokeDone = false;
runAiEvaluation(value => { window.aiSmokeProgress = value; })
  .then(value => { window.aiSmokeResult = value; window.aiSmokeDone = true; });
```

The test uses synthetic text, performs actual Qwen question and story inference, reports durations and returned output, and preserves failures. Read `window.aiSmokeProgress` while it runs, then save `window.aiSmokeResult` as evidence. An optional second argument is a locally served audio-fixture URL for a real Whisper test. Label synthetic or public audio fixtures correctly; never imply they are a real user interview. Do not call it concurrently with another UI AI operation. `import('/src/ai.ts').then(m => m.cancelAi())` stops an active operation.

To diagnose malformed generation using **synthetic inputs only**, pass a third options argument: `{ diagnostics: true, only: ['opening-questions', 'source-linked-story'] }`. This explicitly enables a development-only in-memory callback, recording raw completion text and generated token count before parsing. No raw generation is logged to the console or automatically persisted. The listener is removed when evaluation ends. Production builds cannot enable or emit this diagnostic message. The original unchanged-prompt diagnostics were captured before the shorter prompts and source-order design were implemented.

For ASR diagnostics, provide the local audio fixture URL and use `{ diagnostics: true, only: ['audio-transcript'] }`. The opt-in in-memory event includes Whisper's raw `text` and `chunks` before source parsing, as well as original and inference-padded durations. These distinguish model omission from later timestamp validation. The same development-only and synthetic-input restrictions apply.

This implementation document is not evidence that a real inference test passed. Record browser/runtime, exact inputs, outputs, date, and result separately after execution. Even a passing smoke test is not a quality benchmark or a guarantee for a full ten-minute family conversation.

## Official references checked during implementation

- [Transformers.js v3.8.1 dtype guide](https://huggingface.co/docs/transformers.js/v3.8.1/guides/dtypes)
- [Transformers.js automatic speech recognition pipeline](https://huggingface.co/docs/transformers.js/v3.8.1/api/pipelines#module_pipelines.AutomaticSpeechRecognitionPipeline)
- [ONNX Qwen3 model repository](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX)
- [Original Qwen3 model card, Apache 2.0 and non-thinking template instructions](https://huggingface.co/Qwen/Qwen3-0.6B)
- [ONNX Whisper base model repository](https://huggingface.co/onnx-community/whisper-base)
- [Original Whisper base model card](https://huggingface.co/openai/whisper-base)

Downloaded model licenses remain separate from this application's source license.
