const fs = require("fs");
const path = require("path");

// const FILE_PATH = "./afi-voice-trim.wav";
// const BASE_URL = "http://localhost:7860";
// const API_URL = "http://localhost:7860/gradio_api/call/basic_tts";

async function initF5TTS(f5ttsConfig) {
  BASE_URL = f5ttsConfig.baseUrl;
  REFERENCE_AUDIO_PATH = f5ttsConfig.referenceAudioPath;
  REFERENCE_TEXT = f5ttsConfig.referenceText;
  RANDOMIZE_SEED = f5ttsConfig.randomizeSeed || false;
  REMOVE_SILENCES = f5ttsConfig.removeSilences || false;
  SEED = f5ttsConfig.seed || 52531120;
  CROSS_FADE_DURATION = f5ttsConfig.crossFadeDuration || 0.02;
  PITCH_SHIFT = f5ttsConfig.pitchShift || 38;
  SPEED_CHANGE = f5ttsConfig.speedChange || 1.0;

  async function uploadFile() {
    const uploadId = Math.random().toString(36).substring(7);

    const fileBuffer = fs.readFileSync(REFERENCE_AUDIO_PATH);
    const fileName = path.basename(REFERENCE_AUDIO_PATH);

    const form = new FormData();
    form.append(
      "files",
      new Blob([fileBuffer], { type: "audio/wav" }),
      fileName
    );

    const response = await fetch(
      `${BASE_URL}/gradio_api/upload?upload_id=${uploadId}`,
      {
        method: "POST",
        body: form
        // ❌ DO NOT manually set headers
      }
    );

    const result = await response.json();

    return result[0]; // contains path + url
  }

  async function basicTts(fileData, text) {
    const body = {
      data: [
        {
          path: fileData,
          meta: { _type: "gradio.FileData" }
        },
        REFERENCE_TEXT,
        text.replace(/!/g, '.'), // Replace ! with dot, because output is awful
        RANDOMIZE_SEED,
        REMOVE_SILENCES,
        SEED,
        CROSS_FADE_DURATION,
        PITCH_SHIFT,
        SPEED_CHANGE
      ]
    };

    const response = await fetch(
      `${BASE_URL}/gradio_api/call/basic_tts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const result = await response.json();
    const eventId = result.event_id;

    return eventId;
  }

  async function streamResult(eventId) {
    const response = await fetch(
      `${BASE_URL}/gradio_api/call/basic_tts/${eventId}`,
      {
        method: "GET",
        headers: {
          "Accept": "text/event-stream"
        }
      }
    );

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let res = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      res = processSSE(chunk);
    }

    return res;
  }

  function processSSE(chunk) {
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data:")) {
        const jsonStr = line.replace("data:", "").trim();

        if (jsonStr === "[DONE]") {
          console.log("Stream finished.");
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          return parsed;
        } catch (err) {
          console.log("Raw:", jsonStr);
        }
      }
    }
  }

  async function downloadFile(filePathOrUrl, outputFile) {
    try {
      let downloadUrl;

      // If already full URL → use it
      if (filePathOrUrl.startsWith("http")) {
        downloadUrl = filePathOrUrl;
      } else {
        // Convert /tmp/gradio/... path to public Gradio URL
        // const relativePath = filePathOrUrl.split("/tmp/gradio/")[1];
        const relativePath = filePathOrUrl;
        downloadUrl = `${BASE_URL}/gradio_api/file=${relativePath}`;
      }

      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      fs.writeFileSync(outputFile, buffer);

      return outputFile;

    } catch (err) {
      console.error("Download error:", err);
    }
  }

  async function textToSpeech(text, outputFile) {
    const fileData = await uploadFile();
    const eventId = await basicTts(fileData, text);

    const result = await streamResult(eventId);
    const audioFile = result[0].path;

    await downloadFile(audioFile, outputFile)
  }

  return {
    textToSpeech
  };
}






module.exports = {
  initF5TTS,
};