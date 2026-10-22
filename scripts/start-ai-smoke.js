async (page) => {
  await page.evaluate(async () => {
    const {runAiEvaluation}=await import('/scripts/evaluate-ai.js');
    window.aiSmokeDone=false;
    runAiEvaluation(value => {
      window.aiSmokeProgress=value;
      document.querySelector('#status').textContent=JSON.stringify(value,null,2);
    }, '/demo-story.mp3').then(value=>{
      window.aiSmokeResult=value;
      window.aiSmokeDone=true;
    });
  });
}
