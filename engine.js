const puppeteer = require('puppeteer');
const PuppeteerVideoRecorder = require('puppeteer-video-recorder');
// const { launch, getStream, wss } = require('puppeteer-stream');
const { capture, launch } = require('puppeteer-capture')
const path = require('path');
const { convertWebMToMP4 } = require('./veogen/modules/ffmpeg');
const fs = require('fs');
const { spawn } = require("child_process");

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getPort() {
  return process.env.PORT || 7534;
}

function getFormattedDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-based
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');

  const formattedDate = `${year}-${month}-${day} ${hour}:${minute}:${second}`;

  return formattedDate;
}

async function renderPage(url, data, filePath) {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    headless: true,
    // ignoreDefaultArgs: [
    //     "--mute-audio",
    // ],
    args: [
        "--autoplay-policy=no-user-gesture-required",
        "--no-sandbox",
    ],
  });

  const page = await browser.newPage();
  // In principle we only care about the iframe content which is resized in the page accordingly
  // await page.setViewport({ width, height });

  console.log('Loading page')

  await page.goto(`http://localhost:${getPort()}/`, {
    waitUntil: 'networkidle2',
  });

  // Fill the form fields
  await page.type('#endpoint', url);
  const stringifiedData = JSON.stringify(data);
  await page.$eval('#jsonInput', (el, value) => el.value = value, stringifiedData);

  // This has a problem with large data
  // await page.type('#jsonInput', stringifiedData);

  await page.click('#submit');

  // Find the element by its ID
  const elementHandle = await page.$('#responseFrame');

  // await page.waitForSelector('#responseFrame[data-loaded]', { timeout: 5000 });
  try {
    await page.waitForSelector('#submit[data-loaded]', { timeout: 5000 });
  } catch {
    console.error('Could not wait for data to be loaded, screenshotting like this!')
  }

  await elementHandle.screenshot({ path: filePath });

  await browser.close();
}

async function renderVideoPage(url, data, filePath) {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    headless: true,
    // ignoreDefaultArgs: [
    //     "--mute-audio",
    // ],
    args: [
        "--autoplay-policy=no-user-gesture-required",
        "--no-sandbox",
        '--enable-gpu',
        '--disable-background-timer-throttling',
        '--disable-dev-shm-usage',
        // if you have VA‑API hardware decode support:
        '--enable-features=VaapiVideoDecoder'
    ],
    
  });

  const page = await browser.newPage();
  // In principle we only care about the iframe content which is resized in the page accordingly
  // await page.setViewport({ width, height });

  console.log('Loading page')

  await page.setViewport({width: (data.renderWidth || 3840), height: (data.renderHeight || 2160)});
  await page.goto(`http://localhost:${getPort()}/veogenRaw/base?data=${encodeURIComponent(JSON.stringify(data))}`, {
    waitUntil: 'networkidle2',
  });

  try {
    await page.waitForSelector('#page-loaded[data-loaded]', { timeout: 5000 });
  } catch {
    console.error('Could not wait for data to be loaded, screenshotting like this!');
  }

  // ensure page is active
  await page.bringToFront();
  await page.evaluate(() => window.focus());

  const webMFilePath = `${path.dirname(filePath)}/${path.basename(filePath)}.gif`;

  const recorder = await page.screencast({
    path: webMFilePath,
    // Only webm works
    format: "gif",
    // crop: {
    //   x: Math.floor(box.x),
    //   y: Math.floor(box.y),
    //   width: Math.floor(box.width),
    //   height: Math.floor(box.height),
    // },
    fps: 30,

    // quality:10,
  });

  await page.waitForSelector('#animations-finished[data-animations-finished]', { timeout: 16000 }).catch(() => {
    console.error('Animations did not finish in time, stopping recording like this!')
  });

  // await sleep(5000);

  // Stop recording.
  await recorder.stop();

  await browser.close();

  // Convert webm to mp4 using ffmpeg
  await convertWebMToMP4(webMFilePath, filePath);

  // Delete the webm file
  // await fs.promises.unlink(webMFilePath);
}

