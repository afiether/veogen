const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require("os");
const glob = require('glob');

// Get audio length
// ffprobe -i audio.mp3 -show_entries format=duration -v quiet -of csv="p=0"
// Pass to ffmpeg with -t

/**
 * Run ffprobe to get audio duration in seconds
 * @param {string} filePath
 * @returns {Promise<number>} duration in seconds
 */
async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath
    ];

    const ffprobe = spawn('ffprobe', args);

    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      console.error(data.toString());
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        if (isNaN(duration)) {
          return reject(new Error('Could not parse duration'));
        }
        resolve(duration);
      } else {
        reject(new Error(`ffprobe exited with code ${code}`));
      }
    });
  });
}


/**
 * Extract audio from a video file and save as WAV
 * @param {string} inputPath - Path to video file
 * @param {string} outputPath - Path to output WAV file
 * @returns {Promise<string>}
 */
async function extractAudioToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", inputPath,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", "44100",
      "-ac", "2",
      outputPath
    ]);

    ffmpeg.stderr.on("data", (data) => {
      console.log(`ffmpeg: ${data}`);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(`FFmpeg exited with code ${code}`);
      }
    });
  });
}


/**
 * Generate silent WAV file
 * @param {string} outputPath
 * @param {number} durationMs
 * @returns {Promise<string>}
 */
