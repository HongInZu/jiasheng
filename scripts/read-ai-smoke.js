async (page) => {
  const harness=page.context().pages().find(p=>p.url().endsWith('/scripts/evaluate.html'));
  return await harness.evaluate(()=>({done:window.aiSmokeDone,result:window.aiSmokeResult,progress:window.aiSmokeProgress}));
}
