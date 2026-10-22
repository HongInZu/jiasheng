async (page) => {
  await page.goto('http://127.0.0.1:5186/');
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'開始第一段記憶',exact:true}).click();
  await page.getByRole('textbox',{name:'怎麼稱呼這位家人',exact:true}).fill('合成語音實測');
  await page.getByRole('button',{name:'第一份工作',exact:true}).click();
  const preset=await page.getByRole('textbox',{name:'開場問題 1',exact:true}).inputValue();
  await page.getByRole('button',{name:'換一組開場',exact:true}).click();
  const nextTopic=await page.getByRole('textbox',{name:'從哪一件事聊起？',exact:true}).inputValue();
  await page.getByRole('textbox',{name:'從哪一件事聊起？',exact:true}).fill('正式包轉寫測試');
  await page.getByRole('button',{name:'開始對話',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles('public/demo-story.mp3');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'轉成逐字稿',exact:true}).click();
  const modelNotice=await page.getByRole('dialog').innerText();
  await page.getByRole('button',{name:'下載並開始',exact:true}).click();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.locator('.ai-progress').waitFor({state:'hidden'});
  const cancelled=await page.locator('body').innerText();
  await page.getByRole('button',{name:'轉成逐字稿',exact:true}).click();
  return {preset,nextTopic,modelNotice,cancelled:cancelled.includes('已取消轉寫'),startedAt:new Date().toISOString()};
}