function generateSilentWav(outputPath, durationMs) {
  return new Promise((resolve, reject) => {
    const durationSec = (durationMs / 1000).toString();

    const args = [
      "-y",

      // Generate silence
      "-f", "lavfi",
      //"-i", "anullsrc=r=44100:cl=stereo",
      "-i", "anullsrc=r=24000:cl=mono",

      // Duration
      "-t", durationSec,

      // WAV format (PCM)
      "-acodec", "pcm_s16le",

      outputPath
    ];

    const ffmpeg = spawn("ffmpeg", args);

    ffmpeg.stderr.on("data", (data) => {
      console.log("FFmpeg:", data.toString());
    });

    ffmpeg.on("error", reject);

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}

async function generateMp4FromPngAndMp3(pngPath, audioPath, outputPath) {
  const duration = await getAudioDuration(audioPath);

  console.log(`Audio duration: ${duration} seconds`);

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-loop', '1',
      '-i', pngPath,
      '-i', audioPath,
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-pix_fmt', 'yuv420p',
      '-t', duration.toFixed(3),
      // '-shortest',
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'inherit' });

    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function generateMp4FromMp4AndWav(mp4Path, wavPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', mp4Path,
      '-i', wavPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-map', '0:v:0',
      '-map', '1:a:0',
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'inherit' });

    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function generateMp4FromMp4AndWavAlignAudio(mp4Path, wavPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", mp4Path,
      "-i", wavPath,

      "-c:v", "copy",

      "-c:a", "aac",
      "-b:a", "192k",

      "-af", "aresample=44100:async=1:first_pts=0",
      "-ac", "2",

      "-map", "0:v:0",
      "-map", "1:a:0",

      "-shortest",
      "-movflags", "+faststart",

      outputPath
    ];

    const ffmpeg = spawn("ffmpeg", args);

    let stderr = "";
    let stdout = "";

    ffmpeg.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ffmpeg.stderr.on("data", (data) => {
      const msg = data.toString();
      stderr += msg;
      console.error("FFmpeg:", msg); // 👈 THIS is key
    });

    ffmpeg.on("error", (err) => {
      reject(err);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg failed (code ${code})\n${stderr}`));
      }
    });
  });
}

async function concatWavs(projectPath, wavPaths, outputPath) {
  const listFile = path.join(projectPath, "concat_list.txt");

  // Create concat list
  const fileListContent = wavPaths
    .map((file) => `file '${path.resolve(file).replace(/'/g, "'\\''")}'`)
    .join("\n");

  fs.writeFileSync(listFile, fileListContent, "utf8");

  return new Promise((resolve, reject) => {
    const args = [
      "-y",

      "-f", "concat",
      "-safe", "0",
      "-i", listFile,

      // 🔥 Re-encode + normalize audio
      "-af", "aresample=44100:async=1:first_pts=0",
      "-ar", "44100",
      "-ac", "2",
      "-c:a", "pcm_s16le",

      outputPath
    ];

    console.log("Running FFmpeg:", ["ffmpeg", ...args].join(" "));

    const ffmpeg = spawn("ffmpeg", args);

    ffmpeg.stderr.on("data", (data) => {
      console.log("FFmpeg:", data.toString());
    });

    ffmpeg.on("error", (err) => {
      fs.unlinkSync(listFile);
      reject(err);
    });

    ffmpeg.on("close", (code) => {
      fs.unlinkSync(listFile);
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function concatWavsRobust(projectPath, wavPaths, outputPath) {
  return new Promise((resolve, reject) => {
    // Build input args
    const inputArgs = wavPaths.flatMap(p => ["-i", path.resolve(p)]);

    // Build filter: normalize EACH input first
    const filterParts = wavPaths.map((_, i) => {
      // return `[${i}:a]aresample=44100:async=1:first_pts=0,asetpts=PTS-STARTPTS,pan=stereo|c0=c0|c1=c1[a${i}]`;
      return `[${i}:a]aresample=44100:async=1:first_pts=0,asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo[a${i}]`;
    });

    // Then concat all normalized streams
    const concatInputs = wavPaths.map((_, i) => `[a${i}]`).join("");
    const concatPart = `${concatInputs}concat=n=${wavPaths.length}:v=0:a=1[outa]`;

    const filterComplex = [...filterParts, concatPart].join(";");

    const args = [
      "-y",
      ...inputArgs,

      "-filter_complex", filterComplex,
      "-map", "[outa]",

      // Final output format
      "-c:a", "pcm_s16le",
      "-ar", "44100",
      "-ac", "2",

      outputPath
    ];

    console.log("Running FFmpeg:", ["ffmpeg", ...args].join(" "));

    const ffmpeg = spawn("ffmpeg", args);

    ffmpeg.stderr.on("data", (data) => {
      console.log("FFmpeg:", data.toString());
    });

    ffmpeg.on("error", reject);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

/**
 * Concatenate MP4s using concat demuxer (no re-encoding)
 * @param {string} projectPath Our project path
 * @param {string[]} mp4Paths Array of mp4 file paths
 * @param {string} outputPath Output MP4 path
 */
async function concatMp4s(projectPath, mp4Paths, outputPath) {
  const listFile = path.join(projectPath, 'concat_list.txt');

  // Create the concat list file
  const fileListContent = mp4Paths
    .map((file) => `file '${path.resolve(file).replace(/'/g, "'\\''")}'`)
    .join('\n');

  fs.writeFileSync(listFile, fileListContent, 'utf8');

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      outputPath
    ];

    console.log('Running FFmpeg:', ['ffmpeg', ...args].join(' '));

    const ffmpeg = spawn('ffmpeg', args, {
      stdio: 'inherit'
    });

    ffmpeg.on('error', (err) => {
      fs.unlinkSync(listFile);
      reject(err);
    });

    ffmpeg.on('close', (code) => {
      fs.unlinkSync(listFile);
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function convertWebMToMP4(webmPath, mp4Path) {
  // Also fix timeframe issues with -fflags +genpts if needed
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', webmPath,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-fflags', '+genpts',
      mp4Path
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'inherit' });

    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(mp4Path);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function randomVideoClips(inputFile, targetDuration, outputFile) {

  function run(cmd, args) {
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    if (r.status !== 0) {
      console.error(r.stderr);
      throw new Error(cmd + " failed");
    }
    return r.stdout.trim();
  }

  // Get video duration
  const totalDuration = parseFloat(run("ffprobe", [
    "-v","error",
    "-show_entries","format=duration",
    "-of","default=noprint_wrappers=1:nokey=1",
    inputFile
  ]));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(),"clips-"));

  let remaining = targetDuration;
  let clipIndex = 0;

  const clipFiles = [];
  const usedSegments = [];

  function overlaps(start,end){
    for(const s of usedSegments){
      if(start < s.end && end > s.start){
        return true;
      }
    }
    return false;
  }

  while(remaining > 0){

    const clipLength = Math.min(
      remaining,
      2 + Math.random()*4
    );

    let start;
    let end;
    let attempts = 0;

    do{
      start = Math.random() * (totalDuration - clipLength);
      end = start + clipLength;
      attempts++;
    } while(overlaps(start,end) && attempts < 50);

    usedSegments.push({start,end});

    const clipPath = path.join(tempDir,`clip_${clipIndex}.mp4`);

    run("ffmpeg",[
      "-y",
      "-ss", start.toString(),
      "-t", clipLength.toString(),
      "-i", inputFile,
      "-c:v","libx264",
      "-preset","veryfast",
      "-crf","23",
      "-pix_fmt","yuv420p",
      "-movflags","+faststart",
      "-an",
      clipPath
    ]);

    clipFiles.push(clipPath);

    remaining -= clipLength;
    clipIndex++;
  }

  // Build concat list
  const concatFile = path.join(tempDir,"concat.txt");

  fs.writeFileSync(
    concatFile,
    clipFiles.map(f => `file '${f}'`).join("\n")
  );

  // Re-encode final output (fix timestamps)
  await new Promise((resolve,reject)=>{

    const ff = spawn("ffmpeg",[
      "-y",
      "-f","concat",
      "-safe","0",
      "-i",concatFile,
      "-c:v","libx264",
      "-preset","slow",
      "-crf","22",
      "-pix_fmt","yuv420p",
      "-movflags","+faststart",
      outputFile
    ]);

    ff.stderr.on("data",d=>process.stderr.write(d));

    ff.on("close",code=>{
      if(code===0) resolve();
      else reject(new Error("ffmpeg concat failed"));
    });

  });

  // cleanup
  clipFiles.forEach(f=>fs.unlinkSync(f));
  fs.unlinkSync(concatFile);
  fs.rmdirSync(tempDir);
}

/**
 * Convert MOV to MP4 with proper re-encoding (no stutter, fast seeking)
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns {Promise<string>}
 */
function convertMovToMp4(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", inputPath,

      // "-c:v", "libx264",
      "-c:v", "h264_nvenc",
      // "-preset", "medium",
      // "-crf", "14",
      '-cq', '18',
      '-preset', 'p7',
      "-pix_fmt", "yuv420p",

      "-c:a", "aac",
      "-b:a", "192k",

      // ✅ Force constant framerate
      // "-r", "30",

      // ✅ Ensure proper CFR sync (modern replacement for -vsync)
      "-fps_mode", "cfr",

      "-g", "120",

      '-fflags',  '+genpts',

      "-movflags", "+faststart",
      "-y",
      outputPath
    ]);

    ffmpeg.stderr.on("data", data => console.log(`ffmpeg: ${data}`));

    ffmpeg.on("close", code => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}

async function trimVideoMp4(inputPath, startAt, endAt, outputPath) {
  // Also fix timeframe issues with -fflags +genpts if needed
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      "-ss", startAt,
      "-to", endAt,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-fflags', '+genpts',
      '-c:a', 'aac',
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'inherit' });

    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function cropCenteredHDVideoToReel(inputPath, resWidth, resHeight, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vf', `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=${resWidth}:${resHeight}`,
      '-c:a', 'copy',
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.stdout.on('data', data => {
      console.log(`ffmpeg stdout: ${data}`);
    });

    ffmpeg.stderr.on('data', data => {
      console.log(`ffmpeg stderr: ${data}`);
    });

    ffmpeg.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function cropAndScaleFixed(inputPath, width, height, x, y, resWidth, resHeight, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vf', `crop=${width}:${height}:${x}:${y},scale=${resWidth}:${resHeight}`,
      '-c:a', 'copy',
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.stdout.on('data', data => {
      console.log(`ffmpeg stdout: ${data}`);
    });

    ffmpeg.stderr.on('data', data => {
      console.log(`ffmpeg stderr: ${data}`);
    });

    ffmpeg.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function applyStagingVideoOperations(project, config) {
  if (Array.isArray(config)) {
    for (const op of config) {
      const appDir = path.dirname(require.main.filename);

      const operation = op.operation;
      const input = `${appDir}/veogen/projects/${project}/${op.input}`;
      
      const output = `${appDir}/veogen/projects/${project}/${op.output}`;
      const params = op.params;
      const outputName = op.outputName;

      if (!fs.existsSync(output)) {
        fs.mkdirSync(output);
      }

      const files = glob
        .globSync(input)
        // .filter(f => !fs.existsSync(f))
      ;

      switch (operation) {
        case 'trimVideo':
          for (const file of files) {
            const info = path.parse(file);  
            const name = info.name;
            const ext = info.ext;
            const outputFile = path.join(output, `${outputName || name}${ext}`);

            if (!fs.existsSync(outputFile)) {
              await trimVideoMp4(file, params.startAt, params.endAt, outputFile);
            }
          }
          break;
        case 'convertToMp4':
          for (const file of files) {
            const info = path.parse(file);  
            const name = info.name;
            const ext = '.mp4';
            const outputFile = path.join(output, `${outputName || name}${ext}`);

            if (!fs.existsSync(outputFile)) {
              await convertMovToMp4(file, outputFile);
            }
          }
          break;
        case 'cropCenteredHDVideoToReel':
          for (const file of files) {
            const info = path.parse(file);  
            const name = info.name;
            const ext = info.ext;
            const outputFile = path.join(output, `${outputName || name}${ext}`);

            if (!fs.existsSync(outputFile)) {
              await cropCenteredHDVideoToReel(file, params.resWidth, params.resHeight, outputFile);
            }
          }
          break;
        case 'cropAndScaleFixed':
          for (const file of files) {
            const info = path.parse(file);  
            const name = info.name;
            const ext = info.ext;
            const outputFile = path.join(output, `${outputName || name}${ext}`);

            if (!fs.existsSync(outputFile)) {
              await cropAndScaleFixed(file, params.width, params.height, params.x, params.y, params.resWidth, params.resHeight, outputFile);
            }
          }
          break;
        default:
          console.warn(`Image operation ${operation} not supported!`);
          break;
      }
    }
  }
}

module.exports = {
  generateMp4FromPngAndMp3,
  concatMp4s,
  concatWavs,
  concatWavsRobust,
  getAudioDuration,
  convertWebMToMP4,
  generateMp4FromMp4AndWav,
  generateMp4FromMp4AndWavAlignAudio,
  generateSilentWav,
  randomVideoClips,
  trimVideoMp4,
  extractAudioToWav,
  convertMovToMp4,  
  cropCenteredHDVideoToReel,
  cropAndScaleFixed,
  applyStagingVideoOperations,
};