// alternative implementation using puppeteer-stream instead of screencast
async function renderVideoStreamPage(url, data, filePath) {
  console.log('Executable path for puppeteer: ', puppeteer.executablePath());

  const streamExt = path.join(
    __dirname,
    "node_modules",
    "puppeteer-stream",
    "extension"
  );

  const extensionId = require(path.join(streamExt, "manifest.json")).key;
  console.log('Expected extension ID: ', extensionId);

  const manualExtensionId = 'jjndjgheafjngoipoacpjgeicjeomjli';

  const browser = await launch({
    executablePath: puppeteer.executablePath(),
    // executablePath: '/usr/bin/google-chrome-stable',
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      '--enable-gpu',
      '--enable-features=VaapiVideoDecoder',
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
      "--disable-web-security",
      "--disable-service-worker",
      // `--disable-extensions-except=${streamExt}`,
      `--load-extension=${streamExt}`,
      // `--whitelisted-extension-id=${extensionId}`,
      `--whitelisted-extension-id=${manualExtensionId}`,
    ],
    defaultViewport: {
      // width: data.renderWidth || 3840,
      // height: (data.renderHeight || 2160) + 400
      width: data.renderWidth || 3840,
      height: (data.renderHeight || 2160)
    },
    // extensionPath: streamExt,
    // pipe: true,
    // enableExtensions: true,
    // startDelay: 4000
  });


  const page = await browser.newPage();
  // const pages = await browser.pages();
  
  // const page = pages[1];
  // console.log((await browser.pages()).map(p => p.url()));

  console.log('Loading page (stream)');

  await page.setViewport({
    // width: (data.renderWidth || 3840),
    // height: (data.renderHeight || 2160) + 400
    width: (data.renderWidth || 3840),
    height: (data.renderHeight || 2160)
  });

  // await page.goto(`http://localhost:${getPort()}/`, {
  //   waitUntil: 'networkidle2',
  // });

  // Todo page instead of url
  await page.goto(`http://localhost:${getPort()}/veogenRaw/base?data=${encodeURIComponent(JSON.stringify(data))}`, {
    waitUntil: 'networkidle2',
  });

  // const html = await fetch(`http://localhost:${getPort()}${url}`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(data)
  // }).then(r => r.text());

  // await page.setContent(html);

  // await page.setContent(`
  //   <form id="f" method="POST" action="http://localhost:${getPort()}${url}">
  //     <input type="hidden" name="payload" value='${JSON.stringify(data)}'>
  //   </form>
  //   <script>document.getElementById("f").submit()</script>
  // `);


  // await page.type('#endpoint', url);

  // const stringifiedData = JSON.stringify(data);
  // await page.$eval('#jsonInput', (el, value) => el.value = value, stringifiedData);

  // await page.click('#submit');

  // const elementHandle = await page.$('#responseFrame');
  // const elementHandle = await page.$('body');

  try {
    // await page.waitForSelector('#submit[data-loaded]', { timeout: 5000 });
    await page.waitForSelector('#page-loaded[data-loaded]', { timeout: 5000 });
  } catch {
    console.error('Could not wait for data to be loaded, screenshotting like this!');
  }

  // await elementHandle.scrollIntoView();

  // const box = await elementHandle.boundingBox();
  // if (!box) throw new Error("Element not visible");

  const webMFilePath = `${path.dirname(filePath)}/${path.basename(filePath)}.webm`;

  // ensure page is active
  await page.bringToFront();
  await page.evaluate(() => window.focus());

  // allow layout to stabilize before recording
  // await new Promise(r => setTimeout(r, 500));
  // console.log(await page.title());
  // console.log(page.url())
  // console.log(await page.evaluate(() => document.body.innerHTML));
  // await sleep(10000);

  console.log('Starting recording');

  const stream = await getStream(page, {
    audio: true,
    video: true,
    fps: 30,
    // mimeType: 'video/webm;codecs=vp9,opus',
    // crop: {
    //   x: Math.round(box.x),
    //   y: Math.round(box.y),
    //   width: Math.round(box.width),
    //   height: Math.round(box.height),
    // }
  });

  console.log('Got the stream, waiting for animations to finish');

  await sleep(5000);

  const out = fs.createWriteStream(webMFilePath);

  // pipe stream
  stream.pipe(out);

  // const frame = await elementHandle.contentFrame();

  await page.waitForSelector(
    '#animations-finished[data-animations-finished]',
    { timeout: 16000 }
  ).catch(() => {
    console.error('Animations did not finish in time, stopping stream!');
  });

  // stop recording properly
  stream.destroy();
  out.end();

  await new Promise(resolve => out.on("finish", resolve));

  await browser.close();
  (await wss).close();

  // convert to mp4
  await convertWebMToMP4(webMFilePath, filePath);

  await fs.promises.unlink(webMFilePath);
}

