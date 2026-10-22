import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelAi, prepareQuestions } from '../src/ai';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  send(data: unknown) { this.onmessage?.({ data }); }
}
const input = { person: '媽媽', relationship: '母親', topic: '第一份工作', context: '' };
const result = { questions: ['A?', 'B?', 'C?'], model: 'test-only', durationMs: 1 };

afterEach(() => { cancelAi(); FakeWorker.instances = []; vi.unstubAllGlobals(); });

describe('browser worker lifecycle', () => {
  it('terminates a completed worker and permits a new job', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const pending = prepareQuestions(input);
    FakeWorker.instances[0].send({ type: 'result', result });
    expect(await pending).toEqual(result);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    const second = prepareQuestions(input);
    FakeWorker.instances[1].send({ type: 'result', result });
    await expect(second).resolves.toEqual(result);
  });
  it('actively rejects cancellation and releases the model worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const pending = prepareQuestions(input);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    cancelAi();
    await rejected;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });
  it('honors an external abort signal during inference', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    const pending = prepareQuestions(input, undefined, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });
  it('does not download a model if already aborted', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    controller.abort();
    await expect(prepareQuestions(input, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it('rejects concurrent calls instead of consuming memory with two models', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const pending = prepareQuestions(input);
    await expect(prepareQuestions(input)).rejects.toThrow('等待');
    FakeWorker.instances[0].send({ type: 'result', result });
    await pending;
    expect(FakeWorker.instances).toHaveLength(1);
  });
  it('returns a model failure as an error without a substitute result', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const pending = prepareQuestions(input);
    const rejected = expect(pending).rejects.toThrow('model download failed');
    FakeWorker.instances[0].send({ type: 'error', message: 'model download failed' });
    await rejected;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });
});
