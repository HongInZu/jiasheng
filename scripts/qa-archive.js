async (page) => {
  const archive=await page.context().newPage();
  await archive.goto('file:///Users/hongyingzu/Documents/SideProject/Project/獎金專案/jiasheng/output/playwright/archive/story.html');
  await archive.getByRole('button',{name:'聽原聲 · 00:29',exact:true}).click();
  await archive.waitForFunction(()=>{const a=document.querySelector('audio');return a && !a.paused && a.currentTime>=29});
  const result=await archive.locator('audio').evaluate(a=>({currentTime:a.currentTime,duration:a.duration,paused:a.paused}));
  await archive.close();
  return result;
}