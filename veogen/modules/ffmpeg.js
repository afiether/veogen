const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require("os");

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

async function trimVideoMp4(inputPath, startAt, endAt, outputPath) {
  // Also fix timeframe issues with -fflags +genpts if needed
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      "-ss", startAt,
      "to", endAt,
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

module.exports = {
  generateMp4FromPngAndMp3,
  concatMp4s,
  getAudioDuration,
  convertWebMToMP4,
  generateMp4FromMp4AndWav,
};