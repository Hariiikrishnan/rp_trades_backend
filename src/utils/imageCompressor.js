// src/utils/imageCompressor.js

const sharp = require('sharp');
const fs = require('fs');

async function compressBase64Image(base64, outputPath) {
  const buffer = Buffer.from(base64, 'base64');

  await sharp(buffer)
    .rotate() 
    .resize({
      width: 1280,
      height: 1280,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 70,
      mozjpeg: true,
    })
    .toFile(outputPath);

  return outputPath;
}

module.exports = {
  compressBase64Image,
};