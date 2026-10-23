---
title: "Jiasheng: keep the voice, skip the transcription chore"
published: false
tags: devchallenge, hf26challenge, opensource, ai
cover_image: https://jiasheng-family-stories.pages.dev/social-preview.png
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19).*

## What I Built

A recording can preserve a whole conversation and still be difficult to return to. Somewhere inside it is the story of a first job, the reason an old object mattered, or a sentence you want to hear again. Finding it means listening, typing, checking, and filing. That is the work **Jiasheng (家聲, “family voice”)** aims to make smaller.

Jiasheng turns a short family conversation into a portable page whose passages lead back to the original voice. Choose a topic, record or import audio, review a locally generated transcript, and keep a story you can read and hear.

The conversation stays human. Editable opening questions help someone begin; the speech model handles the first transcription pass afterward. A family member checks the words before the app arranges them into a story. Click a passage to hear its source, then export the page together with its audio, photograph, transcript, and metadata.

For “Slow and Steady,” I wanted the payoff to be one finished keepsake from one conversation. There is no streak to maintain or daily target to meet. The task to automate is the paperwork around remembering.

## Demo

**[Try Jiasheng on Cloudflare Pages](https://jiasheng-family-stories.pages.dev/?lang=en)**

Open the sample story, then play a passage and export its memory archive. English controls and English translations of the sample help explain the experience; its Chinese source words remain intact.

The sample, **“The radio sent home with a first salary,”** is a fictional family story with a synthetic stock voice. Its script and chapters were prepared for the demonstration, and its audio positions use the provider’s word timings. It shows the reading, playback, and export experience; it is not a real family interview or a prerecorded claim of successful speech recognition.

To try the actual model, import a short Mandarin recording with the speakers’ agreement, request transcription, and review the result. The first use downloads approximately 100 MB of model and runtime files. The most thorough testing so far has been in a desktop browser.

After exporting, extract the entire ZIP into one folder and open `story.html`. The story and its media can be kept independently of the hosted app.

## Code

**[Source on GitHub](https://github.com/HongInZu/jiasheng)**

The application source is MIT-licensed. Third-party models, dependencies, and the generated demonstration audio retain their separate terms.

The repository includes the [model evaluation](https://github.com/HongInZu/jiasheng/blob/main/docs/model-evaluation.md), [browser validation](https://github.com/HongInZu/jiasheng/blob/main/docs/browser-validation.md), and [demo provenance](https://github.com/HongInZu/jiasheng/blob/main/public/demo-provenance.json), including unsuccessful experiments.

## How I Built It

I built this prototype with Codex assistance. The interface uses Vue and TypeScript. [Transformers.js](https://huggingface.co/docs/transformers.js) runs a pinned, quantized [Whisper base](https://huggingface.co/onnx-community/whisper-base) model in a browser Worker. Web Audio decodes the recording locally; Whisper produces text and timestamps. IndexedDB stores the working copy, and JSZip packages the portable archive. Cloudflare Pages serves the app.

The important boundary comes after transcription: **a language model does not write the story body.** Deterministic code retains every reviewed passage in its original order. Titles, chapter labels, and the next conversation question are editable. Audio links come from source timestamps; text without timing stays untimed.

That decision emerged from testing. I tried small Qwen models for opening questions and follow-ups. Their outputs could pass structural checks while still being generic, awkward, or based on an unsupported assumption. I removed those features from the released interface and kept human-written questions.

Whisper also needed scrutiny. On a 50-second synthetic Mandarin fixture, Whisper base improved several words over the smaller model but initially missed the final sentence. Adding one second of silence to the inference buffer recovered it without changing the stored audio. That run took about 56 seconds on an M1 Mac. Homophone errors remained: this was a smoke test, not an accuracy benchmark.

The app therefore requires transcript review before story assembly. Editing source text invalidates that review. Automated and browser checks cover timestamp validation, source preservation, escaped export HTML, saved audio, and playback from the exported archive. The current version supports recordings up to ten minutes and 100 MB; Mandarin names, dates, regional accents, and Taiwanese still need careful listening. Real family testing has not yet been completed.

## Why Does Open Innovation Matter?

Family recordings can contain ordinary details that become personal in combination. With an open speech model running locally, transcription does not require sending the recording to an inference service or creating an inference account. The app does not upload recordings, transcripts, or photographs for processing.

This does not make the first visit offline: model downloads need a network connection, external hosts receive ordinary request metadata, and browser caches can be cleared. But the family’s conversation is processed on its own device. The exported story can subsequently be opened with its accompanying media without the app.

Open weights and tooling also made the implementation inspectable and replaceable. I could compare model sizes, examine failures, pin the revision, and alter inference preprocessing. A future contributor can test a better speech model without changing ownership of the archive.

That is the experience I am building toward: less transcription and filing work, a clear route back to the original voice, and a file the family can keep.

## Prize Categories

**Best Use of ElevenLabs**

I used ElevenLabs through Creative Claw to generate the sample’s narration with the stock James Gao voice. It lets visitors hear and navigate a complete example without publishing a relative’s private recording or cloning anyone’s voice. The repository records the script, provider, and timing provenance. ElevenLabs supplies this demonstration asset; the application’s transcription runs locally with Whisper.
