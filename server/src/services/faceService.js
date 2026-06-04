//
// faceService — the face-recognition ENGINE.
//
// Pure, stateless image → descriptor / descriptor → match logic built on
// @vladmandic/face-api running under @tensorflow/tfjs-node. It holds NO
// database or request knowledge; faceVerificationService orchestrates it.
//
// All verification happens here on the server. The frontend only ever sends a
// raw image — never an embedding or a match decision — so the trust boundary
// cannot be bypassed from the client (Security Requirement #1 / #4).
//
// Heavy native deps (tfjs-node) and ~16 MB of model weights are loaded LAZILY
// on first use. If they are missing or fail to load, we raise a single
// ENGINE_UNAVAILABLE FaceError instead of crashing app startup, so the rest of
// the platform keeps working and only face endpoints degrade.

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Errors — each maps to one of the exact user-facing messages in the spec.
// ---------------------------------------------------------------------------

class FaceError extends Error {
  constructor(message, { status = 422, code = 'FACE_ERROR', meta } = {}) {
    super(message);
    this.name = 'FaceError';
    this.status = status;
    this.code = code;
    if (meta) this.meta = meta;
  }
}

const MESSAGES = {
  NO_FACE: 'No face detected. Please look at the camera and try again.',
  MULTIPLE_FACES: 'Multiple faces detected. Only one face should be visible.',
  NO_MATCH:
    'Face verification failed. The detected face does not match the registered employee.',
  LOW_QUALITY: 'Image quality is too low for verification. Please try again.',
  NOT_ENROLLED:
    'No registered face found for this employee. Please complete face enrollment first.',
  ENGINE_UNAVAILABLE:
    'Face recognition engine is not available. Please contact your administrator.',
};

const faceError = (code, meta) => {
  const status =
    code === 'ENGINE_UNAVAILABLE'
      ? 503
      : code === 'NOT_ENROLLED'
        ? 409
        : 422;
  return new FaceError(MESSAGES[code] || 'Face processing failed', { status, code, meta });
};

// ---------------------------------------------------------------------------
// Tunables (all env-overridable)
// ---------------------------------------------------------------------------

const MODELS_PATH =
  process.env.FACE_MODELS_PATH || path.join(__dirname, '..', '..', 'models');

// Minimum 1:1 match confidence (0..1, higher = stricter) required to allow a
// punch-in. Shared with the AI Time Guard so the platform has ONE notion of a
// "good" match. Default 0.6 ≈ a euclidean descriptor distance of 0.4.
const MATCH_THRESHOLD = () => Number(process.env.FACE_MATCH_THRESHOLD || 0.6);

// Detector confidence below which we treat the capture as too poor to trust.
const MIN_DETECTION_SCORE = () => Number(process.env.FACE_MIN_DETECTION_SCORE || 0.6);

// Reject tiny faces (face box shorter than this many px) — usually means the
// employee is too far from the camera for a reliable embedding.
const MIN_FACE_SIZE = () => Number(process.env.FACE_MIN_FACE_SIZE || 90);

// Allows ops to hard-disable the engine (e.g. on hosts without tfjs-node).
const ENGINE_ENABLED = () =>
  String(process.env.FACE_ENGINE_ENABLED || 'true').toLowerCase() !== 'false';

// ---------------------------------------------------------------------------
// Lazy model loading
// ---------------------------------------------------------------------------

let tf = null;
let faceapi = null;
let modelsLoaded = false;
let loadPromise = null;

function requiredManifests() {
  return [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'face_landmark_68_model-weights_manifest.json',
    'face_recognition_model-weights_manifest.json',
  ];
}

function modelsPresent() {
  return requiredManifests().every((m) => fs.existsSync(path.join(MODELS_PATH, m)));
}

