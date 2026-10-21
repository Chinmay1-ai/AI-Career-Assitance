import base64
import binascii
import logging
import os
import re
import threading
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
from flask import Flask, jsonify, request
from tensorflow.keras.models import load_model
from werkzeug.exceptions import HTTPException

SERVICE_ROOT = Path(__file__).resolve().parent
MODEL_ROOT = SERVICE_ROOT / "model"
MODEL_PATH = MODEL_ROOT / "emotion_model_best.h5"
CASCADE_PATH = MODEL_ROOT / "haarcascade_frontalface_default.xml"
MAX_IMAGE_BYTES = 60 * 1024
LABELS = {
    0: "angry",
    1: "disgust",
    2: "fear",
    3: "happy",
    4: "neutral",
    5: "sad",
    6: "surprise",
}
IMAGE_PATTERN = re.compile(r"^data:image/jpeg;base64,([A-Za-z0-9+/]+={0,2})$")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("emotion-service")
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024
model_lock = threading.Lock()

if not MODEL_PATH.is_file() or not CASCADE_PATH.is_file():
    raise RuntimeError("Emotion model assets are missing.")

tf.get_logger().setLevel("ERROR")
model = load_model(str(MODEL_PATH), compile=False)
face_detector = cv2.CascadeClassifier(str(CASCADE_PATH))
if face_detector.empty():
    raise RuntimeError("Face detector failed to load.")


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"success": False, "error": "Image request is too large."}), 413


@app.errorhandler(Exception)
def unexpected_error(error):
    if isinstance(error, HTTPException):
        return jsonify({"success": False, "error": "Emotion request failed."}), error.code
    logger.warning("Emotion request failed unexpectedly.")
    return jsonify({"success": False, "error": "Facial expression detection failed."}), 500


@app.post("/detect-emotion")
def detect_emotion():
    data = request.get_json(silent=True)
    image_data = data.get("image") if isinstance(data, dict) else None
    match = IMAGE_PATTERN.fullmatch(image_data) if isinstance(image_data, str) else None
    if match is None:
        return jsonify({"success": False, "error": "A JPEG data URL is required."}), 400

    try:
        image_bytes = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return jsonify({"success": False, "error": "The JPEG data URL is invalid."}), 400

    if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
        return jsonify({"success": False, "error": "Image request is invalid."}), 400

    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if frame is None:
        return jsonify({"success": False, "error": "The JPEG could not be decoded."}), 400
    if frame.shape[0] * frame.shape[1] > 1920 * 1080:
        return jsonify({"success": False, "error": "Image dimensions are too large."}), 400

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_detector.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=4,
        minSize=(30, 30),
    )
    if len(faces) == 0:
        return jsonify({"success": False, "message": "No face detected"})

    try:
        face_images = np.asarray(
            [
                cv2.resize(gray[y : y + height, x : x + width], (48, 48)) / 255.0
                for x, y, width, height in faces
            ],
            dtype=np.float32,
        ).reshape(len(faces), 48, 48, 1)
        with model_lock:
            results = model.predict(face_images, verbose=0)
    except Exception:
        logger.warning("Facial expression inference failed.")
        return jsonify({"success": False, "error": "Facial expression detection failed."}), 500

    emotions = []
    for index, (x, y, width, height) in enumerate(faces):
        scores = results[index]
        emotion_index = int(np.argmax(scores))
        confidence = float(scores[emotion_index])
        if (
            emotion_index not in LABELS
            or not np.isfinite(confidence)
            or confidence < 0
            or confidence > 1
        ):
            logger.warning("Facial expression model returned invalid output.")
            return jsonify({"success": False, "error": "Facial expression detection failed."}), 500

        emotions.append(
            {
                "emotion": LABELS[emotion_index],
                "confidence": confidence,
                "position": {
                    "x": int(x),
                    "y": int(y),
                    "width": int(width),
                    "height": int(height),
                },
            }
        )

    return jsonify({"success": True, "emotions": emotions})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
