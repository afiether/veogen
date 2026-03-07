const puppeteer = require('puppeteer');
const PuppeteerVideoRecorder = require('puppeteer-video-recorder');
// const { executablePath } = require('puppeteer')
// const { launch, getStream } = require("puppeteer-stream");
// const fs = require("fs");

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    headless: true,
    // ignoreDefaultArgs: [
    //     "--mute-audio",
    // ],
    args: [
        "--autoplay-policy=no-user-gesture-required",
    ],
  });
  // const browser = await launch({
  //   defaultViewport: {
  //     width: 1920,
  //     height: 1080,
  //   },
  //   executablePath: executablePath(),
  //   args: ['--no-sandbox',],
  //   headless: false,
  //   ignoreHTTPSErrors: true,
  // });
  const page = await browser.newPage();

  // Set screen size
  // await page.setViewport({width: 1920, height: 1080});
  // await page.setViewport({width: 1080, height: 1920});
  await page.setViewport({width: 1080, height: 1080});

  // Navigate the page to a URL
  // await page.goto('file:///home/afivan/Documents/afiether/intro-html/intro.html', {
  // await page.goto('file:///home/afivan/Documents/afiether/story-html/story.html', {
  await page.goto('file:///home/afivan/Documents/afiether/post-html/post.html', {
    waitUntil: 'networkidle2',
  });

  // const file = fs.createWriteStream(__dirname + "/test.webm");

  const recorder = new PuppeteerVideoRecorder();

  await recorder.init(page, __dirname + '/video/');


  // Type into search box
  // await page.type('.devsite-search-field', 'automate beyond recorder');

  // // Wait and click on first result
  // const searchResultSelector = '.devsite-result-item-link';
  // await page.waitForSelector(searchResultSelector);
  // await page.click(searchResultSelector);

  // // Locate the full title with a unique string
  // const textSelector = await page.waitForSelector(
  //   'text/Customize and automate'
  // );
  // const fullTitle = await textSelector?.evaluate(el => el.textContent);

  //await recorder.start();
  // const stream = await getStream(page, { audio: true, video: true });

  // stream.pipe(file);
  // setTimeout(async () => {
  //   await stream.destroy();
  //   file.close();
  //   console.log("finished");
  // }, 1000 * 15);

  // stream.pipe(file);

  //await sleep(15000);

  await page.screenshot({path: 'coinbase-support-post.png', fullPage: false});

  // await stream.destroy();
  // file.close();

  //await recorder.stop();

  // Print the full title
  // console.log('The title of this blog post is "%s".', fullTitle);

  await browser.close();
})();