const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const vertex = require('./modules/vertex');
const ffmpeg = require('./modules/ffmpeg');
const render = require('./modules/render');
const audio = require('./modules/audio');
let f5TTS = null;

require('./modules/f5-tts').initF5TTS({
  baseUrl: 'http://localhost:7860',
  referenceAudioPath: path.join(__dirname, 'afi-voice-trim.wav'),
  referenceText: fs.readFileSync(path.join(__dirname, 'afi-voice-trim.txt'), 'utf8'),
  randomizeSeed: false,
  removeSilences: false,
  seed: 52531120,
  crossFadeDuration: 0.02,
  pitchShift: 38,
  speedChange: 1.0,
}).then((_) => {
  console.log('F5 TTS initialized');
  f5TTS = _;
});

function padNr(nr) {
  return nr.toString().padStart(2, '0');
}

function formatYouTubeTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  } else {
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}


function listProjects() {
  // Get the absolute path to the "projects" directory
  const projectsPath = path.join(__dirname, 'projects');

  // Check if it exists
  if (!fs.existsSync(projectsPath)) {
    console.log('No projects directory found.');
    return [];
  }

  // Read all items inside the projects folder
  const items = fs.readdirSync(projectsPath);

  // Filter only directories
  const folders = items.filter(item => {
    const itemPath = path.join(projectsPath, item);
    return fs.statSync(itemPath).isDirectory();
  });

  return folders;
}

