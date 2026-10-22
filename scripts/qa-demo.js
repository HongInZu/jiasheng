async (page) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.getByRole('button',{name:'播放原話 00:29',exact:true}).click();
  await page.waitForFunction(()=>{const a=document.querySelector('audio');return a && !a.paused && a.currentTime>=29});
  const playback = await page.locator('audio').evaluate(a=>({currentTime:a.currentTime,duration:a.duration,paused:a.paused}));
  await page.locator('audio').evaluate(a=>a.pause());
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'匯出記憶包',exact:true}).click();
  const download=await downloadPromise;
  await download.saveAs('output/playwright/jiasheng-demo.zip');
  await page.getByRole('button',{name:'儲存這頁故事',exact:true}).click();
  await page.getByText('故事已儲存在這個瀏覽器。',{exact:true}).waitFor({timeout:5000}).catch(()=>{});
  await page.screenshot({path:'output/playwright/story-desktop.png',fullPage:true});
  await page.reload();
  return {playback, download:download.suggestedFilename(),errors,body:await page.locator('body').innerText()};
}