# Face Recognition Attendance — API & Architecture

Secure, backend-only face verification for punch-in, built into the PunchIn
MERN platform.

## How it works

```
Browser (webcam)                 Node/Express backend                 MongoDB
─────────────────                ────────────────────                 ───────
Capture live JPEG  ──image──▶  faceController / attendanceController
(base64, no                          │
 embedding/score                     ▼
 ever sent)               faceVerificationService
                                     │  enroll / verifyForPunch
                                     ▼
                          faceService  (the ENGINE)
                          @vladmandic/face-api + @tensorflow/tfjs-node
                          detect → 68-landmarks → 128-D descriptor
                                     │
                          euclidean distance vs stored template
                                     │  score = 1 - distance  (0..1)
                                     ▼
                          score ≥ FACE_MATCH_THRESHOLD ?
                            yes → AttendanceLog created   ──▶  attendance
                            no  → FaceError, NO record    ──▶  verificationLogs
                          (every attempt, success or fail) ─▶  verificationLogs
```

**The browser only ever sends a raw image.** All detection, embedding and
matching happens on the server, so the verification cannot be spoofed or
bypassed by a tampered client (Security Requirements #1, #4). A `face` punch
can never create a record unless `faceVerified === true`, enforced both in the
controller and again in `attendanceService.processClockIn` (defence in depth).

## One-time setup

```bash
cd server
npm install                     # installs @tensorflow/tfjs-node + @vladmandic/face-api
npm run download-face-models    # ~16 MB of weights → server/models/
```

If a host cannot run `tfjs-node`, set `FACE_ENGINE_ENABLED=false`; face
punch-ins are then **rejected** (never silently allowed). Other clock-in
methods (qr / nfc / supervisor) are unaffected.

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `FACE_MATCH_THRESHOLD` | `0.6` | Min 1:1 match confidence (0..1) to allow punch-in. Raise toward `0.85` for stricter matching. |
| `FACE_ENGINE_ENABLED` | `true` | `false` disables the engine and rejects face punch-ins. |
| `FACE_MODELS_PATH` | `server/models` | Location of model weights. |
| `FACE_MIN_DETECTION_SCORE` | `0.6` | Detector confidence below this → "image quality too low". |
| `FACE_MIN_FACE_SIZE` | `90` | Min face box size (px); smaller → "image quality too low". |

Score is computed as `score = max(0, 1 - euclideanDistance)`. A genuine match
typically yields a distance of 0.2–0.45 (score 0.55–0.8); unrelated faces sit
above 0.6 distance (score < 0.4). The decision is `score ≥ FACE_MATCH_THRESHOLD`.

## Data model

**BiometricTemplate** (one active per user) — `faceVectorString` (JSON array of
128 floats), `descriptorLength`, `faceImageUrl`, `enrollmentScore`, `enrolledAt`.

**AttendanceLog** — existing, plus `faceMatchScore` (0..1) and `faceVerified`.

**VerificationLog** (append-only audit) — `user_id`, `employeeId`, `purpose`
(`punch_in`|`enrollment`), `verificationScore`, `distance`, `threshold`,
`detectionScore`, `status` (`success`|`failed`), `reason`, `message`, `ip`,
`deviceId`, `createdAt`.

## REST API

All endpoints require a valid JWT (`Authorization: Bearer <token>`).

### `POST /api/face/enroll`
Register / re-register a face. Self-enroll, or HR/superadmin on another worker.

```json
{ "imageBase64": "data:image/jpeg;base64,...", "userId": "<optional ObjectId>" }
```
**201**
```json
{ "enrolled": true, "enrollmentScore": 0.99, "faceImageUrl": "/uploads/faces/...jpg", "enrolledAt": "..." }
```

### `GET /api/face/status` · `GET /api/face/status/:userId`
```json
{ "enrolled": true, "enrolledAt": "...", "faceImageUrl": "...", "enrollmentScore": 0.99, "engineReady": true }
```

### `DELETE /api/face/:userId`  *(HR / superadmin)*
Soft-deletes the template and clears `User.biometricEnrolled`.

### `GET /api/face/logs`  *(supervisor / HR / superadmin)*
Paginated verification audit trail. Query: `userId`, `status`, `purpose`,
`page`, `limit`.

### `POST /api/attendance/clock-in`  *(face verification gate)*
```json
{ "method": "face", "faceImageBase64": "data:image/jpeg;base64,...",
  "siteId": "<optional>", "lat": 12.97, "lng": 77.59 }
```
On a match → **201** `{ "log": { ... }, "faceMatchScore": 0.91 }`.
On failure → no record is created and one of the errors below is returned.

## Error responses

| HTTP | `code` | Message |
|------|--------|---------|
| 422 | `NO_FACE` | No face detected. Please look at the camera and try again. |
| 422 | `MULTIPLE_FACES` | Multiple faces detected. Only one face should be visible. |
| 422 | `NO_MATCH` | Face verification failed. The detected face does not match the registered employee. |
| 422 | `LOW_QUALITY` | Image quality is too low for verification. Please try again. |
| 409 | `NOT_ENROLLED` | No registered face found for this employee. Please complete face enrollment first. |
| 503 | `ENGINE_UNAVAILABLE` | Face recognition engine is not available. Please contact your administrator. |
| 400 | `FACE_IMAGE_REQUIRED` | A live face image is required for face punch-in. |
| 403 | `FACE_NOT_VERIFIED` | Face verification required before clock-in. |

Every one of these is also written to `VerificationLog` with `status: "failed"`.

## Frontend

- **Face Enrollment** (`/face/enroll`) — webcam capture → `POST /face/enroll`.
  HR/superadmin can enroll for a worker via `?userId=<id>` (linked from the
  worker edit form).
- **Clock In** (`/attendance/clock-in`) — captures a live frame, shows a
  "Verifying your face…" progress state, disables the button while in flight,
  and renders success (with match %) or the exact failure message. A
  `NOT_ENROLLED` error links straight to enrollment. Offline punches queue the
  image and are verified on the backend at sync time.
