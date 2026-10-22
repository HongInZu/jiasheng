async (page) => {
  const target = page.context().pages().find(p=>p.url().endsWith('/scripts/evaluate.html'));
  await target.reload();
  await target.evaluate(async () => {
    const {runAiEvaluation}=await import('/scripts/evaluate-ai.js');
    window.aiSmokeDone=false;
    runAiEvaluation(value => {
      window.aiSmokeProgress=value;
      document.querySelector('#status').textContent=JSON.stringify(value,null,2);
    }, '/demo-story.mp3', { diagnostics:true, only:['audio-transcript'] }).then(value=>{
      window.aiSmokeResult=value;
      window.aiSmokeDone=true;
    });
  });
}