async function loadModels() {
  if (modelsLoaded) return;
  if (!ENGINE_ENABLED()) throw faceError('ENGINE_UNAVAILABLE');

  // Single-flight: concurrent callers await the same load.
  if (!loadPromise) {
    loadPromise = (async () => {
      if (!modelsPresent()) {
        throw faceError('ENGINE_UNAVAILABLE', {
          detail: `Model weights not found in ${MODELS_PATH}. Run "npm run download-face-models".`,
        });
      }
      try {
        // Require lazily so a missing native build doesn't break app boot.
        tf = require('@tensorflow/tfjs-node');
        faceapi = require('@vladmandic/face-api');
        // face-api needs to be told which tf instance to use in Node.
        await faceapi.tf.setBackend('tensorflow').catch(() => {});
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
        modelsLoaded = true;
        // eslint-disable-next-line no-console
        console.log('[punchin] face recognition models loaded from', MODELS_PATH);
      } catch (err) {
        loadPromise = null; // allow a later retry
        if (err instanceof FaceError) throw err;
        throw faceError('ENGINE_UNAVAILABLE', { detail: err.message });
      }
    })();
  }
  await loadPromise;
}

// ---------------------------------------------------------------------------
// Image decoding
// ---------------------------------------------------------------------------

// Accepts a Buffer, a raw base64 string, or a data-URL ("data:image/...;base64,..").
function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input !== 'string' || !input.trim()) {
    throw faceError('LOW_QUALITY', { detail: 'empty image payload' });
  }
  const match = input.match(/^data:(image\/[\w.+-]+);base64,(.*)$/s);
  const b64 = match ? match[2] : input;
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 1024) throw new Error('decoded image too small');
    return buf;
  } catch (err) {
    throw faceError('LOW_QUALITY', { detail: err.message });
  }
}

// ---------------------------------------------------------------------------
// Core engine API
// ---------------------------------------------------------------------------

// Detects exactly one good-quality face in `imageInput` and returns its 128-D
// descriptor plus detection metadata. Throws the appropriate FaceError for the
// no-face / multiple-faces / low-quality cases.
async function computeDescriptor(imageInput) {
  await loadModels();
  const buffer = toBuffer(imageInput);

  let tensor;
  try {
    tensor = tf.node.decodeImage(buffer, 3);
  } catch (err) {
    throw faceError('LOW_QUALITY', { detail: `decode failed: ${err.message}` });
  }

  try {
    const options = new faceapi.SsdMobilenetv1Options({
      minConfidence: 0.3, // detect liberally; we apply our own quality gate below
    });
    const detections = await faceapi
      .detectAllFaces(tensor, options)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (!detections || detections.length === 0) {
      throw faceError('NO_FACE');
    }
    if (detections.length > 1) {
      throw faceError('MULTIPLE_FACES', { count: detections.length });
    }

    const det = detections[0];
    const score = det.detection.score;
    const box = det.detection.box;
    const faceSize = Math.min(box.width, box.height);

    if (score < MIN_DETECTION_SCORE() || faceSize < MIN_FACE_SIZE()) {
      throw faceError('LOW_QUALITY', {
        detectionScore: Number(score.toFixed(3)),
        faceSize: Math.round(faceSize),
      });
    }

    return {
      descriptor: Array.from(det.descriptor), // plain JS array (128 floats)
      detectionScore: Number(score.toFixed(4)),
      box: {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
    };
  } finally {
    tensor.dispose();
  }
}

// Euclidean distance between two 128-D descriptors. Lower = more similar.
function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return Infinity;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// Compares a live descriptor against a stored one. Returns the raw distance, a
// 0..1 confidence score (higher = better match) and a boolean decision against
// the configured threshold.
function matchDescriptors(liveDescriptor, storedDescriptor) {
  const distance = euclideanDistance(liveDescriptor, storedDescriptor);
  // Map distance → confidence. Identical faces → ~1.0; unrelated → ~0.
  const score = Math.max(0, Math.min(1, 1 - distance));
  const threshold = MATCH_THRESHOLD();
  return {
    distance: Number(distance.toFixed(4)),
    score: Number(score.toFixed(4)),
    threshold,
    matched: score >= threshold,
  };
}

module.exports = {
  FaceError,
  MESSAGES,
  faceError,
  computeDescriptor,
  matchDescriptors,
  euclideanDistance,
  loadModels,
  getMatchThreshold: MATCH_THRESHOLD,
  isEngineEnabled: ENGINE_ENABLED,
  isReady: () => ENGINE_ENABLED() && modelsPresent(),
  MODELS_PATH,
};
