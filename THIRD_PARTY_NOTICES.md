# Third-party software and demonstration assets

Jiasheng's application source is MIT-licensed. These components retain their own licenses; installing the project retrieves their complete notices through npm.

| Component | Version used in this submission | License / source |
| --- | --- | --- |
| Vue | 3.5.44 | [MIT](https://github.com/vuejs/core/blob/main/LICENSE) |
| Transformers.js | 3.8.1 | [Apache 2.0](https://github.com/huggingface/transformers.js/blob/main/LICENSE) |
| ONNX Runtime Web | 1.22.0-dev.20250409-89f8206ba4 | [MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) |
| Lucide Vue icons | 1.61.0 | [ISC](https://lucide.dev/license) |
| idb-keyval | 6.3.0 | [Apache 2.0](https://github.com/jakearchibald/idb-keyval/blob/main/LICENCE) |
| JSZip | 3.10.2 | [MIT option of its dual license](https://github.com/Stuk/jszip/blob/main/LICENSE.markdown) |
| Zod | 4.6.7 | [MIT](https://github.com/colinhacks/zod/blob/main/LICENSE) |

The installed dependency tree and exact versions are recorded in `package-lock.json`. Runtime license texts are included in `public/third-party-licenses.txt` and served with the application.

## Speech model

The application downloads the q8 ONNX conversion of [Whisper base](https://huggingface.co/onnx-community/whisper-base) at revision `1846881b6b3a3024392c1eea3ad983695bc23925` on explicit first use. The [Hugging Face base-model card](https://huggingface.co/openai/whisper-base) lists Apache 2.0; the [upstream Whisper project](https://github.com/openai/whisper) distributes its code and weights under MIT. The model is not included in this source repository or Cloudflare upload. Refer to those upstream projects for their notices.

Research-only Qwen implementations and their pinned revisions are documented in `docs/ai-implementation.md`; they are absent from the released interface.

## Fictional narration

`public/demo-story.mp3` was generated through Creative Claw using ElevenLabs v4 and its stock James Gao voice. The story is fictional, the voice is synthetic, and no relative was cloned. Its script and timing source are recorded in `public/demo-provenance.json`. This generated media is separate from the MIT source-code grant. It demonstrates this application and remains subject to its provider's applicable terms; this repository does not grant a standalone voice or stock-media license.

The social preview illustration and favicon were created for this project and are covered by the application source license.
