import type { MemorySession } from './types';
import { createSession } from './domain';

export async function createDemoSession(): Promise<MemorySession> {
  const response = await fetch(`${import.meta.env.BASE_URL}demo-story.mp3`);
  if (!response.ok) throw new Error('示例音檔未載入，請稍後再試。');
  const audio = await response.blob();
  const now = new Date().toISOString();
  return createSession({
    title: '第一份薪水，寄回家的收音機', person: '爸爸（虛構角色）', relationship: '父親',
    topic: '第一份薪水', context: '這是一段為產品示範創作的虛構故事，音檔為合成語音，不是使用者的家人或真實訪談。',
    sourceKind: 'demo', sourceNote: '虛構示例・合成語音。文字由示範腳本整理；時間來自語音供應商的字詞對齊。此示例不代表轉寫或 AI 整理的準確率。',
    audio, audioName: 'fictional-story-synthetic-voice.mp3', duration: 50,
    consent: false, transcriptReviewed: true,
    questions: ['還記得第一次離開家工作的情景嗎？', '第一次領到薪水，你做了什麼？', '現在想起那件事，最記得的是什麼？'],
    questionModel: '示範問題（人工編寫）', transcriptModel: '示範腳本＋供應商字詞對齊（非模型轉寫結果）',
    segments: [
      {id:'demo-1',start:0,end:15.36,speaker:'爸爸（虛構角色）',text:'我第一次離開家去工作，大概是二十歲那一年。確切是哪一年，我真的記不清了。那時候坐了很久的火車，行李裡只有兩套衣服，還有你阿嬤塞給我的飯糰。'},
      {id:'demo-2',start:16.92,end:27.92,speaker:'爸爸（虛構角色）',text:'第一次領到薪水，我沒有先買自己的東西。我去買了一台小小的收音機，寄回家給你阿公。他每天傍晚都會坐在門口聽廣播。'},
      {id:'demo-3',start:29.12,end:39.8,speaker:'爸爸（虛構角色）',text:'後來那台收音機壞了，他也捨不得丟。很多年以後我才知道，他在背面貼了一張紙，上面寫著，兒子第一份薪水。'},
      {id:'demo-4',start:40.96,end:50.08,speaker:'爸爸（虛構角色）',text:'我一直記得的，其實不是那筆錢。是他收到包裹以後，打電話來，只說了一句，你在外面有沒有吃飽。'},
    ],
    story: {title:'第一份薪水，寄回家的收音機',subtitle:'有些心意，藏在一句平常的問候裡。',
      chapters:[
        {id:'demo-c1',title:'離家的那一年，記不清了',segmentIds:['demo-1']},
        {id:'demo-c2',title:'一台寄回家的收音機',segmentIds:['demo-2','demo-3']},
        {id:'demo-c3',title:'你在外面，有沒有吃飽？',segmentIds:['demo-4']},
      ],nextQuestion:'你提到阿公每天傍晚都在門口聽廣播。他喜歡聽什麼節目？',anchorSegmentId:'demo-2',
      generatedBy:'示例手工編排（未執行 AI）',createdAt:now},
    createdAt:now,updatedAt:now,
  });
}
