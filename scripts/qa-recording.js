async (page) => {
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'留下一段記憶',exact:true}).click();
  await page.getByRole('textbox',{name:'怎麼稱呼這位家人',exact:true}).fill('測試合成音');
  await page.getByRole('textbox',{name:'從哪一件事聊起？',exact:true}).fill('錄音流程測試');
  await page.getByRole('button',{name:'開始對話',exact:true}).click();
  await page.getByRole('checkbox').check();
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Synthetic permission rejection','NotAllowedError')}});
  await page.getByRole('button',{name:'開始錄音',exact:true}).click();
  const denied=await page.getByRole('alert').innerText();
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{
    const ctx=new AudioContext(); const oscillator=ctx.createOscillator();
    const destination=ctx.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start();
    window.qaAudioContext=ctx; window.qaStream=destination.stream; window.qaAllowMic=()=>resolve(destination.stream);
  })});
  await page.getByRole('button',{name:'開始錄音',exact:true}).click();
  const pendingBlocked={paste:await page.getByRole('button',{name:'貼上逐字稿',exact:true}).isDisabled(),file:await page.locator('input[type=file]').isDisabled()};
  await page.evaluate(()=>window.qaAllowMic());
  await page.getByRole('button',{name:'結束錄音',exact:true}).waitFor();
  await page.waitForTimeout(1800);
  await page.getByRole('button',{name:'結束錄音',exact:true}).click();
  await page.getByRole('button',{name:'重新錄一段',exact:true}).waitFor();
  const tracksStopped=await page.evaluate(()=>window.qaStream.getTracks().every(t=>t.readyState==='ended'));
  await page.getByRole('button',{name:'儲存',exact:true}).click();
  await page.getByRole('button',{name:'儲存',exact:true}).isEnabled();
  const records=await page.evaluate(async()=>{
    const {listSessions}=await import('/src/storage.ts');
    return (await listSessions()).filter(s=>s.person==='測試合成音').map(s=>({duration:s.duration,audioBytes:s.audio?.size,audioType:s.audio?.type,sourceKind:s.sourceKind}));
  });
  await page.evaluate(()=>window.qaAudioContext.close());
  return {denied,pendingBlocked,tracksStopped,records};
}