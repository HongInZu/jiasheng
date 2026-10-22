---
title: "Jiasheng: keep the voice behind a family story"
published: false
tags: devchallenge, hf26challenge, opensource, ai
---

> Working draft for the [Hacktoberfest Open Source AI Challenge, Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19). This is a **private prototype**, not a published submission. Public repository and demo links and a consenting family trial remain unfinished. Real-model tests are recorded in `docs/model-evaluation.md`. Remove this editorial note only after resolving the checklist below.

## What I built

We can speak to our parents every week and still know very little about their first job, the day they left home, or the ordinary object they kept for decades.

Recording a conversation is easy. Returning to a long recording, finding the part that mattered, checking names and dates, and turning it into something the family can keep takes more work. That is the chore I wanted to make smaller.

**Jiasheng (家聲, “family voice”) turns a conversation into a portable story whose passages lead back to the original recording.** Start with a topic and a few questions. Have the conversation. Review the transcript. Keep a story you can read and hear again.

The intended experience is quiet: prepare before the conversation, then let the people do the talking. The open speech model reduces the transcription work afterward; the questions and final wording stay under human control.

## A story you can still hear

The prototype follows one complete path:

1. Add the person, relationship, and a topic or a little context. Choose editable, human-written questions from topic presets. An optional photograph can accompany the saved memory; this version does not infer a person's life from a photograph.
2. Confirm that the participants agree to recording, then record in the browser or import an audio file. Existing transcript text can also be used.
3. Request local speech recognition, listen back, correct the words and timestamps, and confirm the transcript. Untimed text stays untimed.
4. Keep the reviewed passages in their original order, then edit the title, chapter labels and next question. Click a passage with a valid time to hear the attached recording from that point.
5. Save locally and export the whole memory: an independent HTML story, the original audio and optional photo, the transcript, and structured metadata.

The archive is the result I care about. Extract it into one folder and open `story.html`; the story and its media do not need a Jiasheng account. Browser storage is a working copy, so the app also gives the family a file they can keep.

The “slow and steady” part is practical: one conversation is enough to produce a useful keepsake. I hope that reducing preparation and filing makes another conversation easier to begin. **I have not yet measured whether this changes anyone's habits.**

## The words have a source

Family memories deserve more care than a fluent summary. If someone says, “I don't remember the exact year,” a smoother story must not quietly supply one.

The application retains every source passage in order and supplies the source links deterministically. Titles and next questions are editable. **A language model does not write the story body.** The story points to passages in the reviewed transcript, and the interface renders those passages themselves. A reader can return to the associated audio rather than relying on a generated paraphrase.

The source boundary is enforced in code:

- The story builder never selects, omits, or rewrites source passages.
- Original passage IDs are carried into the story by deterministic code; all source text remains in the original order.
- Missing timestamps do not become guessed audio links. Manual input with invalid or reversed timestamps produces an error.
- Exported HTML escapes dynamic text. The archive records the source type, model or manual method, creation dates, and whether the transcript was reviewed.
- An unsuccessful AI job is reported as a failure. A manual, verbatim arrangement is an explicitly separate choice.

These safeguards preserve a path back to the wording. They do not establish that a recollection is historically true, and they cannot repair an incorrect transcript automatically. The family still needs to review the transcript and every added heading.

## Why open models fit this project