// record by grabbing raw screenshots and piping to ffmpeg
async function renderVideoScreenshotPage(url, data, filePath) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
        "--autoplay-policy=no-user-gesture-required",
        "--no-sandbox",
        '--enable-gpu',
        '--disable-background-timer-throttling',
        '--disable-dev-shm-usage',
        '--enable-features=VaapiVideoDecoder'
    ],    
  });

  const page = await browser.newPage();
  console.log('Loading page (screenshot loop)');
  // await page.setViewport({width: (data.renderWidth || 3840), height: (data.renderHeight || 2160) + 400});
  await page.goto(`http://localhost:${getPort()}/`, { waitUntil: 'networkidle2' });

  await page.type('#endpoint', url);
  const stringifiedData = JSON.stringify(data);
  await page.$eval('#jsonInput', (el, value) => el.value = value, stringifiedData);
  await page.click('#submit');

  const elementHandle = await page.$('#responseFrame');
  try {
    await page.waitForSelector('#submit[data-loaded]', { timeout: 5000 });
  } catch {
    console.error('Could not wait for data to be loaded, screenshotting like this!');
  }

  await elementHandle.scrollIntoView();
  const box = await elementHandle.boundingBox();
  if (!box) throw new Error("Element not visible");

  // prepare ffmpeg child process
  const fps = data.fps || 30;
  console.log(`Starting screenshot loop with target fps: ${fps}`);
  // use -framerate for the input pipe and also force output rate to match
  const ff = require('child_process').spawn('ffmpeg', [
    '-y',
    '-f', 'mjpeg',
    '-framerate', String(fps),
    // '-f', 'image2pipe',
    '-i', '-',
    //  '-vf', `fps=${fps}`,
    // '-vf', `setpts=N/(${fps}*TB)`,
    // '-r', String(fps),
    // '-vsync', 'cfr',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', 'faststart',
    filePath
  ]);
  ff.stderr.pipe(process.stderr);

  // capture loop until animations finished
  const frameInterval = 1000 / fps;
  const frame = await elementHandle.contentFrame();
  let animationsDone = false;
  frame.waitForSelector('#animations-finished[data-animations-finished]', { timeout: 16000 })
    .then(() => { animationsDone = true; })
    .catch(() => console.error('Animations did not finish in time, stopping screenshot loop!'));

  while (!animationsDone) {
    const buf = await elementHandle.screenshot({
      // clip: {
      //   x: Math.floor(box.x),
      //   y: Math.floor(box.y),
      //   width: Math.floor(box.width),
      //   height: Math.floor(box.height)
      // },
      type: 'jpeg',
      quality: 80,
      captureBeyondViewport: true,
      optimizeForSpeed: true,

    });
    ff.stdin.write(buf);
    // await sleep(frameInterval);
    // await sleep(10);
    // await page.waitForTimeout(frameInterval);
  }

  ff.stdin.end();
  await new Promise(resolve => ff.on('close', resolve));

  await browser.close();
}

