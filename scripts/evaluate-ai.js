// Import from a running Vite browser: await import('/scripts/evaluate-ai.js').
// This is a real-model smoke test using synthetic text, NOT a quality benchmark.
import { prepareQuestions, draftStory, transcribeAudio, setAiDiagnosticListener } from '/src/ai.ts';

export async function runAiEvaluation(onUpdate = () => {}, audioUrl, options = {}) {
  const report = { startedAt: new Date().toISOString(), kind: 'synthetic browser model smoke test', cases: [], diagnostics: [] };
  if (options.diagnostics) setAiDiagnosticListener(event => { report.diagnostics.push(event); onUpdate({ ...report }); });
  const progress = p => onUpdate({ ...report, progress: p });
  const scenarios = [
    ['opening-questions', () => prepareQuestions({ person: '媽媽', relationship: '母親', topic: '第一份工作', context: '曾在台南裁縫店當學徒；不記得確切年份。' }, progress)],
    ['source-linked-story', () => draftStory({ person: '媽媽', topic: '第一份工作', segments: [
      { id: 's1', start: 0, end: 5, text: '我以前在台南的裁縫店當學徒。' },
      { id: 's2', start: 5, end: 10, text: '是哪一年，我不太記得了，可能是十八歲。' },
      { id: 's3', start: 10, end: 15, text: '師傅讓我先練穿針，我練了一整天。' },
    ] }, progress)],
  ];
  if (audioUrl) scenarios.push(['audio-transcript', async () => {
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`Audio fixture HTTP ${response.status}`);
    return transcribeAudio(await response.blob(), progress);
  }]);
  try { for (const [name, execute] of scenarios) {
    if (options.only?.length && !options.only.includes(name)) continue;
    const start = performance.now();
    onUpdate({ ...report, running: name });
    try {
      const result = await execute();
      report.cases.push({ name, status: 'completed', elapsedMs: Math.round(performance.now() - start), result });
    } catch (error) {
      report.cases.push({ name, status: 'failed', elapsedMs: Math.round(performance.now() - start), error: String(error) });
    }
    onUpdate({ ...report });
  } } finally { if (options.diagnostics) setAiDiagnosticListener(); }
  report.finishedAt = new Date().toISOString();
  onUpdate(report);
  return report;
}
