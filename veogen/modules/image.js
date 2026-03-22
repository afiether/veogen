const { removeBackground } = require("@imgly/background-removal-node");
const { Jimp } = require("jimp");
const sharp = require("sharp");
const glob = require('glob');
const path = require('path');

const fs = require("fs");  

async function convertToPng(fileInput, fileOutput) {
  const image = await Jimp.read(fileInput);

  await image.write(fileOutput);
}

async function removeBG(fileInput, fileOutput) {
  // const input = fs.readFileSync(fileInput);

  const outputBlob = await removeBackground(fileInput);

  // Convert Blob → ArrayBuffer
  const arrayBuffer = await outputBlob.arrayBuffer();

  // Convert ArrayBuffer → Buffer
  const buffer = Buffer.from(arrayBuffer);

  fs.writeFileSync(fileOutput, buffer);
}    

async function rotateImage(fileInput, rotateAngle, fileOutput) {
  await sharp(fileInput)
    .rotate(rotateAngle)
    .toFile(fileOutput);  
}

async function resizeImage(fileInput, width, height, fit, background, fileOutput) {
  await sharp(fileInput)
    .resize(width, height, {
      // fit: 'contain',
      // background: { r: 255, g: 255, b: 255, alpha: 0.0 }
      fit, background,
    })
    .toFile(fileOutput);
}

function filePathWithoutExtension(path) {
  return path.replace(/\.[^/.]+$/, "")
}

async function applyStagingImageOperations(project, config) {
  if (Array.isArray(config)) {
    for (const op of config) {
      const appDir = path.dirname(require.main.filename);

      const operation = op.operation;
      const input = `${appDir}/veogen/projects/${project}/${op.input}`;
      
      const output = `${appDir}/veogen/projects/${project}/${op.output}`;
      const params = op.params;


      if (!fs.existsSync(output)) {
        fs.mkdirSync(output);
      }

      const files = glob
        .globSync(input)
        // .filter(f => !fs.existsSync(f))
      ;

      switch (operation) {
        case 'convertToPng':
          for (const file of files) {
            const info = path.parse(file);  
            const name = info.name;
            const outputFile = `${output}/${name}.png`;

            if (!fs.existsSync(outputFile)) {
              await convertToPng(file, outputFile);
            }
          }
          break;
        case 'rotateImage':
          for (const file of files) {
            const info = path.parse(file);  
            const name = info.name;
            const ext = info.ext;
            const outputFile = `${output}/${name}-rotate${ext}`;
            const rotateAngle = params.rotateAngle;

            if (!fs.existsSync(outputFile)) {
              await rotateImage(file, rotateAngle, outputFile);
            }
          }
          break;
        case 'resizeImage':
          for (const file of files) {
            const info = path.parse(file);  
            const name = info.name;
            const ext = info.ext;
            const outputFile = `${output}/${name}-resize${ext}`;
            const width = params.width;
            const height = params.height;
            const fit = params.fit;
            const background = params.background;

            if (!fs.existsSync(outputFile)) {
              await resizeImage(file, width, height, fit, background, outputFile);
            }
          }
          break;
        case 'removeBackground':
          for (const file of files) {
            const info = path.parse(file);  
            const name = info.name;
            const ext = info.ext;
            if (ext !== '.png') {
              console.warn(`In order to remove background, we need a png file: ${file}`);
              return;
            }
            const outputFile = `${output}/${name}-nobg${ext}`;

            if (!fs.existsSync(outputFile)) {
              await removeBG(file, outputFile);
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
  convertToPng,
  removeBG,
  rotateImage,
  resizeImage,
  applyStagingImageOperations,
}