The released application transcribes with an open model using [Transformers.js](https://huggingface.co/docs/transformers.js/v3.8.1/index) in a browser Worker:

- [Whisper base](https://huggingface.co/openai/whisper-base) transcribes the attached audio locally.

It uses a pinned ONNX revision and quantized weights. The exact settings and limits are documented in `docs/ai-implementation.md`. The original model card specifies Apache 2.0; model and dependency licenses remain separate from the application's MIT source license.

Open models make local execution possible without an inference account or a service receiving the family's conversation. The app does not upload recordings, transcripts, or photographs for inference. Model and runtime downloads still contact external hosts and expose ordinary network metadata. First use needs internet access and approximately 100 MB for speech recognition and the runtime; cache retention depends on the browser. This is not a promise of an entirely offline first visit.

The small models are a deliberate scope choice, with real tradeoffs. Whisper base can mishear Mandarin names, dates, regional accents, and Taiwanese. It does not identify speakers. The prototype caps a transcription job at ten minutes and 100 MB, and pasted transcript input at 6,000 characters. The current Worker uses single-threaded CPU WASM; speed and compatibility require device-specific testing.

**Real tests changed the design.** Qwen2.5-0.5B and Qwen3-0.6B produced generic, repetitive or awkward questions, so I removed language-model features from the first interface. Whisper tiny also made substantial errors on the synthetic Mandarin fixture. Whisper base improved several words; adding one second of silence only to the inference buffer recovered the previously missing final sentence, while the saved recording stayed unchanged. The 50-second fixture took about 56 seconds in that run on an M1 Mac. It still contained homophone errors. Full inputs, outputs, settings, timings and unsuccessful runs are preserved in `docs/model-evaluation.md` and `docs/evidence/`. This is a smoke test, not an accuracy benchmark or a family trial.

## What the demonstration does—and does not—show

The built-in example is called “The radio sent home with a first salary.” Its father, dialogue, and family history are **fictional**, written for the prototype.

The voice is a synthetic stock James Gao voice, generated with ElevenLabs v4 through Creative Claw. It is not a cloned relative. The chapters were arranged manually, and the audio positions use the provider's word timings. The script and provenance are recorded in `public/demo-provenance.json`.

That example demonstrates the reading, audio-seeking, and export experience. It is not a real interview, a successful Whisper transcription, a successful Qwen generation, a testimonial, or evidence of improved family relationships. Creative Claw and ElevenLabs produced the demonstration asset only; neither is a runtime dependency of the application.

## What I can support so far

The implementation has automated tests for source validation, timestamp handling, exported HTML escaping, and preservation of the original media bytes in the archive. Additional model-protocol and Worker-lifecycle tests exercise structural validation and failure behavior. Those tests check software boundaries, not conversational quality.

There has not yet been a real family trial. The next meaningful test is one short, consenting conversation: check the transcription against the original, inspect every source link and question, and ask the participants whether the resulting story represents what they meant. I also need to observe whether exporting and reopening it is understandable without assistance.

Family storytelling is an established category. This prototype's contribution is a small, inspectable workflow around reviewed original words, local model execution, and a portable audio-linked artifact. Its value needs to be earned through the experience and the evidence.

## Demo and source

- Public demo: **TODO — the current prototype is private.**
- Public source repository: **TODO — not published.**
- Demo video: **TODO — record the actual application and retain the fictional/synthetic labels.**
- Real-model evaluation report: `docs/model-evaluation.md`, with raw runs under `docs/evidence/`.

## Before this draft can be submitted

- [ ] Verify the final submission against the official Week 3 rules and template, including project creation window and required tags.
- [ ] Create and verify a publicly accessible repository with the source license and relevant model/demo asset notices.
- [ ] Make the intended demo accessible to judges, and test its links from a fresh browser context.
- [x] Run real Qwen and Whisper tests and preserve unsuccessful results; remove unproven text generation from the released interface.
- [ ] Record the actual UI walkthrough. If a separate clip shows real inference, distinguish it from the built-in manually arranged example and disclose edited wait time.
- [ ] Complete a consenting real-person trial before making any user-benefit claim. If it remains unfinished at submission, state that fact plainly and keep the limitations above.
- [ ] Do not publish anyone's family recording, transcript, photograph, or identifying details without their specific permission.
- [ ] Check the final build and export in a target browser; record the actual test command results rather than copying an outdated count.
- [ ] Remove editorial TODOs only after their work is completed. Public repository, public demo, and real-person testing are currently unfinished.
