<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight, ArrowUpRight, AudioLines, BookOpen, Check, ChevronRight, Download, FileText, Headphones, ImagePlus, LoaderCircle, Mic, Pause, Play, Plus, Quote, ShieldCheck, Sparkles, Square, Trash2, Upload, X } from '@lucide/vue';
import type { AiProgress, Chapter, MemorySession, Segment } from './types';
import { buildExtractiveStory, createSession, formatTime, parseTranscript, validateStory } from './domain';
import { deleteSession, listSessions, saveSession } from './storage';
import { exportArchive, exportTranscript } from './export';
import { cancelAi, transcribeAudio } from './ai';
import { createDemoSession, demoTranslation } from './demo';
import { chooseLanguage, isEnglish, language, t } from './i18n';

const library = ref<MemorySession[]>([]);
const session = ref<MemorySession | null>(null);
const step = ref(0);
const dirty = ref(false);
const savedAt = ref('');
const busy = ref(false);
const notice = ref('');
const error = ref('');
const loadingLibrary = ref(true);
const photoUrl = ref('');
const audioUrl = ref('');
const audioElement = ref<HTMLAudioElement | null>(null);
const currentTime = ref(0);
const isPlaying = ref(false);
const transcriptText = ref('');
const transcriptOpen = ref(false);
const mobileLibrary = ref(false);
const aiBusy = ref(false);
const aiProgress = ref<AiProgress | null>(null);
const pendingAi = ref(false);
const modelConsent = ref(false);
const recording = ref(false);
const recordingFinalizing = ref(false);
const recordSeconds = ref(0);
const recordingPending = ref(false);
const recordingBusy = computed(() => recording.value || recordingPending.value || recordingFinalizing.value);
const recordError = ref('');
const showGuide = ref(false);
let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let recordTimer: ReturnType<typeof setInterval> | null = null;
let recordingStartedAt: number | null = null;
let recordingStoppedAt: number | null = null;
let chunks: Blob[] = [];
let abortController: AbortController | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let tracking = false;
let revision = 0;
const steps = [{ title: '準備', caption: '找個話題' }, { title: '對話', caption: '聽你說說' }, { title: '校對', caption: '確認原話' }, { title: '故事', caption: '留住這一頁' }];
const defaultQuestions = ['你還記得，這件事是怎麼開始的嗎？', '那時候的你，心裡在想什麼？', '如果要留下一個畫面，你會選哪一刻？'];
const openingSets = [
  { label: '第一份工作', topic: '第一份工作的日子', questions: ['你的第一份工作，是怎麼找到的？', '第一天上班，有哪個人或哪件事讓你一直記得？', '領到第一份薪水，你先做了什麼？'] },
  { label: '小時候的家', topic: '小時候的家與味道', questions: ['小時候的家，打開門會先看到什麼？', '一想到那個家，你最先想起哪個聲音或味道？', '如果能帶我回去待一天，你想和我一起做什麼？'] },
  { label: '一張老照片', topic: '一張老照片背後的故事', questions: ['這張照片裡，是什麼時候的你？', '拍照那一天，發生了什麼讓你記得的事？', '現在再看這張照片，有什麼是當年沒想到的？'] },
];
const openingSetIndex = ref(-1);
const hasTranscript = computed(() => !!session.value?.segments.some(segment => segment.text.trim()));
const canDraft = computed(() => hasTranscript.value && !!session.value?.transcriptReviewed);
const activeStory = computed(() => session.value?.story);
const wordCount = computed(() => session.value?.segments.reduce((count, segment) => count + segment.text.length, 0) ?? 0);
const isDemo = computed(() => session.value?.sourceKind === 'demo');
const firstName = computed(() => session.value?.person.trim() || t('家人'));
const photoInput = ref<HTMLInputElement | null>(null);
const audioInput = ref<HTMLInputElement | null>(null);
const excerpt = computed(() => session.value?.segments.find(segment => segment.id === activeStory.value?.anchorSegmentId) ?? session.value?.segments.find(segment => segment.text.trim()));
const modalOpen = computed(() => !!pendingAi.value || transcriptOpen.value || showGuide.value);
let previousFocus: HTMLElement | null = null;
let previousOverflow = '';
const hasUnsupportedTime = computed(() => {
  let previous = -1;
  return !!session.value?.segments.some(segment => {
    if (segment.start !== null) {
      if (!Number.isFinite(segment.start) || segment.start < 0 || segment.start < previous) return true;
      previous = segment.start;
    }
    return segment.end !== null && (segment.start === null || !Number.isFinite(segment.end) || segment.end <= segment.start);
  });
});

