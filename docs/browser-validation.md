# Browser validation — 23 October 2026 (Taiwan)

Test environment: Apple M1, 16 GB RAM, Chrome 155 via Playwright, local Vite app. All test content is fictional or synthetic. No real family interview or microphone was captured. These are functional checks, not user research or a model-quality benchmark.

## Verified interactions

- Loaded the clearly labeled fictional example and clicked its 00:29 source link. The real audio element reached 29.266 seconds and was playing; audio duration was 50 seconds.
- Downloaded the ZIP through the actual export button. It contained `story.html`, `session.json`, `transcript.txt`, and `original-audio.mp3`. The original audio bytes exactly matched the demo MP3.
- Extracted the ZIP, opened `story.html` using a local `file:` URL, and clicked its 00:29 source link. Playback reached 29.143 seconds. No app server was needed for the extracted archive.
- Saved the example, reloaded the application, reopened it from the shelf, and verified the audio Blob remained playable with a 50-second duration.
- Edited a transcript passage. Its prior story was invalidated, review was unchecked, and AI story creation became disabled until review was reconfirmed.
- Rejected `[00:99]` in manual transcript input with an explanatory error. Imported a valid untimed transcript, confirmed it, and made a manual story. The page had no audio element and no enabled source-play buttons.
- Used a synthetic `NotAllowedError` to test microphone denial. The UI explained the permission issue. Then used a generated oscillator MediaStream to exercise real MediaRecorder. During pending permission, upload and transcript-paste controls were disabled. Ending recording released all tracks, saved a 29,157-byte Opus/WebM Blob, and retained a fractional 1.863-second duration.
- Delayed IndexedDB transaction completion, edited the story title while saving, and attempted to leave the page. Navigation was blocked during the save. IndexedDB retained the snapshot at click time, while the editor retained the newer text and the `尚未儲存` state. See `evidence/browser-save-race.txt`.
- At a 390-pixel viewport, the document width equaled 390 pixels, the closed sidebar ended at x=0, and story body text measured 16 px. Screenshots were visually inspected after responsive transitions finished.

## Evidence boundaries

The example story is manually arranged; it does not prove model output quality. Model runs, including unsuccessful ones, are preserved separately under `docs/evidence/`. The microphone test substitutes a synthetic stream, so it verifies recording lifecycle and permission UI rather than microphone hardware compatibility. Real-device Safari, long interviews, low-memory phones, and consenting family use remain untested.

## Build and automated checks

`npm test` on the final Qwen3/base implementation: 48 tests in 5 files passed (07:38 Taiwan). `npm run build` passed, including Vue/TypeScript checks and production bundling. Build output contains the local inference Worker and WASM runtime. Dependency audit after installation reported zero known vulnerabilities.

## Final released UI and production bundle

After removing experimental language-model controls, the Sites build helper completed successfully. A Vite production preview on the same origin then exercised the released UI: human-written topic preset selection and cycling; approximately 100 MB speech-model notice; real cancellation and restart; a real Whisper base transcription; required review before story creation; and preservation of every transcript passage in the resulting story. See `evidence/browser-production-start.txt` and `evidence/browser-production-finish.txt`. This validates bundled Worker/WASM paths rather than relying only on Vite development imports.

## Public release preparation — 23 October, 23:08 Taiwan

The final Vue/TypeScript production build passed; all 48 automated tests passed in five files. `npm audit --omit=dev` reported no known vulnerabilities.

Sixteen focused browser assertions covered English/Traditional Chinese switching without changing source text, the four labelled demo translations, removal of a translation after its source was edited, English topic questions and timestamp validation, the required transcript-review gate, English story controls preserving all original passages, and no horizontal overflow at a 390-pixel viewport. Desktop landing and mobile story screenshots were visually inspected.

The release also adds keyboard-accessible native upload buttons, a direct original-audio download, and recording guards that pause prior audio and prevent playback while recording. The ZIP now includes bilingual `START-HERE.txt` instructions. The extracted-archive replay check was repeated after removing a machine-specific path from the QA helper: original audio played at 29.12 seconds of its 50-second duration.

## Cloudflare production verification — 23 October, 23:18 Taiwan

Deployment `1a9c112f` serves the application from commit `9ffe990` at https://jiasheng-family-stories.pages.dev/. Anonymous HTTP requests returned 200 for the page, demo audio, social image, Worker, and WASM runtime; their bytes matched the local build. GitHub source and its raw README were also accessible without authentication.

The public app played the 29.12-second demo passage correctly, saved the story to its local shelf, and exported an archive containing the independent story, metadata, transcript, original audio and `START-HERE.txt`. Both the ZIP's original audio and the direct audio download matched the 801,270-byte source file exactly. See `evidence/cloudflare-export.json`.

One fresh isolated Chrome session then ran Whisper through the public production interface. The job took 62,645 ms, returned 17 timestamped passages, and included the final sentence at 47.68–49.72 seconds. Before confirmation, transcript review was unchecked and story creation disabled. The test exercised that gate and confirmed all 17 source passages were preserved unchanged. Playback of the last quote reached 47.707 seconds. There were no browser errors; six download warnings reported missing content-length headers. The known 坐／做 transcription error remained in the evidence. This was a synthetic-fixture functional test, not human approval of the transcript's accuracy. See `evidence/cloudflare-asr.txt` and `images/app-en.png`.
