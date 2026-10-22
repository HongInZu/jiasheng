export interface Segment { id:string; start:number|null; end:number|null; text:string; speaker?:string }
export interface Chapter { id:string; title:string; segmentIds:string[] }
export interface Story { title:string; subtitle:string; chapters:Chapter[]; nextQuestion:string; anchorSegmentId?:string; generatedBy:string; createdAt:string; durationMs?:number }
export interface MemorySession {
 id:string; title:string; person:string; relationship:string; topic:string; context:string;
 photo?:Blob; photoName?:string; audio?:Blob; audioName?:string; duration?:number;
 segments:Segment[]; story?:Story; createdAt:string; updatedAt:string;
 consent:boolean; transcriptReviewed:boolean; sourceKind:'recorded'|'uploaded'|'text'|'demo'; sourceNote?:string;
 questions?:string[]; questionModel?:string; transcriptModel?:string; transcriptDurationMs?:number;
}
export interface AiProgress { stage:string; progress?:number; detail?:string }
export type ProgressCallback=(progress:AiProgress)=>void;
export interface QuestionInput { person:string; relationship:string; topic:string; context:string }
export interface DraftInput { person:string; topic:string; segments:Segment[] }
