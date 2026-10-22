# Real model evaluation — 23 October 2026 (Taiwan)

Environment: Apple M1, 16 GB RAM, Chrome 155; Transformers.js 3.8.1, one CPU WASM thread. All inputs are synthetic. These smoke tests are not a quality benchmark, a real family trial, or evidence of habit change. Timings include worker startup, model loading and inference; first-use download and concurrent development work affect them.

## Speech recognition

Fixture: the 50-second fictional first-salary/radio story in `public/demo-story.mp3`. Its script and synthetic stock-voice provenance are in `public/demo-provenance.json`. The display example uses the original script, not the model transcript.

| Configuration | Observed result | Elapsed time |
| --- | --- | --- |
| Whisper tiny, automatic language selection | Incorrect English decoding of the Mandarin sample | 29.9 s |
| Whisper tiny, explicit Chinese | Chinese returned, but several major word errors and a missing final sentence | 27.6 s |
| Whisper base, explicit Chinese | Better wording for 薪水、阿嬤、包裹; uncertainty about the year preserved; final sentence still missing | 69.8 s |
| Whisper base, explicit Chinese, one-second inference-only silence padding | 17 timestamped passages; final sentence 你在外面有沒有吃飽 returned at 47.68–49.72 s | 56.0 s |

The added silence is only in the PCM sent to the model. The saved original MP3 remains byte-identical, its duration stays 50 seconds, and output timestamps are checked against the original duration. This single comparison does not prove padding fixes all tail omissions. The result still writes 做了 instead of 坐了 and uses mixed Chinese orthography; review against the original audio remains required.

Evidence: `evidence/browser-smoke-initial.txt`, `browser-diagnostics-original-prompts.txt`, `browser-whisper-base-unpadded.txt`, and `browser-whisper-base-padded.txt`.

## Text generation

The initial Qwen2.5-0.5B model was rejected after real testing:

- The original multi-field JSON request returned malformed structure and attempted to rewrite the source words.
- Short English instructions returned generic English questions despite the requested language; story output was an unrelated offer to help.
- Chinese instructions with a separate example returned structurally valid but repetitive, third-person questions. Its proposed follow-up was a copied statement, rejected by validation.

Passing a parser was insufficient. These results are preserved in `evidence/browser-diagnostics-original-prompts.txt`, `browser-qwen-english-prompts.txt`, and `browser-qwen25-fewshot.txt`. Source text was never replaced by these failed drafts.

A narrower task was also tested with Qwen3-0.6B in explicit non-thinking mode. Both outputs parsed, but the 94.6-second opening-question run produced an awkward first question (你第一次在畫面上看到什么時的感覺？) and generic follow-ups that did not use the tailoring-shop context. The 111.4-second story run retained the source passages correctly but asked about a first independent tailoring experience that the source did not establish. Evidence: `evidence/browser-qwen3.txt`.

**Release decision:** remove language-model questions and titling from the first interface. Use editable human-written topic questions and deterministic verbatim story assembly. Whisper base transcription is the enabled open-model feature. The Qwen code and development harness remain for inspection and future work; their weights are not downloaded through the released UI. This reduces the first-use download to approximately 100 MB. A parser completing is not a semantic quality pass.
