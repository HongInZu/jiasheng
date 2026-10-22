async (page) => {
  await page.getByRole('textbox',{name:'第 1 段逐字稿',exact:true}).waitFor({timeout:120000});
  const text=await page.locator('.segment-body > textarea').evaluateAll(elements=>elements.map(e=>e.value));
  const reviewed=await page.getByRole('checkbox').isChecked();
  const disabled=await page.getByRole('button',{name:'整理成故事',exact:true}).isDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'整理成故事',exact:true}).click();
  await page.getByRole('textbox',{name:'故事標題',exact:true}).waitFor();
  const quotes=await page.locator('.story-quote > p').allTextContents();
  await page.getByRole('button',{name:'儲存這頁故事',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.save-state')?.textContent.includes('已儲存'));
  return {finishedAt:new Date().toISOString(),passages:text,reviewedBeforeConfirmation:reviewed,storyDisabledBeforeReview:disabled,sourceQuotesPreserved:JSON.stringify(text)===JSON.stringify(quotes),sourceLabel:await page.locator('.story-disclosure').innerText(),errors:await page.getByRole('alert').allTextContents()};
}