async function generateAssets(project, engineUrl) {
  const projectPath = path.join(__dirname, 'projects', project);
  const projectDefinition = path.join(projectPath, 'proj.yml');

  // Check if it exists
  if (!fs.existsSync(projectPath)) {
    console.log('No projects directory found.');
    return null;
  }

  // Check if definition exists
  if (!fs.existsSync(projectDefinition)) {
    console.log('No project projectDefinition found.');
    return null;
  }

  const fileContents = fs.readFileSync(projectDefinition, 'utf8');
  const data = yaml.load(fileContents);

  let slideIndex = 0;

  const videoDefaults = {
    renderWidth: data.info.width,
    renderHeight: data.info.height,
    fps: data.info.fps,
  };

  for (const slide of data.slides) {
    const title = slide.title;
    const renderType = slide.renderType;

    let fragmentIndex = 0;
    let lastFragmentAppendData = {
      text: '',
      ulist: [],
      olist: [],
    };

    if (renderType === 'base') {
      // We may need a different approach with animation videos
      const renderFile = path.join(projectPath, `slide${padNr(slideIndex)}-render.mp4`);
      const speechFiles = [];

      // Generate text to speech for the entire slide fragment by fragment, to be used in the video render
      for (const fragment of slide.fragments) {
        const speech = fragment.textToSpeech.trim();

        const speechFile = path.join(projectPath, `slide${padNr(slideIndex)}_fragment${padNr(fragmentIndex)}-speech.wav`);
        if (!fs.existsSync(speechFile)) {
          await f5TTS.textToSpeech(speech, speechFile);
        }

        fragmentIndex++;
        speechFiles.push(speechFile);
      }

      if (!fs.existsSync(renderFile)) {
        let durationSpeech = 0;
        const speechFilesDurations = [];

        for (const speechFile of speechFiles) {
          const duration = await ffmpeg.getAudioDuration(speechFile) * 1000;
          durationSpeech += duration;
          speechFilesDurations.push(duration);
        }

        const allSpeechFile = path.join(projectPath, `slide${padNr(slideIndex)}-speech.wav`);

        // Concatenate all speech files into one, to be used in the video render with the correct duration
        await ffmpeg.concatMp4s(projectPath, speechFiles, allSpeechFile);

        console.log(`Total expected speech duration for slide ${slideIndex} is ${durationSpeech / 1000} seconds.`);

        const renderData = {
          fragments: [],
        };

        let startsAt = 0;

        for (const fragment of slide.fragments) {
          const fragmentIndex = slide.fragments.indexOf(fragment);
          let durationFragment = speechFilesDurations[fragmentIndex];
          console.log(`Expected speech duration for slide ${slideIndex} fragment ${fragmentIndex} is ${durationFragment / 1000} seconds.`);
          let captions = null;
          // Captions with timings for the entire slide, to be used in the video render
          if (fragment.enableCaptions) {
            captions = audio.estimateTimingsByCharacters(fragment.textToSpeech);

            let durationCaptions = 0;
            captions.forEach(c => {
              durationCaptions += c.duration;
            });

            console.log(`Estimated captions duration for slide ${slideIndex} fragment ${fragmentIndex} is ${durationCaptions / 1000} seconds.`);

            // Allow for a small margin of error, if captions duration is significantly longer than speech duration, we can adjust captions duration to match speech duration, to avoid captions running after speech has finished
            if (durationCaptions - fragment.captionsMarginError > durationFragment) {
              console.log(`Adjusting captions duration to match speech duration for slide ${slideIndex} fragment ${fragmentIndex}.`);
              const scale = (durationFragment) / durationCaptions;
              captions.forEach(c => {
                c.duration = Math.round(c.duration * scale);
              });
            }

            console.log(`Duration speech ${durationFragment} vs duration captions ${durationCaptions} for slide ${slideIndex} fragment ${fragmentIndex}.`)

            durationFragment = Math.max(durationFragment, durationCaptions);            

            console.log(captions)
          }

          renderData.fragments.push({
            title: fragment.title,
            subtitle: fragment.subtitle,
            text: fragment.textAppend ? (lastFragmentAppendData.text || '') + ' ' + fragment.textAppend : fragment.text,
            ulist: fragment.ulistAppend ? [...lastFragmentAppendData.ulist || [], ...fragment.ulistAppend] : fragment.ulist,
            olist: fragment.olistAppend ? [...lastFragmentAppendData.olist || [], ...fragment.olistAppend] : fragment.olist,
            showcaseImage: fragment?.showcaseImage?.startsWith('http') || fragment?.showcaseImage?.startsWith('/') ? fragment.showcaseImage : (fragment.showcaseImage ? `/projects/${project}/${fragment.showcaseImage}` : null),
            // expectedDuration: fragment.expectedDuration,
            startsAt,
            backgroundColor: fragment.backgroundColor,
            backgroundImage: fragment?.backgroundImage?.startsWith('http') || fragment?.backgroundImage?.startsWith('/') ? fragment.backgroundImage : (fragment.backgroundImage ? `/projects/${project}/${fragment.backgroundImage}` : null),
            showcaseImage: fragment?.showcaseImage?.startsWith('http') || fragment?.showcaseImage?.startsWith('/') ? fragment.showcaseImage : (fragment.showcaseImage ? `/projects/${project}/${fragment.showcaseImage}` : null),
            backgroundVideo: fragment?.backgroundVideo?.startsWith('http') || fragment?.backgroundVideo?.startsWith('/') ? fragment.backgroundVideo : (fragment.backgroundVideo ? `/projects/${project}/${fragment.backgroundVideo}` : null),
            enlargeSpace: fragment.enlargeSpace,
            terminalPrompt: fragment.terminalPrompt,
            terminalSleep: fragment.terminalSleep,
            terminalHeader: fragment.terminalHeader,
            // textToSpeech: fragment.textToSpeech,
            captionsMarginError: fragment.captionsMarginError || 0,
            captions,
          });

          startsAt += durationFragment;
        }

        console.log(`Render data for slide ${startsAt}`, slideIndex, renderData);

        const binaryRender = await render.renderVeogenVideo(engineUrl, renderType, {
          ...videoDefaults,
          ...renderData,
          expectedDuration: startsAt,
        });
        // This produces file without audio, need further processing to merge with the speech file, but at least we have the video with the correct duration and visuals now
        await fs.promises.writeFile(renderFile, binaryRender);
      }
    } else {
      // Old style
      for (const fragment of slide.fragments) {

        

        const speech = fragment.textToSpeech.trim();

        // Render image with assets
        // # TODO showcase generated by AI
        const renderFile = path.join(projectPath, `slide${padNr(slideIndex)}_fragment${padNr(fragmentIndex)}-render.png`);
        const data = {
          title: fragment.noTitle ? '' : title,
          subtitle: fragment.subtitle,
          text: fragment.textAppend ? (lastFragmentAppendData.text || '') + ' ' + fragment.textAppend : fragment.text,
          ulist: fragment.ulistAppend ? [...lastFragmentAppendData.ulist || [], ...fragment.ulistAppend] : fragment.ulist,
          olist: fragment.olistAppend ? [...lastFragmentAppendData.olist || [], ...fragment.olistAppend] : fragment.olist,
          showcaseImage: fragment.showcaseImage ? render.imageToHtmlBase64(path.join(projectPath, fragment.showcaseImage)) : null,
        };


        if (!fs.existsSync(renderFile)) {
          
          let binaryRender;

          switch (renderType) {
            case 'intro':
              binaryRender = await render.renderIntro(engineUrl, data);
              break;
            case 'outro':
              binaryRender = await render.renderOutro(engineUrl, data);
              break;
            // case 'base':
            //   binaryRender = await render.renderVeogenVideo(engineUrl, 'base', data);
            //   break;
            default:
              binaryRender = await render.renderSlide(engineUrl, data);
              break;
          }

          await fs.promises.writeFile(renderFile, binaryRender);
        }

        // Render text to speech
        // const speechFile = path.join(projectPath, `slide${padNr(slideIndex)}_fragment${padNr(fragmentIndex)}-speech.mp3`);
        const speechFile = path.join(projectPath, `slide${padNr(slideIndex)}_fragment${padNr(fragmentIndex)}-speech.wav`);
        if (!fs.existsSync(speechFile)) {
          await f5TTS.textToSpeech(speech, speechFile);
          // const audioBase64Content = await vertex.textToSpeech(speech);
          // await fs.promises.writeFile(speechFile, Buffer.from(audioBase64Content, 'base64'));
        }

        fragmentIndex++;

        lastFragmentAppendData.text = data.text;
        lastFragmentAppendData.olist = data.olist;
        lastFragmentAppendData.ulist = data.ulist;
      }

      
    }

    slideIndex++;
  }

  return data;
}

