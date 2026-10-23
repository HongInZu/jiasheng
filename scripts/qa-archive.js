async (page) => {
  // Open the extracted archive's story.html file before running this snippet.
  // Reuse that file URL so the check works from any checkout or extraction path.
  const archiveUrl = page.url();
  if (!archiveUrl.startsWith('file:') || !new URL(archiveUrl).pathname.endsWith('/story.html')) {
    throw new Error('Open the extracted story.html with a file:// URL, then run scripts/qa-archive.js.');
  }
  const archive=await page.context().newPage();
  try {
    await archive.goto(archiveUrl);
    await archive.locator('button[data-start]').filter({hasText:'00:29'}).click();
    await archive.waitForFunction(()=>{const a=document.querySelector('audio');return a && !a.paused && a.currentTime>=29});
    return await archive.locator('audio').evaluate(a=>({currentTime:a.currentTime,duration:a.duration,paused:a.paused}));
  } finally {
    await archive.close();
  }
}
