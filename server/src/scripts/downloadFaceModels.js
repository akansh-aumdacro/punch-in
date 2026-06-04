/* eslint-disable no-console */
//
// Downloads the face-api.js model weights required by faceService.js.
//
//   npm run download-face-models
//
// Models are written to server/models/ (override with FACE_MODELS_PATH).
// We pull the maintained weights from the @vladmandic/face-api repo, which is
// the same package we run at inference time, so the manifests always match.
//
// Three nets are needed for enrollment + 1:1 verification:
//   - ssdMobilenetv1      → face detection (bounding boxes + scores)
//   - faceLandmark68Net   → 68-point landmarks (alignment before embedding)
//   - faceRecognitionNet  → 128-D face descriptor (the embedding we compare)

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL =
  process.env.FACE_MODELS_URL ||
  'https://raw.githubusercontent.com/vladmandic/face-api/master/model';

const MODELS_DIR =
  process.env.FACE_MODELS_PATH || path.join(__dirname, '..', '..', 'models');

// Manifest files — each lists the binary shards we then download.
const MANIFESTS = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'face_landmark_68_model-weights_manifest.json',
  'face_recognition_model-weights_manifest.json',
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return reject(new Error(`GET ${url} → ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function downloadTo(filename) {
  const dest = path.join(MODELS_DIR, filename);
  if (fs.existsSync(dest)) {
    console.log(`  • ${filename} (already present, skipping)`);
    return fs.readFileSync(dest);
  }
  const buf = await fetch(`${BASE_URL}/${filename}`);
  fs.writeFileSync(dest, buf);
  console.log(`  ✓ ${filename} (${(buf.length / 1024).toFixed(0)} KB)`);
  return buf;
}

// A weights manifest is an array of groups; each group's `paths` are the
// binary shard filenames sitting next to the manifest.
function shardsFromManifest(buf) {
  const manifest = JSON.parse(buf.toString('utf8'));
  return manifest.flatMap((group) => group.paths || []);
}

async function main() {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  console.log(`Downloading face-api models → ${MODELS_DIR}\n`);

  for (const manifest of MANIFESTS) {
    console.log(manifest.replace('-weights_manifest.json', ''));
    const buf = await downloadTo(manifest);
    const shards = shardsFromManifest(buf);
    for (const shard of shards) {
      await downloadTo(shard);
    }
  }

  console.log('\nDone. faceService will load these automatically on first use.');
}

main().catch((err) => {
  console.error('\nFailed to download models:', err.message);
  console.error(
    'If you are offline, copy the weights from a machine that has them into',
    MODELS_DIR
  );
  process.exit(1);
});
