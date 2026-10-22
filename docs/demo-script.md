# Jiasheng: a 60-second product demonstration

This is a recording plan, not a claim that a demo video has been recorded. The current application is a private prototype. Use the actual UI and verify the current button labels before recording.

## Recording setup

- Use a clean desktop browser at 1280 × 800 or wider, with readable text and browser audio captured.
- Open the built-in fictional “first salary / radio” story. Keep its fictional-example label visible whenever practical.
- Add a persistent English caption over example footage: **“Fictional story · synthetic stock voice · manually arranged example.”** Do not cover interface labels or playback controls.
- Use the existing stock-voice asset. It is not a family member or a cloned voice. No real family recording or photograph is required for this clip.
- Prepare a separate archive export for the closing shot. Extract its complete folder and verify that its `story.html` can play the attached original asset.
- The main 60-second clip demonstrates the product flow. It must not portray sample loading as model inference. Record actual AI execution separately once its evaluation is complete.

## Shot list and narration

| Time | Actual screen action | English narration / audible content |
|---|---|---|
| 00:00–00:07 | Show the app opening screen and begin a memory. Show a topic such as a first job or first salary. | “We talk to family. But the stories behind everyday conversations can be hard to find again.” |
| 00:07–00:15 | Show the editable conversation questions. Use the manual question path or clearly labeled example questions. These are human-written presets, not model generations. | “Jiasheng helps prepare a few questions, then gives the conversation room to happen.” |
| 00:15–00:23 | Load the built-in example through its visible example control. Show the sample disclosure and reviewed transcript. | “This example is fictional: a synthetic stock voice, with manually arranged chapters.” |
| 00:23–00:33 | Open its story. Show a source passage and click its audio control. Seek within the last passage to approximately 00:48.24 if using the player controls. Allow the final spoken line to be heard without overlapping narration. | “Each passage stays connected to its recording.” Then play: “你在外面有沒有吃飽。” Subtitle: “Have you been eating well out there?” |
| 00:33–00:41 | Show the first passage, including “確切是哪一年，我真的記不清了。” Show its linked original timestamp and the review/edit entry point. | “Uncertainty stays in the original words. Families can check the transcript and review the labels.” |
| 00:41–00:53 | Click the real export control. Show the resulting ZIP contents, then the extracted `story.html`. Click its actual audio-seek button. Use a disclosed edit if switching to the already extracted folder. | “Export the story, audio, transcript, and source details together. Keep a copy that opens without a Jiasheng account.” |
| 00:53–01:00 | Return to the app or show a simple closing card. | “Speech transcription runs locally. The next step is a consenting family trial.” |

Closing card text:

> **家聲 · Jiasheng**  
> A story you can hear again.  
> Private prototype · Local speech inference tested on synthetic audio · No family trial yet

The narration is a guide. Rehearse once at a natural pace; shorten transitions rather than accelerating the source recording. The timing must be measured from the finished video, not inferred from this table.

## How to show AI without overstating it

The built-in story is intentionally a deterministic example. Keep that disclosure in the video, even after model testing succeeds.

Use the completed Whisper base run to record a separate evidence clip containing:

1. The exact synthetic fixture or consenting input and the model requested.
2. The real loading/inference state. Label warm-cache runs, cuts, and time-lapse footage.
3. The actual returned output or error. Do not substitute the built-in example for a failed run.
4. A review against the source: transcription differences, actual timestamps and any omitted or incorrect words.
5. The actual device/browser, model revision, run date, and measured duration in an accompanying evidence file.

A successful synthetic smoke test establishes only that this path ran for that input. It is not evidence of reliable ten-minute family transcription, habit improvement, or user satisfaction.

## Before publishing this video

- [ ] Confirm the displayed flow matches the final application and the exported page plays its own bundled audio.
- [ ] Preserve readable fictional/synthetic/manual-example labels and the real-model test status.
- [ ] Verify audio capture, subtitles, the absence of overlapping speech, and the final 60-second runtime.
- [ ] Confirm any download or inference wait-time edits are disclosed.
- [ ] Add the actual public repository and demo URLs only after they exist and have been checked; neither is currently complete.
- [ ] A real family trial remains unfinished. Keep that limitation explicit unless a consenting trial actually happens, and obtain separate permission before publishing its media.
- [ ] Publish only when the submission and public access are intentionally ready; this file itself does not publish or authorize distribution of family material.
