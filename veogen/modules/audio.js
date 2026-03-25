
const fs = require('fs');
const { exec } = require('child_process');
const axios = require('axios');
const path = require("path");
// const FormData = require("form-data");

// NOTE: no dependencies are declared in package.json yet for any speech
// library.  The primary implementation below uses Google Cloud Speech-to-
//Text because it can return word time offsets out of the box.  If you
//prefer a local/open‑source approach you can install a forced-aligner
//(e.g. Gentle, Aeneas, Vosk) and call it from here instead.

/**
 * alignWords
 * -----------
 * Given the path to a WAV file and the corresponding reference text,
 * return an array of objects `{ word, start, end }` where start/end are
 * in milliseconds.
 *
 * The simplest implementation uses Google Cloud Speech-to-Text with
 * `enableWordTimeOffsets`.  The service recognises the speech and
 * provides timings for each token, which can then be rounded to the
 * desired precision.
 *
 * @param {string} wavPath   path to a 16‑bit, 16‑kHz WAV file (LINEAR16)
 * @param {string} transcript the known text spoken in the file
 * @returns {Promise<Array<{word:string,start:number,end:number}>>}
 */
async function alignWords(wavPath, transcript) {
  // make sure client library is installed separately if you use this
  // method (`npm install @google-cloud/speech`).  Authentication must
  // also be configured using GOOGLE_APPLICATION_CREDENTIALS or similar.

  let results = [];
  try {
    const speech = require('@google-cloud/speech');
    const client = new speech.SpeechClient();

    const audioBytes = fs.readFileSync(wavPath).toString('base64');

    const request = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        enableWordTimeOffsets: true,
        // optionally supply the transcript as a speech_context or with
        // `maxAlternatives: 1` to bias recognition, but the API will
        // still return timings for whatever it recognises.
      },
      audio: {
        content: audioBytes,
      },
    };

    const [response] = await client.recognize(request);
    if (
      response.results &&
      response.results[0] &&
      response.results[0].alternatives &&
      response.results[0].alternatives[0]
    ) {
      const words = response.results[0].alternatives[0].words || [];
      results = words.map(w => {
        const startSec = w.startTime.seconds || 0;
        const startNano = w.startTime.nanos || 0;
        const endSec = w.endTime.seconds || 0;
        const endNano = w.endTime.nanos || 0;
        const startMs = Math.round(startSec * 1000 + startNano / 1e6);
        const endMs = Math.round(endSec * 1000 + endNano / 1e6);
        return { word: w.word, start: startMs, end: endMs };
      });
    }
  } catch (err) {
    // if the cloud library isn't available, we'll try a local aligner
    console.warn('Google STT failed, falling back to gentle if installed:', err.message);
    const fallback = await alignWithGentle(wavPath, transcript);
    if (Array.isArray(fallback)) {
      results = fallback;
    }
  }

  return results;
}

/**
 * alignWithGentle
 * --------------
 * If you have the `gentle` forced‑alignment tool available on your
 * system (https://github.com/lowerquality/gentle), this helper will run
 * it and parse the JSON output.  Gentle requires a WAV file and the
 * verbatim transcript; it returns timings for each word.
 *
 * @param {string} wavPath
 * @param {string} transcript
 * @returns {Promise<Array<{word:string,start:number,end:number}>>}
 */
async function alignWithGentle(wavPath, transcript) {
  const form = new FormData();

  const fileBuffer = fs.readFileSync(wavPath);
  const fileName = path.basename(wavPath);

  // Attach audio file
  // form.append(
  //   "audio",
  //   fileBuffer,
  //   { 
  //     fileName,
  //     contentType: 'audio/wav'
  //   }
  // );
  form.append(
    "audio",
    new Blob([fileBuffer], { type: "audio/wav" }),
    fileName
  );


  // Attach transcript as a virtual file
  // form.append("transcript", Buffer.from(transcript), {
  //   filename: "transcript.txt",
  //   contentType: "text/plain"
  // });
  form.append("transcript", new Blob([transcript], { type: "text/plain" }), "transcript.txt");


  try {
    const response = await fetch(
      "http://localhost:8765/transcriptions?async=false",
      {
        method: "POST",
        body: form,
        // headers: form.getHeaders(),
        // ❌ DO NOT manually set headers
      }
    );

    // const response = await axios.post(
    //   "http://localhost:8765/transcriptions?async=false",
    //   form,
    //   {
    //     headers: form.getHeaders(),
    //     maxContentLength: Infinity,
    //     maxBodyLength: Infinity
    //   }
    // );

    // const data = response.data;
    const data = await response.json();

    const words = [];
    if (Array.isArray(data.words)) {
      let lastEndWord = 0;
      for (const w of data.words) {
        if (w.alignedWord && w.start != null && w.end != null) {
          const start = Math.round(w.start * 1000);
          const end = Math.round(w.end * 1000);

          lastEndWord = end;

          words.push({
            word: w.word,
            start,
            end,
            duration: end - start,
          });
        } else {
          // It gave kicks, so fallback on empiric method
          const empiricWord = estimateTimingsByCharacters(w.word)[0];
          const spaceDelay = 20;
          
          // Account for a short 'space'
          const start = lastEndWord + spaceDelay;
          const end = empiricWord.end + lastEndWord + spaceDelay;
          
          words.push({
            word: w.word,
            start,
            end,
            duration: empiricWord.duration,
          });

          lastEndWord = end;
        }
      }
    }

    return words;

  } catch (err) {
    console.error("Gentle API error:", err.message);
    throw err;
  }
}

function estimateTimingsByCharacters(text) {
  const words = text.trim().split(/\s+/);

  // --- CONFIG ---
  // Average speaking speed: ~14 characters per second
  // → ~71ms per character
  // adapted to my voice
  const msPerChar = 73;

  // Minimum duration for any word to ensure it's visible
  const minDuration = 100;

  let start = 0;

  return words.map(word => {
    const rawDuration = word.length * msPerChar;
    // Ensure minimum duration, but don't round aggressively - use Math.round for more precision
    const duration = Math.max(minDuration, Math.round(rawDuration));
    const end = start + duration;

    const entry = { word, duration, start, end };
    start = end;

    return entry;
  });
}


module.exports = {
  alignWords,
  alignWithGentle,
  estimateTimingsByCharacters,
};