// record by using puppeteer-capture package
async function renderVideoCapturePage(url, data, filePath) {
  // console.log('Executable path for puppeteer: ', puppeteer.executablePath());
  const browser = await launch({
    // executablePath: puppeteer.executablePath(),
    executablePath: '/home/afivan/Apps/chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell',
    // headless: 'shell',
    args: [
        "--autoplay-policy=no-user-gesture-required",
        "--no-sandbox",
        '--enable-gpu',
        '--disable-background-timer-throttling',
        '--disable-dev-shm-usage',
        '--enable-features=VaapiVideoDecoder'
    ],    
  });

  const page = await browser.newPage();
  console.log('Loading page (screenshot loop)');
  const recorder = await capture(page)

  console.log(`http://localhost:${getPort()}/veogenRaw/base?data=${encodeURIComponent(JSON.stringify(data))}`)

  await page.setViewport({width: (data.renderWidth || 3840), height: (data.renderHeight || 2160)});
  await page.goto(`http://localhost:${getPort()}/veogenRaw/base?data=${encodeURIComponent(JSON.stringify(data))}`, {
    waitUntil: 'networkidle2',
  });

  try {
    await page.waitForSelector('#page-loaded[data-loaded]', { timeout: 5000 });
  } catch {
    console.error('Could not wait for data to be loaded, screenshotting like this!');
  }

  // ensure page is active
  await page.bringToFront();
  await page.evaluate(() => window.focus());

  // allow layout to stabilize before recording
  // await new Promise(r => setTimeout(r, 500));
  // console.log(await page.title());
  // console.log(page.url())
  // console.log(await page.evaluate(() => document.body.innerHTML));
  // await sleep(10000);

  console.log('Starting recording');

  await recorder.start(filePath)
  // await recorder.waitForTimeout(1000)

  console.log('Started recording');

  await page.waitForSelector(
    '#animations-finished[data-animations-finished]',
    { timeout: 16000 }
  ).catch(() => {
    console.error('Animations did not finish in time, stopping stream!');
  });

  await recorder.stop()
  await recorder.detach()
  await browser.close();
}


async function renderVideoPageX11(url, data, dataIndex, filePath) {

  const width = data.renderWidth || 1920;
  const height = data.renderHeight || 1080;
  const display = ":99";

  // Start Xvfb
  const xvfb = spawn("Xvfb", [
    display,
    "-screen",
    "0",
    `${width}x${height}x24`
  ]);

  await sleep(1000); // Give Xvfb some time to start

  process.env.DISPLAY = display;

  const browser = await puppeteer.launch({
    executablePath: puppeteer.executablePath(),
    headless: false,
    args: [
      `--window-size=${width},${height}`,
      "--autoplay-policy=no-user-gesture-required",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--kiosk",
      "--window-position=0,0",
    ],
    defaultViewport: {
      width,
      height
    }
  });

  const page = await browser.newPage();

  await page.setViewport({width, height});
  // await page.goto(`http://localhost:${getPort()}/veogenRaw/base?data=${encodeURIComponent(JSON.stringify(data))}`, {
  await page.goto(`http://localhost:${getPort()}/veogenRaw/base?dataIndex=${dataIndex}`, {
    waitUntil: 'networkidle2',
  });

  try {
    await page.waitForSelector('#page-loaded[data-loaded]', { timeout: 5000 });
  } catch {
    console.error('Could not wait for data to be loaded, screenshotting like this!');
  }

  // ensure page is active
  await page.bringToFront();
  await page.evaluate(() => window.focus());

  // Start ffmpeg capture
  const ffmpeg = spawn("ffmpeg", [
    "-y",
    "-video_size", `${width}x${height}`,
    "-framerate", "30",
    "-f", "x11grab",
    // disable drawing the mouse cursor (hides it in the capture)
    "-draw_mouse", "0",
    "-i", `${display}.0`,
    // "-vf", `crop=${Math.round(box.width)}:${Math.round(box.height)}:${Math.round(box.x)}:${Math.round(box.y)}`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-b:v", "10M",
    "-pix_fmt", "yuv420p",
    "-movflags", "faststart",
    filePath
  ]);

  ffmpeg.stderr.on("data", d => console.log(d.toString()));

  await page.waitForSelector(
    "#animations-finished[data-animations-finished]",
    { timeout: 60000 }
  ).catch(() => {
    console.error("Animations timeout — stopping recording.");
  });

  // Stop recording
  ffmpeg.kill("SIGINT");

  await new Promise(resolve => ffmpeg.on("close", resolve));

  await browser.close();

  xvfb.kill("SIGINT");
}

module.exports = {
  renderPage,
  getPort,
  getFormattedDate,
  renderVideoPage,
  renderVideoStreamPage,
  renderVideoScreenshotPage,
  renderVideoCapturePage,
  renderVideoPageX11,
};