watch(session, () => { if (tracking) { dirty.value = true; revision++; } }, { deep: true, flush: 'sync' });
watch(() => session.value?.photo, blob => {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
  photoUrl.value = blob ? URL.createObjectURL(blob) : '';
}, { immediate: true });
watch(() => session.value?.audio, blob => {
  audioElement.value?.pause();
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value);
  audioUrl.value = blob ? URL.createObjectURL(blob) : '';
  currentTime.value = 0;
  isPlaying.value = false;
}, { immediate: true });
watch(modalOpen, async open => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    await nextTick();
    document.querySelector<HTMLElement>('.modal textarea, .modal .modal-actions button')?.focus();
  } else {
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus();
  }
});
function modalKeydown(event: KeyboardEvent) {
  if (!modalOpen.value) return;
  if (event.key === 'Escape') { pendingAi.value = false; transcriptOpen.value = false; showGuide.value = false; return; }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(document.querySelectorAll<HTMLElement>('.modal button:not(:disabled), .modal input:not(:disabled), .modal textarea:not(:disabled), .modal [tabindex="0"]'));
  const first = focusable[0]; const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

function announce(message: string) {
  notice.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { notice.value = ''; }, 5000);
}
function fail(problem: unknown, fallback = '操作沒有完成，請再試一次。') {
  error.value = problem instanceof Error ? problem.message : fallback;
}
function clearMessages() { error.value = ''; notice.value = ''; }
function cloneSession(value: MemorySession): MemorySession {
  return { ...value, questions: value.questions ? [...value.questions] : undefined, segments: value.segments.map(segment => ({ ...segment })), story: value.story ? { ...value.story, chapters: value.story.chapters.map(chapter => ({ ...chapter, segmentIds: [...chapter.segmentIds] })) } : undefined };
}
function allowNavigation() {
  if (busy.value) { announce('正在儲存或載入記憶，請稍候再切換。'); return false; }
  if (recordingBusy.value) { announce('請先結束錄音，再切換記憶。'); return false; }
  if (aiBusy.value) { announce('請先等候處理完成，或取消目前的處理。'); return false; }
  return !dirty.value || window.confirm(t('這一頁還沒有儲存。要離開並捨棄這次修改嗎？'));
}
function loadSession(value: MemorySession, targetStep = 0) {
  tracking = false;
  audioElement.value?.pause();
  session.value = cloneSession(value);
  if (!session.value.questions?.length) session.value.questions = defaultQuestions.map(t);
  openingSetIndex.value = openingSets.findIndex(set => t(set.topic) === session.value?.topic);
  step.value = targetStep;
  dirty.value = false;
  savedAt.value = '';
  transcriptText.value = '';
  transcriptOpen.value = false;
  mobileLibrary.value = false;
  clearMessages();
  tracking = true;
}
function newMemory() {
  if (!allowNavigation()) return;
  loadSession(createSession({ questions: defaultQuestions.map(t) }));
  dirty.value = true;
}
function selectOpeningSet(index: number) {
  if (!session.value || !allowSourceChange()) return;
  const set = openingSets[index];
  if (!set) return;
  session.value.topic = t(set.topic);
  session.value.questions = set.questions.map(t);
  session.value.questionModel = `人工題庫 / ${set.label}`;
  openingSetIndex.value = index;
}
function cycleOpeningSet() { selectOpeningSet((openingSetIndex.value + 1) % openingSets.length); }
function home() {
  if (!allowNavigation()) return;
  tracking = false;
  session.value = null;
  dirty.value = false;
  mobileLibrary.value = false;
  clearMessages();
}
function openMemory(memory: MemorySession) {
  if (memory.id === session.value?.id) { mobileLibrary.value = false; return; }
  if (!allowNavigation()) return;
  loadSession(memory, memory.story ? 3 : memory.segments.length ? 2 : memory.audio ? 1 : 0);
}
async function loadDemo() {
  if (!allowNavigation()) return;
  busy.value = true;
  const previousSessionId = session.value?.id;
  const previousRevision = revision;
  try {
    const demo = await createDemoSession();
    if (session.value?.id !== previousSessionId || revision !== previousRevision) { announce('載入期間有新的修改，已保留目前內容。需要時可以再開啟示例。'); return; }
    loadSession(demo, 3); announce('這是一段虛構示例，使用合成語音；你可以點擊引文試聽。');
  }
  catch (problem) { fail(problem, '示例載入失敗，請重試。'); }
  finally { busy.value = false; }
}
async function refreshLibrary() {
  try { library.value = (await listSessions()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  catch (problem) { fail(problem, '無法讀取本機記憶，請檢查瀏覽器儲存權限。'); }
  finally { loadingLibrary.value = false; }
}
async function save() {
  if (!session.value || busy.value) return;
  if (recordingBusy.value) { announce('請先結束錄音，才能完整儲存這一頁。'); return; }
  busy.value = true; clearMessages();
  try {
    if (session.value.story) validateStory(session.value.story, session.value.segments);
    session.value.title = session.value.story?.title || session.value.topic.trim() || (isEnglish.value ? `${firstName.value}’s story` : `${firstName.value}的故事`);
    session.value.updatedAt = new Date().toISOString();
    const snapshot = cloneSession(session.value);
    const savedRevision = revision;
    await saveSession(snapshot);
    await refreshLibrary();
    if (session.value?.id === snapshot.id && revision === savedRevision) {
      dirty.value = false;
      savedAt.value = new Date().toLocaleTimeString(language.value, { hour: '2-digit', minute: '2-digit' });
      announce('已儲存到這個瀏覽器。重要記憶也請匯出一份備份。');
    } else {
      announce('已儲存按下按鈕時的版本；之後的新修改尚未儲存，請再按一次儲存。');
    }
  } catch (problem) { fail(problem, '儲存失敗，這一頁仍在畫面上，請先匯出備份。'); }
  finally { busy.value = false; }
}
async function remove(memory: MemorySession) {
  if (busy.value || recordingBusy.value || aiBusy.value) { announce('請先完成或取消目前的處理。'); return; }
  if (!window.confirm(isEnglish.value ? `Delete “${memory.title || memory.topic || 'Untitled memory'}” from this browser? Exported backups are unaffected.` : `確定從這個瀏覽器刪除「${memory.title || memory.topic || '未命名記憶'}」？已匯出的備份不受影響。`)) return;
  busy.value = true;
  try {
    await deleteSession(memory.id);
    if (session.value?.id === memory.id) { tracking = false; session.value = null; dirty.value = false; }
    await refreshLibrary(); announce('已刪除這段本機記憶。');
  } catch (problem) { fail(problem, '刪除失敗，請再試一次。'); }
  finally { busy.value = false; }
}
function goToStep(next: number) {
  if ((recordingBusy.value) && next !== 1) { announce('請先結束錄音。'); return; }
  if (aiBusy.value) { announce('請先完成或取消目前的處理。'); return; }
  if (next === 3 && !activeStory.value) { step.value = 2; announce('確認逐字稿後，就可以整理成故事。'); return; }
  step.value = next;
  clearMessages();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function replaceSourceAllowed() {
  return !session.value?.segments.length || window.confirm(t('更換音檔會清除目前的逐字稿與故事，避免文字和原音對不上。要繼續嗎？'));
}
function allowSourceChange() {
  if (recordingBusy.value || aiBusy.value) { announce('請先結束錄音，或完成／取消目前的 AI 處理，再更換來源。'); return false; }
  return true;
}
function resetTranscript() {
  if (!session.value) return;
  session.value.segments = [];
  session.value.story = undefined;
  session.value.transcriptReviewed = false;
  session.value.transcriptModel = undefined;
  session.value.transcriptDurationMs = undefined;
}
function invalidateStory() {
  if (!session.value) return;
  session.value.transcriptReviewed = false;
  if (session.value.story) { session.value.story = undefined; announce('原話已更新。確認逐字稿後，請重新整理故事。'); }
}
async function uploadPhoto(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !session.value) return;
  input.value = '';
  if (!allowSourceChange()) return;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { error.value = '請選擇 JPG、PNG、WebP 或 GIF 照片。'; return; }
  if (file.size > 15 * 1024 * 1024) { error.value = '照片超過 15 MB，請縮小後再匯入。'; return; }
  session.value.photo = file; session.value.photoName = file.name; error.value = '';
}
async function uploadAudio(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !session.value) return;
  input.value = '';
  if (!allowSourceChange()) return;
  if (file.size > 100 * 1024 * 1024) { error.value = '音檔超過 100 MB。第一版請使用 10 分鐘以內的短對話。'; return; }
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|webm|flac)$/i.test(file.name)) { error.value = '請選擇可播放的音訊檔案，例如 MP3、WAV、M4A 或 WebM。'; return; }
  if (!replaceSourceAllowed()) return;
  resetTranscript(); session.value.audio = file; session.value.audioName = file.name; session.value.duration = undefined; session.value.sourceKind = 'uploaded'; session.value.sourceNote = undefined;
  error.value = ''; announce('音檔已匯入，請先確認可正常播放。');
}
async function startRecording() {
  if (!session.value || !session.value.consent || recordingBusy.value || aiBusy.value || busy.value) return;
  recordError.value = '';
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { recordError.value = '這個瀏覽器無法錄音。可以換用最新版 Chrome，或匯入已錄好的音檔。'; return; }
  if ((session.value.audio || session.value.segments.length) && !window.confirm(t('開始新的錄音會取代目前音檔，並清除逐字稿與故事。要繼續嗎？'))) return;
  audioElement.value?.pause();
  isPlaying.value = false;
  recordingPending.value = true;
  const recordingSessionId = session.value.id;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
      if (session.value?.id === recordingSessionId && blob.size) {
        const elapsed = recordingStartedAt === null ? undefined : Math.max(0, ((recordingStoppedAt ?? performance.now()) - recordingStartedAt) / 1000);
        resetTranscript(); session.value.audio = blob; session.value.audioName = `家聲-${new Date().toISOString().slice(0, 10)}.${blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'}`; session.value.duration = elapsed; session.value.sourceKind = 'recorded'; session.value.sourceNote = undefined;
        announce('錄音完成。可以先聽一遍，再轉成文字。');
      }
      releaseMicrophone();
    };
    recorder.onerror = () => { recordError.value = '錄音中斷，請確認已產生的音檔，或重新錄製。'; stopRecording(); };
    recorder.start(1000); recordingStartedAt = performance.now(); recordingStoppedAt = null; recording.value = true; recordSeconds.value = 0;
    recordTimer = setInterval(() => { recordSeconds.value = Math.floor((performance.now() - recordingStartedAt!) / 1000); if (recordSeconds.value >= 600) { stopRecording(); announce('已錄滿 10 分鐘並結束錄音。先把這段故事留下來吧。'); } }, 1000);
  } catch (problem) {
    releaseMicrophone();
    recordError.value = problem instanceof DOMException && problem.name === 'NotAllowedError' ? '麥克風權限沒有開啟。請在瀏覽器允許錄音，或改用匯入音檔。' : '無法開始錄音，請檢查麥克風是否可用。';
  } finally { recordingPending.value = false; }
}
function releaseMicrophone() {
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  if (recordTimer) clearInterval(recordTimer); recordTimer = null; recording.value = false; recordingFinalizing.value = false;
  recordingStartedAt = null; recordingStoppedAt = null;
}
function stopRecording() {
  if (recordingFinalizing.value) return;
  if (recorder && recorder.state !== 'inactive') { recordingStoppedAt = performance.now(); recordingFinalizing.value = true; recorder.stop(); }
  else releaseMicrophone();
  if (recordTimer) clearInterval(recordTimer); recordTimer = null;
}
function onAudioMetadata() {
  if (audioElement.value && session.value && Number.isFinite(audioElement.value.duration) && audioElement.value.duration > 0) {
    const duration = audioElement.value.duration;
    if (!session.value.duration || Math.abs(session.value.duration - duration) > 0.001) session.value.duration = duration;
  }
}
function timePlayable(segment: Segment | undefined) {
  return !recordingBusy.value && !!audioUrl.value && segment?.start !== null && segment?.start !== undefined && Number.isFinite(segment.start) && segment.start >= 0 && (!session.value?.duration || segment.start < session.value.duration);
}
async function seek(segment: Segment | undefined) {
  if (!timePlayable(segment) || !audioElement.value || segment?.start === null || segment?.start === undefined) return;
  try { audioElement.value.currentTime = segment.start; await audioElement.value.play(); }
  catch { error.value = '這個音檔暫時無法播放，請使用播放器再試一次。'; }
}
async function togglePlayback() {
  if (!audioElement.value || recordingBusy.value) return;
  if (isPlaying.value) audioElement.value.pause();
  else { try { await audioElement.value.play(); } catch { error.value = '音檔無法播放，請確認瀏覽器支援這個格式。'; } }
}
function onAudioPlay() {
  if (recordingBusy.value) { audioElement.value?.pause(); isPlaying.value = false; return; }
  isPlaying.value = true;
}
function downloadOriginalAudio() {
  if (!session.value?.audio || recordingBusy.value) return;
  const audio = session.value.audio;
  const knownSuffix = session.value.audioName?.match(/\.(mp3|m4a|wav|ogg|flac|webm|aac)$/i)?.[1]?.toLowerCase();
  const extension = audio.type.includes('mpeg') ? 'mp3' : audio.type.includes('mp4') ? 'm4a' : audio.type.includes('wav') ? 'wav' : audio.type.includes('ogg') ? 'ogg' : audio.type.includes('flac') ? 'flac' : audio.type.includes('aac') ? 'aac' : audio.type.includes('webm') ? 'webm' : knownSuffix || 'bin';
  downloadBlob(audio, `jiasheng-original-${session.value.id}.${extension}`);
}
function captionFor(segment: Segment | undefined) { return isEnglish.value && isDemo.value ? demoTranslation(segment) : ''; }
function chapterSegments(chapter: Chapter) { return chapter.segmentIds.map(id => session.value?.segments.find(segment => segment.id === id)).filter((segment): segment is Segment => !!segment); }
function isCurrentSegment(segment: Segment) { return isPlaying.value && segment.start !== null && currentTime.value >= segment.start && currentTime.value < (segment.end ?? segment.start + 30); }
function timeInput(segment: Segment, field: 'start' | 'end', event: Event) {
  if (!allowSourceChange()) return;
  const raw = (event.target as HTMLInputElement).value.trim();
  if (raw.includes(':') && !/^\d+:[0-5]\d$/.test(raw)) { error.value = '時間請使用「分:秒」，例如 1:05；秒數需介於 00 到 59。'; (event.target as HTMLInputElement).value = segment[field] === null ? '' : formatTime(segment[field]); return; }
  if (raw && !raw.includes(':') && !/^\d+(?:\.\d+)?$/.test(raw)) { error.value = '時間請使用非負秒數或「分:秒」，例如 65 或 1:05。'; (event.target as HTMLInputElement).value = segment[field] === null ? '' : formatTime(segment[field]); return; }
  const parts = raw.split(':').map(Number);
  const number = raw === '' ? null : parts.length === 2 ? parts[0]! * 60 + parts[1]! : Number(raw);
  if (number !== null && (!Number.isFinite(number) || number < 0)) { error.value = '時間請使用秒數或「分:秒」，例如 65 或 1:05。'; return; }
  segment[field] = number; invalidateStory();
  if (segment.end !== null && (segment.start === null || segment.end <= segment.start)) error.value = '結束時間必須晚於開始時間；沒有開始時間時，請把結束時間一起留白。';
  else error.value = '';
}
function addSegment() {
  if (!session.value || !allowSourceChange()) return;
  session.value.segments.push({ id: crypto.randomUUID(), start: null, end: null, text: '' }); invalidateStory();
}
function removeSegment(index: number) { if (!allowSourceChange()) return; session.value?.segments.splice(index, 1); invalidateStory(); }
function importTranscript() {
  if (!session.value || !transcriptText.value.trim()) return;
  if (!allowSourceChange()) return;
  if (transcriptText.value.length > 6000) { error.value = '第一版一次最多處理 6,000 字，請保留一段短對話。'; return; }
  try {
    const segments = parseTranscript(transcriptText.value);
    if (!segments.length) throw new Error('沒有可匯入的文字。');
    if (session.value.segments.length && !window.confirm(t('這會取代目前逐字稿與故事，要繼續嗎？'))) return;
    session.value.segments = segments; session.value.story = undefined; session.value.transcriptReviewed = false;
    session.value.transcriptModel = 'manual / 手動匯入逐字稿'; session.value.transcriptDurationMs = undefined;
    if (!session.value.audio) { session.value.sourceKind = 'text'; session.value.sourceNote = undefined; }
    transcriptOpen.value = false; transcriptText.value = ''; error.value = ''; step.value = 2; announce('已匯入文字。請逐段確認內容與時間。');
  } catch (problem) { fail(problem); }
}
function requestTranscription() {
  if (!session.value || aiBusy.value || busy.value) return;
  if (recordingBusy.value) { announce('請先完成錄音，再開始轉寫。'); return; }
  clearMessages();
  if (!session.value.audio || !session.value.consent) { error.value = '請先匯入或錄製音檔，並確認錄音與處理已取得同意。'; return; }
  if (!modelConsent.value) { pendingAi.value = true; return; }
  void runTranscription();
}
async function confirmModel() {
  pendingAi.value = false; modelConsent.value = true;
  await runTranscription();
}
async function runTranscription() {
  if (!session.value?.audio || !session.value.consent || aiBusy.value || busy.value || recordingBusy.value) return;
  if (session.value.segments.length && !window.confirm(t('重新轉寫會取代目前逐字稿與故事，要繼續嗎？'))) return;
  aiBusy.value = true; aiProgress.value = { stage: '準備語音模型', detail: 'Whisper base 在本機辨識華語；首次需要下載，之後可重用瀏覽器快取。' }; abortController = new AbortController();
  const targetSessionId = session.value.id;
  const targetAudio = session.value.audio;
  try {
    const progress = (value: AiProgress) => { aiProgress.value = value; };
    const result = await transcribeAudio(targetAudio, progress, abortController.signal);
    if (session.value?.id !== targetSessionId || session.value.audio !== targetAudio) {
      throw new Error('處理期間對話來源已更換，這次結果沒有套用。請重新處理目前的音檔。');
    }
    session.value.segments = result.segments; session.value.transcriptReviewed = false; session.value.story = undefined;
    session.value.transcriptModel = result.model; session.value.transcriptDurationMs = result.durationMs;
    step.value = 2; announce('已產生待校對逐字稿。人名、日期與方言請特別確認。');
  } catch (problem) {
    if (abortController?.signal.aborted || (problem instanceof Error && problem.name === 'AbortError')) announce('已取消轉寫，現有內容仍然保留。');
    else fail(problem, '語音轉寫沒有完成。你仍可以貼上或手動輸入逐字稿。');
  } finally { aiBusy.value = false; aiProgress.value = null; abortController = null; }
}
function stopAi() { abortController?.abort(); cancelAi(); }
function createManualStory() {
  if (!session.value || !canDraft.value || hasUnsupportedTime.value || aiBusy.value || recordingBusy.value || busy.value) return;
  try { const story = buildExtractiveStory(session.value); if (isEnglish.value) { story.subtitle = t(story.subtitle); story.nextQuestion = t(story.nextQuestion); story.chapters.forEach((chapter, index) => { chapter.title = story.chapters.length === 1 ? t('那天聊起的事') : `Conversation ${index + 1}`; }); if (!session.value.title.trim() && !session.value.topic.trim()) story.title = `${firstName.value}’s story`; } validateStory(story, session.value.segments); session.value.story = story; step.value = 3; announce('已依原話順序整理成故事。標題、章節與下一個問題都可以自己修改。'); }
  catch (problem) { fail(problem); }
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function downloadArchive() {
  if (!session.value || busy.value) return;
  busy.value = true; clearMessages();
  try { const blob = await exportArchive(cloneSession(session.value)); downloadBlob(blob, `家聲-${session.value.story?.title || session.value.topic || '記憶'}.zip`); announce('已下載記憶包，解壓縮後可開啟故事頁。請保留一份備份。'); }
  catch (problem) { fail(problem, '匯出失敗，請再試一次。'); }
  finally { busy.value = false; }
}
function downloadText() { if (session.value) downloadBlob(new Blob([exportTranscript(session.value)], { type: 'text/plain;charset=utf-8' }), `家聲-${session.value.topic || '逐字稿'}.txt`); }
function dateLabel(date: string) { return new Date(date).toLocaleDateString(language.value, { month: 'short', day: 'numeric' }); }
function handleUnload(event: BeforeUnloadEvent) { if (dirty.value || recordingBusy.value || aiBusy.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(() => { void refreshLibrary(); window.addEventListener('beforeunload', handleUnload); window.addEventListener('keydown', modalKeydown); });
onBeforeUnmount(() => {
  abortController?.abort(); cancelAi();
  if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); }
  releaseMicrophone(); audioElement.value?.pause();
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value);
  if (toastTimer) clearTimeout(toastTimer);
  window.removeEventListener('beforeunload', handleUnload);
  window.removeEventListener('keydown', modalKeydown);
  document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <div class="app-shell" :class="{ 'english-ui': isEnglish }">
    <button v-if="mobileLibrary" class="sidebar-scrim" :aria-label="t('關閉記憶書架')" @click="mobileLibrary = false"></button>
    <aside class="sidebar" :class="{ 'is-open': mobileLibrary }">
      <button class="brand" @click="home" :aria-label="t('家聲首頁')"><span class="brand-mark"><AudioLines :size="25" :stroke-width="1.6" /></span><span class="brand-name">{{ t('家聲') }}<span>STORIES, IN YOUR VOICE</span></span></button>
      <button class="new-memory-button" @click="newMemory"><Plus :size="18" /> {{ t('留下一段記憶') }}</button>
      <div class="library-heading"><span>{{ t('我的記憶書架') }}</span><span>{{ library.length.toString().padStart(2, '0') }}</span></div>
      <div class="memory-list">
        <div v-if="loadingLibrary" class="library-empty"><LoaderCircle class="spin" :size="18" /> {{ t('正在翻開書架…') }}</div>
        <div v-else-if="!library.length" class="library-empty"><BookOpen :size="27" :stroke-width="1.2" /><p>{{ t('故事，從你開始。') }}</p><span>{{ t('儲存的記憶會出現在這裡。') }}</span></div>
        <div v-for="memory in library" :key="memory.id" class="memory-list-item" :class="{ selected: session?.id === memory.id }">
          <button class="memory-select" @click="openMemory(memory)"><span class="memory-spine"><BookOpen :size="17" /></span><span><strong>{{ memory.title || memory.topic || t('未命名記憶') }}</strong><small>{{ memory.person || t('家人的故事') }} <span>·</span> {{ dateLabel(memory.updatedAt) }}</small></span></button>
          <button class="memory-delete icon-button" :aria-label="isEnglish ? `Delete ${memory.title || 'memory'}` : `刪除${memory.title || '記憶'}`" @click.stop="remove(memory)"><Trash2 :size="14" /></button>
        </div>
      </div>
      <button class="sidebar-example" :disabled="busy" @click="loadDemo"><span class="example-orbit"><Headphones :size="18" /></span><span>{{ t('先聽一頁故事') }}<small>{{ t('虛構示例・合成語音') }}</small></span><ArrowUpRight :size="16" /></button>
      <div class="sidebar-bottom"><ShieldCheck :size="17" /><div>{{ t('只留在你的瀏覽器裡') }}<small>{{ t('內容不會上傳雲端相簿。') }}</small></div></div>
      <button class="how-it-works" @click="showGuide = true">{{ t('關於家聲與資料保存') }} <ArrowUpRight :size="12" /></button>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div class="language-switch" role="group" aria-label="Interface language / 介面語言"><button :aria-pressed="language === 'zh-TW'" @click="chooseLanguage('zh-TW')">繁中</button><button :aria-pressed="language === 'en'" @click="chooseLanguage('en')">EN</button></div>
        <div class="breadcrumb"><button class="mobile-menu icon-button" @click="mobileLibrary = !mobileLibrary" :aria-label="t('開啟記憶書架')"><BookOpen :size="20" /></button><span>{{ t('一個家的記憶') }}</span><ChevronRight :size="13" /><span>{{ session ? session.topic || t('新的一頁') : t('從一次對話開始') }}</span></div>
        <span v-if="!session" class="topbar-note"><span></span> {{ t('慢慢說，我們有時間') }}</span>
        <div v-else class="save-actions"><span class="save-state">{{ dirty ? t('尚未儲存') : savedAt ? (isEnglish ? `Saved ${savedAt}` : `${savedAt} 已儲存`) : t('本機記憶') }}</span><button class="button button-small button-outline" :disabled="busy || recordingBusy || aiBusy" @click="save"><LoaderCircle v-if="busy" :size="14" class="spin" /><Check v-else :size="14" /> {{ t('儲存') }}</button></div>
      </header>

      <div v-if="error" role="alert" class="banner error-banner"><span>{{ t(error) }}</span><button class="icon-button" @click="error = ''" :aria-label="t('關閉錯誤訊息')"><X :size="16" /></button></div>
      <div v-if="notice" role="status" class="toast"><Check :size="16" /><span>{{ t(notice) }}</span><button class="icon-button" @click="notice = ''" :aria-label="t('關閉提示')"><X :size="15" /></button></div>

      <template v-if="!session">
        <section class="landing">
          <div class="landing-copy"><span class="eyebrow"><span></span> THE STORIES THAT MAKE US</span><h1 v-if="isEnglish">Some stories<br /> sound like <span>home.</span></h1><h1 v-else>有些故事，<br />只想聽<span>你</span>說。</h1><p class="landing-intro">{{ t('從一張老照片、一句「還記得嗎」開始。') }}<br class="desktop-break" /> {{ t('把家人的聲音，留成一頁能重聽的故事。') }}</p><div class="landing-actions"><button class="button button-primary" @click="newMemory">{{ t('開始第一段記憶') }} <ArrowRight :size="17" /></button><button class="text-button" :disabled="busy" @click="loadDemo"><Play :size="14" /> {{ t('看看故事的模樣') }}</button></div><div class="landing-meta"><span><ClockMini /> {{ t('一次短短的對話') }}</span><i></i><span><ShieldCheck :size="14" /> {{ t('由你保存，留給家人') }}</span></div></div>
          <div class="hero-art" :aria-label="t('以老照片和聲音保存家庭記憶的插畫')">
            <div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div>
            <div class="back-paper"><span>OUR FAMILY ARCHIVE</span><div></div><div></div><div></div></div>
            <div class="photo-paper"><div class="painted-photo"><div class="photo-sun"></div><div class="photo-mountain far"></div><div class="photo-mountain near"></div><div class="photo-house"><div></div></div><div class="photo-grass"></div><span>{{ t('家，從記得開始。') }}</span></div><p>{{ t('那些平凡日子裡，珍貴的片刻。') }}<span>MEMORY NO. 001</span></p></div>
            <div class="sound-note"><span class="sound-note-icon"><AudioLines :size="23" :stroke-width="1.5" /></span><div><span>{{ t('一句原話，留住一個人。') }}</span><div class="waveform" aria-hidden="true"><i v-for="n in 28" :key="n" :style="{ height: `${[9,18,12,25,34,17,27,13,22,30,17,10,21,35,24,14,29,18,11,27,19,33,16,23,13,20,11,8][n-1]}px` }"></i></div></div></div>
            <span class="art-caption">FOR THE VOICES YOU NEVER WANT TO FORGET</span>
          </div>
        </section>
        <section class="landing-bottom"><div class="section-kicker">{{ t('一段對話，留下什麼？') }}<span>A LITTLE TIME. A LASTING MEMORY.</span></div><div class="promise-grid"><article><span class="promise-number">01</span><div><h3>{{ t('一個好開場') }}</h3><p>{{ t('從你們熟悉的照片或話題，') }}<br /> {{ t('找到自然想問的一句話。') }}</p></div></article><article><span class="promise-number">02</span><div><h3>{{ t('一頁有原聲的故事') }}</h3><p>{{ t('保留家人的原話。點一下，') }}<br /> {{ t('就回到那個聲音、那一刻。') }}</p></div></article><article><span class="promise-number">03</span><div><h3>{{ t('一份帶得走的記憶') }}</h3><p>{{ t('照片、音檔與故事一起匯出，') }}<br /> {{ t('沒有訂閱，也能好好保存。') }}</p></div></article></div></section>
        <footer class="landing-footer"><span>{{ t('家聲 · A FAMILY MEMORY STUDIO') }}</span><span>{{ t('把平凡的對話，留給以後的自己。') }}</span></footer>
      </template>

      <template v-else>
        <div class="workspace">
          <div v-if="isDemo" class="demo-ribbon"><Sparkles :size="14" /><span>{{ t('虛構示例・合成語音') }}</span><span class="demo-extra">{{ t('用來體驗流程，並非真實家庭訪談或使用成效。') }}</span><button @click="newMemory">{{ t('開始自己的故事') }} <ArrowUpRight :size="13" /></button></div>
          <nav class="step-nav" :aria-label="t('建立記憶的步驟')"><button v-for="(item, index) in steps" :key="item.title" :class="{ active: step === index, passed: step > index }" :aria-current="step === index ? 'step' : undefined" @click="goToStep(index)"><span class="step-index"><Check v-if="step > index" :size="13" /><template v-else>{{ String(index + 1).padStart(2, '0') }}</template></span><span>{{ t(item.title) }}<small>{{ t(item.caption) }}</small></span><span v-if="index < 3" class="step-line"></span></button></nav>

          <div v-if="aiBusy" class="ai-progress" role="status" aria-live="polite"><LoaderCircle :size="20" class="spin" /><div><strong>{{ t(aiProgress?.stage || '正在處理') }}</strong><p>{{ t(aiProgress?.detail || '模型在這個瀏覽器裡運作。請保留這個分頁。') }}</p><progress v-if="typeof aiProgress?.progress === 'number'" :value="aiProgress.progress" max="100"></progress></div><button class="button button-small button-outline" @click="stopAi">{{ t('取消') }}</button></div>

          <section v-if="step === 0" class="prepare-view">
            <div class="view-heading"><span class="eyebrow">01 / A PLACE TO BEGIN</span><h1>{{ t('這次，想聽誰的故事？') }}</h1><p>{{ t('不需要準備一場訪談。選一件你想多知道一點的小事就好。') }}</p></div>
            <div class="prepare-layout"><div class="prepare-form"><div class="field-row"><label class="field">{{ t('怎麼稱呼這位家人') }}<input v-model="session.person" :disabled="aiBusy || recordingBusy" :placeholder="t('例如：媽媽、阿公、慧玲')" maxlength="80" /></label><label class="field">{{ t('你們的關係') }}<span class="optional">{{ t('選填') }}</span><input v-model="session.relationship" :disabled="aiBusy || recordingBusy" :placeholder="t('例如：母女、祖孫')" maxlength="80" /></label></div><label class="field">{{ t('從哪一件事聊起？') }}<input v-model="session.topic" :disabled="aiBusy || recordingBusy" :placeholder="t('例如：媽媽在照相館工作的那一年')" maxlength="160" /></label><label class="field">{{ t('你已經知道的一點點') }}<span class="optional">{{ t('選填') }}</span><textarea v-model="session.context" :disabled="aiBusy || recordingBusy" rows="3" :placeholder="t('照片裡有誰？大約是哪一年？有什麼一直沒機會問？')" maxlength="1500"></textarea></label><div class="topic-suggestions"><span>{{ t('還沒想到？') }}</span><button v-for="(set, index) in openingSets" :key="set.topic" :disabled="aiBusy || recordingBusy" @click="selectOpeningSet(index)">{{ t(set.label) }}</button></div></div><div class="photo-upload-card"><input ref="photoInput" type="file" class="file-input" tabindex="-1" aria-hidden="true" accept="image/jpeg,image/png,image/webp,image/gif" :disabled="recordingBusy || aiBusy" @change="uploadPhoto" /><div v-if="photoUrl" class="uploaded-photo"><img :src="photoUrl" :alt="t('這段記憶的照片')" /><button class="remove-photo icon-button" :disabled="recordingBusy || aiBusy" @click="session.photo = undefined; session.photoName = undefined" :aria-label="t('移除照片')"><X :size="16" /></button></div><button v-else type="button" class="photo-drop" :disabled="recordingBusy || aiBusy" @click="photoInput?.click()"><ImagePlus :size="30" :stroke-width="1.3" /><strong>{{ t('讓一張照片，打開話匣子') }}</strong><span>{{ t('加入舊照片，或任何有故事的畫面') }}</span><span class="upload-pill">{{ t('選擇照片') }} <Plus :size="13" /></span></button><div class="photo-card-caption"><span>{{ t('照片與背景會留在這頁，陪你們打開話匣子。') }}</span><button v-if="photoUrl" type="button" class="text-button" :disabled="recordingBusy || aiBusy" @click="photoInput?.click()">{{ t('更換照片') }}</button></div></div></div>
            <section class="questions-section"><div class="section-title-row"><div><span class="eyebrow">CONVERSATION STARTERS</span><h2>{{ t('口袋裡放三個問題') }}</h2><p>{{ t('可以直接用，也可以改成你平常說話的樣子。') }}</p></div><button class="button button-outline" :disabled="aiBusy || recordingBusy" @click="cycleOpeningSet"><BookOpen :size="15" /> {{ t('換一組開場') }}</button></div><div class="question-cards"><label v-for="(_, index) in session.questions" :key="index" class="question-card"><span>0{{ index + 1 }}</span><textarea v-model="session.questions![index]" :disabled="aiBusy || recordingBusy" :aria-label="isEnglish ? `Opening question ${index + 1}` : `開場問題 ${index + 1}`" rows="3" maxlength="300"></textarea></label></div><p class="quiet-note">{{ t('人工提供的開場問題，可自由編輯。換一組會切換話題與三個問題；照片及背景會保留。') }}</p></section>
            <div class="step-footer"><span>{{ t('準備好了，就把注意力交給對方。') }}</span><button class="button button-primary" :disabled="aiBusy || recordingBusy" @click="goToStep(1)">{{ t('開始對話') }} <ArrowRight :size="17" /></button></div>
          </section>

          <section v-else-if="step === 1" class="conversation-view"><div class="view-heading"><span class="eyebrow">02 / MAKE ROOM FOR THEIR VOICE</span><h1>{{ isEnglish ? `Now, listen to ${firstName}.` : `接下來，好好聽${firstName}說。` }}</h1><p>{{ t('找個安靜的角落，從你最想知道的一個問題開始。') }}</p></div><div class="conversation-layout"><div class="record-panel"><div class="record-panel-top"><span><span class="tiny-dot" :class="{ live: recording }"></span>{{ recording ? t('正在錄音') : session.audio ? t('已留下這段聲音') : t('準備留下聲音') }}</span><span>{{ t('最長 10 分鐘') }}</span></div><div class="record-art" :class="{ 'is-recording': recording }"><div></div><div></div><span><Mic :size="31" :stroke-width="1.3" /></span></div><h2>{{ recording ? formatTime(recordSeconds) : session.audio ? t('聲音，已經在這裡。') : t('不用說得完整，慢慢來。') }}</h2><p>{{ recording ? t('停頓、笑聲和想了一下，也都是故事的一部分。') : session.audio ? t('可以先聽聽看，再讓文字跟上聲音。') : t('第一次，聊一件小事就好。') }}</p><button v-if="recording" class="button button-record-stop" :disabled="recordingFinalizing" @click="stopRecording"><Square :size="15" fill="currentColor" /> {{ recordingFinalizing ? t('正在保存聲音…') : t('結束錄音') }}</button><button v-else class="button button-primary" :disabled="!session.consent || recordingBusy || aiBusy || busy" @click="startRecording"><LoaderCircle v-if="recordingPending" :size="17" class="spin" /><Mic v-else :size="17" /> {{ session.audio ? t('重新錄一段') : t('開始錄音') }}</button><div class="audio-alternative"><span>{{ t('或') }}</span><button type="button" class="text-button" :disabled="recordingBusy || aiBusy" @click="audioInput?.click()"><Upload :size="14" /> {{ t('匯入現有音檔') }}</button><input ref="audioInput" type="file" class="file-input" tabindex="-1" aria-hidden="true" accept="audio/*,.m4a,.webm" :disabled="recordingBusy || aiBusy" @change="uploadAudio" /></div><label class="consent-check"><input v-model="session.consent" type="checkbox" :disabled="recordingBusy || aiBusy" /><span>{{ t('我已取得對話者同意，可以錄音並在這台裝置處理這段對話。') }}</span></label><p v-if="recordError" role="alert" class="inline-error">{{ t(recordError) }}</p></div><aside class="conversation-prompts"><span class="eyebrow">{{ t('不必照著問，跟著好奇心走') }}</span><div v-for="(question, index) in session.questions" :key="index" class="prompt-item"><span>0{{ index + 1 }}</span><p>{{ question }}</p></div><div class="listening-note"><Quote :size="22" :stroke-width="1.2" /><p>{{ t('有時候，最好的下一句，') }}<br /> {{ t('只是「然後呢？」') }}</p></div></aside></div><div v-if="session.audio" class="audio-ready"><div><FileText :size="20" /><span><strong>{{ session.audioName || t('這段對話') }}</strong><small>{{ session.duration ? formatTime(session.duration) : t('音檔已載入') }} · {{ (session.audio.size / 1024 / 1024).toFixed(1) }} MB</small></span></div><button class="button button-primary" :disabled="!session.consent || aiBusy || recordingBusy" @click="requestTranscription"><Sparkles :size="16" /> {{ t('轉成逐字稿') }}</button><button class="text-button audio-original-download" :disabled="recordingBusy" @click="downloadOriginalAudio"><Download :size="14" />{{ isEnglish ? 'Download original audio' : '下載原始音檔' }}</button><p>{{ t('本機開放模型以華語辨識，初次使用需下載。繁中用字、方言、人名及日期都需要人工校對。') }}</p></div><div class="transcript-alternative"><div><h3>{{ t('已經有文字記錄？') }}</h3><p>{{ t('也可以直接貼上逐字稿，繼續整理故事。') }}</p></div><button class="text-button" :disabled="recordingBusy || aiBusy" @click="transcriptOpen = true">{{ t('貼上逐字稿') }} <ArrowRight :size="15" /></button></div><div class="step-footer"><button class="text-button" :disabled="recordingBusy || aiBusy" @click="goToStep(0)"><ArrowLeft :size="15" /> {{ t('回到準備') }}</button><button class="button button-outline" :disabled="recordingBusy || aiBusy" @click="goToStep(2)">{{ hasTranscript ? t('前往校對') : t('手動輸入文字') }} <ArrowRight :size="16" /></button></div></section>

          <section v-else-if="step === 2" class="review-view"><div class="view-heading"><span class="eyebrow">03 / TRUE TO THEIR WORDS</span><h1>{{ t('把原話，留準確。') }}</h1><p>{{ isEnglish ? `This story quotes the transcript. Listen, check, and keep the words true to ${firstName}.` : `故事會引用這裡的文字。聽一聽、改一改，讓它仍然是${firstName}的話。` }}</p></div><div class="review-toolbar"><span class="status-pill" :class="{ 'is-checked': session.transcriptReviewed }"><Check v-if="session.transcriptReviewed" :size="13" /><FileText v-else :size="13" />{{ session.transcriptReviewed ? t('已人工校對') : t('待人工校對') }}</span><span>{{ session.segments.length }} {{ t('段 ·') }} {{ wordCount }} {{ t('字') }}</span><div></div><button class="text-button" :disabled="aiBusy || recordingBusy" @click="transcriptOpen = true"><Upload :size="14" /> {{ t('貼上文字') }}</button><button v-if="hasTranscript" class="text-button" @click="downloadText"><Download :size="14" /><span class="desktop-only">{{ t('匯出文字') }}</span></button></div><div v-if="!hasTranscript && !session.segments.length" class="empty-transcript"><FileText :size="36" :stroke-width="1.1" /><h2>{{ t('這一頁，等你的第一句話。') }}</h2><p>{{ t('貼上既有逐字稿，或輸入家人說過的話。') }}<br /> {{ t('有音檔的話，也可以用模型先做一份待校對草稿。') }}</p><div><button class="button button-primary" @click="transcriptOpen = true">{{ t('貼上逐字稿') }} <Plus :size="16" /></button><button v-if="session.audio" class="button button-outline" :disabled="!session.consent || aiBusy || recordingBusy" @click="requestTranscription"><Sparkles :size="15" /> {{ t('從音檔轉寫') }}</button><button v-else class="button button-outline" @click="addSegment">{{ t('手動寫一句') }}</button></div></div><div v-else class="transcript-segments"><article v-for="(segment, index) in session.segments" :key="segment.id" class="transcript-segment" :class="{ 'is-playing': isCurrentSegment(segment) }"><div class="segment-side"><span class="segment-number">{{ String(index + 1).padStart(2, '0') }}</span><button class="source-play" :disabled="!timePlayable(segment)" :aria-label="isEnglish ? `Play source segment ${index + 1}` : `播放第 ${index + 1} 段原音`" @click="seek(segment)"><Play :size="13" fill="currentColor" />{{ segment.start === null ? t('無時間') : formatTime(segment.start) }}</button></div><div class="segment-body"><label class="sr-only" :for="`segment-${segment.id}`">{{ t('第') }} {{ index + 1 }} {{ t('段逐字稿') }}</label><textarea :id="`segment-${segment.id}`" v-model="segment.text" rows="3" :disabled="aiBusy || recordingBusy" @input="invalidateStory" :placeholder="t('請輸入這一段原話…')"></textarea><div v-if="captionFor(segment)" class="demo-translation" lang="en"><span>English translation · fictional demo</span><p>{{ captionFor(segment) }}</p></div><div class="segment-details"><label>{{ t('開始') }}<input :value="segment.start === null ? '' : formatTime(segment.start)" :disabled="aiBusy || recordingBusy" :placeholder="t('分:秒')" :aria-label="isEnglish ? `Segment ${index + 1} start time` : `第 ${index + 1} 段開始時間`" @change="timeInput(segment, 'start', $event)" /></label><span>—</span><label>{{ t('結束') }}<input :value="segment.end === null ? '' : formatTime(segment.end)" :disabled="aiBusy || recordingBusy" :placeholder="t('選填')" :aria-label="isEnglish ? `Segment ${index + 1} end time` : `第 ${index + 1} 段結束時間`" @change="timeInput(segment, 'end', $event)" /></label><label class="speaker-field">{{ t('說話者') }}<input v-model="segment.speaker" :placeholder="t('選填')" :disabled="aiBusy || recordingBusy" :aria-label="isEnglish ? `Segment ${index + 1} speaker` : `第 ${index + 1} 段說話者`" @input="invalidateStory" /></label><button class="icon-button delete-segment" :disabled="aiBusy || recordingBusy" :aria-label="isEnglish ? `Delete segment ${index + 1}` : `刪除第 ${index + 1} 段`" @click="removeSegment(index)"><Trash2 :size="14" /></button></div></div></article><button class="add-segment" :disabled="aiBusy || recordingBusy" @click="addSegment"><Plus :size="15" /> {{ t('再加一段原話') }}</button></div><p v-if="!session.audio" class="quiet-note"><Headphones :size="14" /> {{ t('目前只有文字。沒有對應音檔的段落，不會提供原音播放。') }}</p><p v-if="hasUnsupportedTime" class="inline-error">{{ t('有段落的時間無效、未依序排列，或結束時間沒有晚於開始時間。請先修正。') }}</p><div v-if="hasTranscript" class="review-confirm"><label><input v-model="session.transcriptReviewed" type="checkbox" :disabled="aiBusy || hasUnsupportedTime" /><span><strong>{{ t('我已校對，這些文字與原話一致。') }}</strong><small>{{ t('人名、年代和記不清楚的地方，都已確認或保留不確定。') }}</small></span></label><div class="draft-actions"><button class="button button-primary" :disabled="!canDraft || aiBusy || recordingBusy || busy || hasUnsupportedTime" @click="createManualStory"><BookOpen :size="16" /> {{ t('整理成故事') }} <ArrowRight :size="14" /></button></div><p>{{ t('依對話順序保留原話，排成可以重聽的故事頁。標題、章節與下一個問題，都由你修改。') }}</p></div><div class="step-footer"><button class="text-button" :disabled="aiBusy || recordingBusy" @click="goToStep(1)"><ArrowLeft :size="15" /> {{ t('回到對話') }}</button><span>{{ canDraft ? t('每一段原話，都有自己的位置。') : t('校對完成後，勾選確認即可整理故事。') }}</span></div></section>

          <section v-else class="story-view"><template v-if="activeStory"><div class="story-toolbar"><span class="eyebrow">A PAGE FOR YOUR FAMILY</span><div><button class="text-button" @click="goToStep(2)"><FileText :size="14" /> {{ t('回到原話') }}</button><button class="button button-outline button-small" :disabled="busy" @click="downloadArchive"><Download :size="15" /> {{ t('匯出記憶包') }}</button></div></div><article class="story-paper"><div class="story-paper-top"><span>{{ t('家 聲') }}<span>FAMILY ARCHIVE</span></span><span>{{ dateLabel(session.createdAt) }}<br />{{ isDemo ? 'FICTIONAL DEMO' : 'A VOICE TO REMEMBER' }}</span></div><div v-if="isDemo && isEnglish" class="demo-english-overview" lang="en"><span>THE DEMO, IN ENGLISH</span><h2>The first paycheck. A radio sent home.</h2><p>A fictional father remembers leaving home, buying a radio for his dad, and the question that mattered most: “Are you eating enough?”</p><small>The original Mandarin text and synthetic audio are preserved below. English captions translate this fictional script; no live translation model runs.</small></div><div class="story-title-block"><span class="story-person">{{ firstName }}{{ t('的故事') }} <span>／</span> {{ session.relationship || t('我們的記憶') }}</span><label class="sr-only" for="story-title">{{ t('故事標題') }}</label><textarea id="story-title" v-model="activeStory.title" class="story-title-input" rows="2" maxlength="120" :aria-label="t('故事標題')"></textarea><label class="sr-only" for="story-subtitle">{{ t('故事副標') }}</label><input id="story-subtitle" v-model="activeStory.subtitle" class="story-subtitle-input" :placeholder="t('為這段故事留下一句介紹')" maxlength="250" /><div class="story-byline"><span>{{ session.segments.length }} {{ t('段原話') }}</span><span v-if="session.duration">{{ formatTime(session.duration) }} {{ t('聲音記憶') }}</span><span>{{ session.transcriptReviewed ? t('已人工校對') : t('待人工確認') }}</span></div></div><figure v-if="photoUrl" class="story-photo"><img :src="photoUrl" :alt="t('這段故事的記憶照片')" /><figcaption>{{ isDemo ? t('示例插畫，用於呈現記憶頁樣貌') : session.photoName || t('這段記憶的照片') }}</figcaption></figure><div v-else class="story-no-photo"><AudioLines :size="32" :stroke-width="1.2" /><span>{{ t('聲音，也是時間的照片。') }}</span></div><div v-if="excerpt" class="story-pullquote"><Quote :size="27" :stroke-width="1.1" /><p>{{ excerpt.text }}</p><div v-if="captionFor(excerpt)" class="demo-translation" lang="en"><span>English translation · fictional demo</span><p>{{ captionFor(excerpt) }}</p></div><button class="source-play" :disabled="!timePlayable(excerpt)" @click="seek(excerpt)"><Play :size="12" fill="currentColor" /> {{ timePlayable(excerpt) ? (isEnglish ? `Hear the original · ${formatTime(excerpt.start)}` : `聽這句原話 · ${formatTime(excerpt.start)}`) : t('只有文字，沒有對應原音') }}</button></div><section v-for="(chapter, index) in activeStory.chapters" :key="chapter.id" class="story-chapter"><div class="chapter-heading"><span>{{ String(index + 1).padStart(2, '0') }}</span><input v-model="chapter.title" :aria-label="isEnglish ? `Chapter ${index + 1} title` : `第 ${index + 1} 章標題`" maxlength="100" /></div><div v-for="segment in chapterSegments(chapter)" :key="segment.id" class="story-quote" :class="{ 'is-playing': isCurrentSegment(segment) }"><p>{{ segment.text }}</p><div v-if="captionFor(segment)" class="demo-translation" lang="en"><span>English translation · fictional demo</span><p>{{ captionFor(segment) }}</p></div><button class="source-play" :disabled="!timePlayable(segment)" @click="seek(segment)" :aria-label="(isEnglish ? `Play original ${segment.start !== null ? formatTime(segment.start) : ''}` : `播放原話 ${segment.start !== null ? formatTime(segment.start) : ''}`)"><AudioLines :size="14" />{{ segment.start !== null ? formatTime(segment.start) : t('原文') }}<span v-if="segment.speaker"> · {{ segment.speaker }}</span></button></div></section><section class="next-conversation"><span class="eyebrow">THE STORY CONTINUES</span><h3>{{ t('下次，我還想問你…') }}</h3><textarea v-model="activeStory.nextQuestion" rows="3" maxlength="400" :aria-label="t('下一次對話的問題')"></textarea><span>{{ t('把這個問題留著，下次再坐下來聊。') }}</span></section><footer class="story-end"><span class="brand-mark small"><AudioLines :size="17" /></span><p>{{ t('家聲 · 把平凡的對話，留給以後的自己。') }}</p><span>{{ isDemo ? t('虛構示例・合成語音') : t('為這個家，留一份記憶。') }}</span></footer></article><div class="story-disclosure"><ShieldCheck :size="16" /><p><strong>{{ isDemo ? t('示例人工編排') : t('原話記憶頁') }}</strong><br /> {{ t('標題、章節與下一個問題可以修改。內文直接引用已匯入的逐字稿；修改原話請回到校對。') }}</p></div><div class="story-final-actions"><div><h3>{{ t('替這段記憶，找一個安心的位置。') }}</h3><p>{{ t('儲存到瀏覽器，也匯出一份放在自己的硬碟裡。') }}</p></div><button class="button button-primary" :disabled="busy" @click="save"><Check :size="16" /> {{ t('儲存這頁故事') }}</button></div></template><div v-else class="empty-transcript"><BookOpen :size="38" /><h2>{{ t('故事還在路上。') }}</h2><p>{{ t('先確認逐字稿，就能把原話整理成一頁故事。') }}</p><button class="button button-primary" @click="goToStep(2)">{{ t('回到校對') }} <ArrowRight :size="16" /></button></div></section>
        </div>

        <div v-if="audioUrl" class="audio-dock"><button class="dock-play" :disabled="recordingBusy" @click="togglePlayback" :aria-label="isPlaying ? t('暫停對話') : t('播放對話')"><Pause v-if="isPlaying" :size="17" fill="currentColor" /><Play v-else :size="17" fill="currentColor" /></button><div class="dock-title"><strong>{{ isDemo ? t('示例合成語音') : (isEnglish ? `${firstName}’s voice` : `${firstName}的聲音`) }}</strong><span>{{ formatTime(currentTime) }} <span>/</span> {{ session.duration ? formatTime(session.duration) : '—' }}</span></div><audio ref="audioElement" :src="audioUrl" :controls="!recordingBusy" preload="metadata" @loadedmetadata="onAudioMetadata" @timeupdate="currentTime = audioElement?.currentTime || 0" @play="onAudioPlay" @pause="isPlaying = false" @ended="isPlaying = false" @error="error = t('這個音檔無法在瀏覽器播放。請確認格式，或換成 MP3 / WAV 音檔。')"></audio><span class="dock-local"><ShieldCheck :size="14" /> {{ t('本機音檔') }}</span></div>
      </template>
    </main>

    <div v-if="transcriptOpen" class="modal-backdrop" @click.self="transcriptOpen = false"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="transcript-modal-title"><button class="modal-close icon-button" @click="transcriptOpen = false" :aria-label="t('關閉逐字稿視窗')"><X :size="20" /></button><span class="eyebrow">BRING YOUR OWN WORDS</span><h2 id="transcript-modal-title">{{ t('貼上你們的對話') }}</h2><p>{{ t('每一段另起一行。若有音檔，加入時間就能跳回原音；沒有時間也可以先保存文字。') }}</p><label class="field"><span class="sr-only">{{ t('逐字稿內容') }}</span><textarea v-model="transcriptText" rows="9" :placeholder="t('[00:00] 那時候，我每天騎腳踏車去上班。\n[00:12] 路上會經過一家早餐店，老闆總是先幫我留一份。\n\n沒有時間的文字也可以直接貼上。')"></textarea></label><p v-if="error" class="inline-error" role="alert">{{ t(error) }}</p><div class="modal-footnote"><span>{{ transcriptText.length }} {{ t('/ 6,000 字') }}</span><span>{{ t('原有內容將被取代') }}</span></div><div class="modal-actions"><button class="button button-outline" @click="transcriptOpen = false">{{ t('取消') }}</button><button class="button button-primary" :disabled="!transcriptText.trim() || transcriptText.length > 6000 || recordingBusy || aiBusy" @click="importTranscript">{{ t('匯入並校對') }} <ArrowRight :size="15" /></button></div></section></div>
    <div v-if="pendingAi" class="modal-backdrop" @click.self="pendingAi = false"><section class="modal model-modal" role="dialog" aria-modal="true" aria-labelledby="model-modal-title"><button class="modal-close icon-button" @click="pendingAi = false" :aria-label="t('關閉模型下載視窗')"><X :size="20" /></button><span class="model-symbol"><Sparkles :size="28" :stroke-width="1.3" /></span><span class="eyebrow">OPEN MODELS, ON YOUR DEVICE</span><h2 id="model-modal-title">{{ t('先把小幫手，請進這台裝置。') }}</h2><p>{{ t('家聲使用開放語音模型 Whisper base，在瀏覽器內辨識華語並轉成逐字稿。第一次需要連網下載模型與執行環境，約') }} <strong>100 MB</strong>{{ t('；之後可重用瀏覽器快取。') }}</p><div class="model-facts"><span><ShieldCheck :size="17" /> {{ t('對話內容在本機處理，不傳送給模型服務') }}</span><span><Download :size="17" /> {{ t('建議使用電腦與穩定 Wi-Fi，初次載入需等候') }}</span><span><FileText :size="17" /> {{ t('語音辨識可能出錯，人名與日期需要你校對') }}</span></div><p class="quiet-note">{{ t('也可以直接貼上或手動輸入逐字稿，再按「整理成故事」，不需要下載模型。') }}</p><div class="modal-actions"><button class="button button-outline" @click="pendingAi = false">{{ t('先手動整理') }}</button><button class="button button-primary" @click="confirmModel">{{ t('下載並開始') }} <ArrowRight :size="15" /></button></div></section></div>
    <div v-if="showGuide" class="modal-backdrop" @click.self="showGuide = false"><section class="modal guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title"><button class="modal-close icon-button" @click="showGuide = false" :aria-label="t('關閉家聲說明')"><X :size="20" /></button><span class="eyebrow">A SMALL HOME FOR YOUR MEMORIES</span><h2 id="guide-title">{{ t('記憶，是你們的。') }}</h2><p>{{ t('家聲把一次短對話整理成可聽原音的故事。第一版適合 10 分鐘內音檔、6,000 字內逐字稿。') }}</p><h3>{{ t('儲存在這個瀏覽器') }}</h3><p>{{ t('按下儲存後，照片、音檔與文字存放在瀏覽器資料庫。其他裝置看不到；清除網站資料或使用無痕模式，可能讓記憶消失。') }}</p><h3>{{ t('請帶走一份備份') }}</h3><p>{{ t('「匯出記憶包」會打包原音、照片、文字與可離線閱讀的故事頁。解壓縮後即可自行保存，也可以親自交給家人。') }}</p><h3>{{ t('AI 協助聽寫，原話由你確認') }}</h3><p>{{ t('Whisper base 語音模型需要下載，在你的瀏覽器中辨識華語。人名、時間和每一段原話都由你校對。開場問題由人工提供，故事依原話順序排列；標題和下一個問題可自行編輯。示例是虛構文字與合成語音。') }}</p><div class="modal-actions"><button class="button button-primary" @click="showGuide = false">{{ t('知道了') }} <Check :size="15" /></button></div></section></div>
  </div>
</template>

<script lang="ts">
import { h } from 'vue';
const ClockMini = { render: () => h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'aria-hidden': true }, [h('circle', { cx: 12, cy: 12, r: 9 }), h('path', { d: 'M12 7v5l3 2' })]) };
</script>
