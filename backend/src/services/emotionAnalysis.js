import { env } from '../config/env.js';

export const FACIAL_EXPRESSIONS = [
  'angry',
  'disgust',
  'fear',
  'happy',
  'neutral',
  'sad',
  'surprise',
];

export const MAX_EMOTION_IMAGE_BYTES = 60 * 1024;
const EMOTION_SERVICE_TIMEOUT_MS = 5000;
const activeEmotionSessions = new Set();

export class InterviewEmotionError extends Error {
  constructor(code, status, diagnostic = null) {
    super('Facial expression detection is unavailable.');
    this.name = 'InterviewEmotionError';
    this.code = code;
    this.status = status;
    this.diagnostic = diagnostic;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateEmotionImage(image) {
  if (
    typeof image !== 'string' ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)
  ) {
    throw new InterviewEmotionError('invalid_image', 400);
  }
  const encodedImage = image.slice(image.indexOf(',') + 1);
  const imageBytes = Buffer.from(encodedImage, 'base64');
  if (
    imageBytes.length === 0 ||
    imageBytes.length > MAX_EMOTION_IMAGE_BYTES ||
    imageBytes.toString('base64') !== encodedImage
  ) {
    throw new InterviewEmotionError('invalid_image', 400);
  }
  return image;
}

export function validateEmotionServiceResponse(value) {
  if (!isRecord(value) || typeof value.success !== 'boolean') {
    throw new InterviewEmotionError('invalid_service_response', 502);
  }
  if (!value.success) {
    if (value.message === 'No face detected') {
      return { outcome: 'ignored', reason: 'NO_FACE' };
    }
    throw new InterviewEmotionError('invalid_service_response', 502);
  }
  if (!Array.isArray(value.emotions)) {
    throw new InterviewEmotionError('invalid_service_response', 502);
  }
  if (value.emotions.length === 0) {
    return { outcome: 'ignored', reason: 'NO_FACE' };
  }
  if (value.emotions.length > 1) {
    return { outcome: 'ignored', reason: 'MULTIPLE_FACES' };
  }

  const detected = value.emotions[0];
  if (
    !isRecord(detected) ||
    !FACIAL_EXPRESSIONS.includes(detected.emotion) ||
    (detected.confidence !== undefined &&
      detected.confidence !== null &&
      (typeof detected.confidence !== 'number' ||
        !Number.isFinite(detected.confidence) ||
        detected.confidence < 0 ||
        detected.confidence > 1))
  ) {
    throw new InterviewEmotionError('invalid_service_response', 502);
  }
  if (
    detected.position !== undefined &&
    (!isRecord(detected.position) ||
      ['x', 'y', 'width', 'height'].some((key) =>
        !Number.isInteger(detected.position[key]) || detected.position[key] < 0,
      ) ||
      detected.position.width === 0 ||
      detected.position.height === 0)
  ) {
    throw new InterviewEmotionError('invalid_service_response', 502);
  }
  return {
    outcome: 'detected',
    emotion: detected.emotion,
    confidence: detected.confidence ?? null,
  };
}

export async function analyzeEmotionImage(
  image,
  {
    serviceUrl = env.emotionServiceUrl,
    timeoutMs = EMOTION_SERVICE_TIMEOUT_MS,
    fetchImpl = fetch,
    signal,
  } = {},
) {
  validateEmotionImage(image);
  const controller = new AbortController();
  const abortFromRequest = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromRequest, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = `${serviceUrl.replace(/\/+$/, '')}/detect-emotion`;

  try {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
        signal: controller.signal,
        redirect: 'error',
      });
    } catch (error) {
      const cancelled = Boolean(signal?.aborted);
      const timedOut = !cancelled && error?.name === 'AbortError';
      throw new InterviewEmotionError(
        cancelled ? 'cancelled' : timedOut ? 'timeout' : 'service_unavailable',
        503,
        cancelled ? 'client_disconnected' : timedOut ? 'timeout' : 'connection_error',
      );
    }

    if (!response.ok) {
      throw new InterviewEmotionError(
        'service_unavailable',
        503,
        `http_${response.status}`,
      );
    }

    let result;
    try {
      result = await response.json();
    } catch {
      throw new InterviewEmotionError('invalid_service_response', 502, 'invalid_json');
    }
    return validateEmotionServiceResponse(result);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromRequest);
  }
}

export async function recordInterviewEmotion(
  prisma,
  {
    sessionId,
    userId,
    image,
    questionIndex,
    signal,
  },
  { analyze = analyzeEmotionImage } = {},
) {
  validateEmotionImage(image);
  if (questionIndex !== undefined &&
    (!Number.isInteger(questionIndex) || questionIndex < 0)) {
    throw new InterviewEmotionError('invalid_question_index', 400);
  }

  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, clerkUserId: userId },
    select: { id: true, status: true },
  });
  if (!session) throw new InterviewEmotionError('session_not_found', 404);
  if (session.status !== 'IN_PROGRESS') {
    throw new InterviewEmotionError('session_not_active', 409);
  }

  if (questionIndex !== undefined) {
    const answer = await prisma.interviewAnswer.findUnique({
      where: { sessionId_questionIndex: { sessionId, questionIndex } },
      select: { id: true },
    });
    if (!answer) throw new InterviewEmotionError('invalid_question_index', 400);
  }

  if (activeEmotionSessions.has(sessionId)) {
    throw new InterviewEmotionError('request_in_progress', 429);
  }
  activeEmotionSessions.add(sessionId);

  try {
    let detection;
    try {
      detection = await analyze(image, { signal });
    } catch (error) {
      if (error instanceof InterviewEmotionError) throw error;
      throw new InterviewEmotionError('service_unavailable', 503, 'analysis_error');
    }
    if (signal?.aborted) {
      throw new InterviewEmotionError('cancelled', 503, 'client_disconnected');
    }
    if (detection.outcome === 'ignored') {
      return { observation: null, reason: detection.reason };
    }

    try {
      return await prisma.$transaction(async (transaction) => {
        if (signal?.aborted) {
          throw new InterviewEmotionError('cancelled', 503, 'client_disconnected');
        }
        const currentSession = await transaction.interviewSession.findFirst({
          where: { id: sessionId, clerkUserId: userId },
          select: { id: true, status: true },
        });
        if (!currentSession) throw new InterviewEmotionError('session_not_found', 404);
        if (currentSession.status !== 'IN_PROGRESS') {
          throw new InterviewEmotionError('session_not_active', 409);
        }

        if (questionIndex !== undefined) {
          const answer = await transaction.interviewAnswer.findUnique({
            where: { sessionId_questionIndex: { sessionId, questionIndex } },
            select: { id: true },
          });
          if (!answer) throw new InterviewEmotionError('invalid_question_index', 400);
        }
        if (signal?.aborted) {
          throw new InterviewEmotionError('cancelled', 503, 'client_disconnected');
        }

        const observation = await transaction.interviewEmotion.create({
          data: {
            sessionId,
            emotion: detection.emotion,
            confidence: detection.confidence,
            questionIndex: questionIndex ?? null,
          },
          select: {
            id: true,
            sessionId: true,
            timestamp: true,
            emotion: true,
            confidence: true,
            questionIndex: true,
          },
        });
        return { observation, reason: null };
      });
    } catch (error) {
      if (error instanceof InterviewEmotionError) throw error;
      throw new InterviewEmotionError('persistence_failed', 500);
    }
  } finally {
    activeEmotionSessions.delete(sessionId);
  }
}