async function renderVideo(project) {
  const projectPath = path.join(__dirname, 'projects', project);
  const projectDefinition = path.join(projectPath, 'proj.yml');

  // Check if it exists
  if (!fs.existsSync(projectPath)) {
    console.log('No projects directory found.');
    return null;
  }

  // Check if definition exists
  if (!fs.existsSync(projectDefinition)) {
    console.log('No project projectDefinition found.');
    return null;
  }

  const fileContents = fs.readFileSync(projectDefinition, 'utf8');
  const data = yaml.load(fileContents);

  let slideIndex = 0;

  const videoFragments = [];

  for (const slide of data.slides) {
    const title = slide.title;
    const renderType = slide.renderType;

    let fragmentIndex = 0;

    if (renderType === 'base') {
      const renderFile = path.join(projectPath, `slide${padNr(slideIndex)}-render.mp4`);
      const speechFile = path.join(projectPath, `slide${padNr(slideIndex)}-speech.wav`);

      if (!fs.existsSync(renderFile)) {
        throw {
          err: `Render file for slide ${slideIndex} not found!`
        }
      }

      if (!fs.existsSync(speechFile)) {
        throw {
          err: `Speech file for slide ${slideIndex} not found!`
        }
      }

      console.log(`Generating video for slide ${slideIndex} with render ${renderFile} and speech ${speechFile}`);

      const fragmentVideoPath = path.join(projectPath, `slide${padNr(slideIndex)}-video.mp4`);

      await ffmpeg.generateMp4FromMp4AndWav(renderFile, speechFile, fragmentVideoPath);

      videoFragments.push(fragmentVideoPath);
    } else {
      // Old way
      for (const fragment of slide.fragments) {
        const renderFile = path.join(projectPath, `slide${padNr(slideIndex)}_fragment${padNr(fragmentIndex)}-render.png`);
        const speechFile = path.join(projectPath, `slide${padNr(slideIndex)}_fragment${padNr(fragmentIndex)}-speech.wav`);
        // const speechFile = path.join(projectPath, `slide${padNr(slideIndex)}_fragment${padNr(fragmentIndex)}-speech.mp3`);

        if (!fs.existsSync(renderFile)) {
          throw {
            err: `Render file file for slide ${slideIndex}, fragment ${fragmentIndex} not found!`
          }
        }

        if (!fs.existsSync(speechFile)) {
          throw {
            err: `Speech file for slide ${slideIndex}, fragment ${fragmentIndex} not found!`
          }
        }

        const fragmentVideoPath = path.join(projectPath, `slide${padNr(slideIndex)}_fragment${padNr(fragmentIndex)}-video.mp4`);

        await ffmpeg.generateMp4FromMp4AndWav(renderFile, speechFile, fragmentVideoPath);

        videoFragments.push(fragmentVideoPath);

        fragmentIndex++;
      }
    }

    slideIndex++;
  }

  const finalVideoPath = path.join(projectPath, `project-${project}.mp4`);

  await ffmpeg.concatMp4s(projectPath, videoFragments, finalVideoPath);

  return finalVideoPath;
}

async function generateChapters(project) {
  const projectPath = path.join(__dirname, 'projects', project);
  const projectDefinition = path.join(projectPath, 'proj.yml');

  // Check if it exists
  if (!fs.existsSync(projectPath)) {
    console.log('No projects directory found.');
    return null;
  }

  // Check if definition exists
  if (!fs.existsSync(projectDefinition)) {
    console.log('No project projectDefinition found.');
    return null;
  }

  const fileContents = fs.readFileSync(projectDefinition, 'utf8');
  const data = yaml.load(fileContents);

  let slideIndex = 0;

  const chapters = [];
  let durationHead = 0;

  for (const slide of data.slides) {
    let fragmentIndex = 0;
    const chapterName = slide.title;
    let chapterDuration = 0;

    for (const fragment of slide.fragments) {
      const mp4Name = `slide${padNr(slideIndex)}_fragment${padNr(fragmentIndex)}-video.mp4`
      const mp4File = path.join(projectPath, mp4Name);

      if (!fs.existsSync(mp4File)) {
        throw {
          err: `Video file for slide ${slideIndex}, fragment ${fragmentIndex} not found!`
        }
      }

      const duration = await ffmpeg.getAudioDuration(mp4File);
      
      chapterDuration += duration;

      fragmentIndex++;
    }

    const youtubeTs = formatYouTubeTimestamp(durationHead);
    console.log(`Duration of chapter ${slideIndex} (${chapterName}) is ${chapterDuration} seconds, HEAD at: ${youtubeTs}`);

    chapters.push(`${youtubeTs} ${chapterName}`);

    slideIndex++;
    durationHead += chapterDuration;
  }

  const chaptersFile = path.join(projectPath, `project-${project}-chapters.txt`);
  const chaptersStr = chapters.join('\n');

  await fs.promises.writeFile(chaptersFile, Buffer.from(chaptersStr));

  return chaptersStr;
}

module.exports = {
  listProjects,
  generateAssets,
  renderVideo,
  generateChapters,
};