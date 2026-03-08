const axios = require('axios');
const path = require('path');
const fs = require('fs');

async function renderMedia(engineUrl, type, data) {
  const resp = await axios.post(`${engineUrl}/renderPage`, {
    url: `/${type}`,
    data,
  });

  const fileName = resp.data.fileName;

  const imageResp = await axios.request({
    method: 'get',
    url: `${engineUrl}/export/${fileName}`,
    responseType: 'arraybuffer',
  });

  return Buffer.from(imageResp.data);
}

async function renderMediaVideo(engineUrl, type, data) {
  const resp = await axios.post(`${engineUrl}/renderVideoPage`, {
    url: `/${type}`,
    data,
  });

  const fileName = resp.data.fileName;

  const imageResp = await axios.request({
    method: 'get',
    url: `${engineUrl}/export/${fileName}`,
    responseType: 'arraybuffer',
  });

  return Buffer.from(imageResp.data);
}

async function renderSlide(engineUrl, data) {
  return await renderMedia(engineUrl, 'veogen', data);
}

async function renderIntro(engineUrl, data) {
  return await renderMedia(engineUrl, 'veogen-intro', data);
}

async function renderOutro(engineUrl, data) {
  return await renderMedia(engineUrl, 'veogen-outro', data);
}

async function renderVeogenVideo(engineUrl, veogenType, data) {
  return await renderMediaVideo(engineUrl, `veogen/${veogenType}`, data);
}

/**
 * Converts an image file to a Base64 HTML <img> tag.
 * @param {string} filePath - path to the image file
 * @returns {string} HTML string
 */
function imageToHtmlBase64(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
    throw {
      msg: `Resource image ${filePath} not found!`,
    }
  }
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mimeType = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml'
  }[ext] || 'application/octet-stream';

  const data = fs.readFileSync(filePath);
  const base64 = data.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

module.exports = {
  renderSlide,
  renderIntro,
  renderOutro,
  renderVeogenVideo,
  imageToHtmlBase64,
};