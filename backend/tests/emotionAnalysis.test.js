import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeEmotionImage,
  InterviewEmotionError,
  recordInterviewEmotion,
  validateEmotionImage,
  validateEmotionServiceResponse,
} from '../src/services/emotionAnalysis.js';

const image = 'data:image/jpeg;base64,/9j/2Q==';
const activeSession = { id: 'session-1', status: 'IN_PROGRESS' };
const detectedResponse = {
  success: true,
  emotions: [{
    emotion: 'happy',
    confidence: 0.91,
    position: { x: 2, y: 3, width: 48, height: 48 },
  }],
};

test('validates JPEG data URLs and enforces the encoded image size limit', () => {
  assert.equal(validateEmotionImage(image), image);
  assert.throws(
    () => validateEmotionImage('data:image/png;base64,aGVsbG8='),
    (error) => error instanceof InterviewEmotionError && error.status === 400,
  );
  assert.throws(
    () => validateEmotionImage(`data:image/jpeg;base64,${Buffer.alloc(61 * 1024).toString('base64')}`),
    (error) => error instanceof InterviewEmotionError && error.status === 400,
  );
});

test('accepts a valid single-face detection', () => {
  assert.deepEqual(validateEmotionServiceResponse(detectedResponse), {
    outcome: 'detected',
    emotion: 'happy',
    confidence: 0.91,
  });
});

test('ignores no-face and multiple-face results', () => {
  assert.deepEqual(validateEmotionServiceResponse({
    success: false,
    message: 'No face detected',
  }), { outcome: 'ignored', reason: 'NO_FACE' });
  assert.deepEqual(validateEmotionServiceResponse({
    success: true,
    emotions: [detectedResponse.emotions[0], detectedResponse.emotions[0]],
  }), { outcome: 'ignored', reason: 'MULTIPLE_FACES' });
});

test('rejects unsupported labels, invalid confidence, and malformed service data', () => {
  assert.throws(
    () => validateEmotionServiceResponse({
      success: true,
      emotions: [{ emotion: 'confused', confidence: 0.5 }],
    }),
    (error) => error instanceof InterviewEmotionError && error.code === 'invalid_service_response',
  );
  for (const confidence of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1, '0.5']) {
    assert.throws(
      () => validateEmotionServiceResponse({
        success: true,
        emotions: [{ emotion: 'happy', confidence }],
      }),
      (error) => error instanceof InterviewEmotionError && error.code === 'invalid_service_response',
    );
  }
  assert.throws(
    () => validateEmotionServiceResponse({ success: true, emotions: 'happy' }),
    (error) => error instanceof InterviewEmotionError && error.code === 'invalid_service_response',
  );
});

test('maps service timeout, unavailable, HTTP error, and invalid JSON to safe errors', async () => {
  await assert.rejects(
    analyzeEmotionImage(image, {
      timeoutMs: 5,
      fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    }),
    (error) => error instanceof InterviewEmotionError && error.code === 'timeout',
  );
  await assert.rejects(
    analyzeEmotionImage(image, {
      fetchImpl: async () => { throw new TypeError('connection refused'); },
    }),
    (error) => error instanceof InterviewEmotionError && error.code === 'service_unavailable',
  );
  await assert.rejects(
    analyzeEmotionImage(image, {
      fetchImpl: async () => ({ ok: false, status: 500 }),
    }),
    (error) => error instanceof InterviewEmotionError && error.status === 503,
  );
  await assert.rejects(
    analyzeEmotionImage(image, {
      fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } }),
    }),
    (error) => error instanceof InterviewEmotionError && error.code === 'invalid_service_response',
  );
});

function createPrisma({ status = 'IN_PROGRESS', owned = true, questionExists = true } = {}) {
  const observations = [];
  const sessionLookup = async ({ where }) =>
    owned && where.id === 'session-1' && where.clerkUserId === 'user-1'
      ? { ...activeSession, status }
      : null;
  const answerLookup = async () => questionExists ? { id: 'answer-1' } : null;
  const transaction = {
    interviewSession: { findFirst: sessionLookup },
    interviewAnswer: { findUnique: answerLookup },
    interviewEmotion: {
      create: async ({ data }) => {
        const observation = {
          id: 'emotion-1',
          timestamp: new Date('2026-10-07T00:00:00.000Z'),
          ...data,
        };
        observations.push(observation);
        return observation;
      },
    },
  };
  return {
    observations,
    interviewSession: { findFirst: sessionLookup },
    interviewAnswer: { findUnique: answerLookup },
    $transaction: async (callback) => callback(transaction),
  };
}

const identityAnalysis = async () => ({
  outcome: 'detected',
  emotion: 'happy',
  confidence: 0.91,
});

test('verifies session ownership and active status before inference', async () => {
  const wrongOwner = createPrisma({ owned: false });
  await assert.rejects(
    recordInterviewEmotion(wrongOwner, {
      sessionId: 'session-1',
      userId: 'user-1',
      image,
    }, { analyze: identityAnalysis }),
    (error) => error instanceof InterviewEmotionError && error.status === 404,
  );

  const completed = createPrisma({ status: 'COMPLETED' });
  await assert.rejects(
    recordInterviewEmotion(completed, {
      sessionId: 'session-1',
      userId: 'user-1',
      image,
    }, { analyze: identityAnalysis }),
    (error) => error instanceof InterviewEmotionError && error.status === 409,
  );

  const noQuestion = createPrisma({ questionExists: false });
  await assert.rejects(
    recordInterviewEmotion(noQuestion, {
      sessionId: 'session-1',
      userId: 'user-1',
      image,
      questionIndex: 4,
    }, { analyze: identityAnalysis }),
    (error) => error instanceof InterviewEmotionError && error.status === 400,
  );
});

test('persists only a validated emotion observation associated with the active question', async () => {
  const prisma = createPrisma();
  const result = await recordInterviewEmotion(prisma, {
    sessionId: 'session-1',
    userId: 'user-1',
    image,
    questionIndex: 2,
  }, { analyze: identityAnalysis });

  assert.equal(result.observation.emotion, 'happy');
  assert.equal(result.observation.confidence, 0.91);
  assert.equal(result.observation.questionIndex, 2);
  assert.equal(prisma.observations.length, 1);
  assert.equal('image' in prisma.observations[0], false);
});

test('does not persist missing-face or ambiguous-face observations', async () => {
  for (const reason of ['NO_FACE', 'MULTIPLE_FACES']) {
    const prisma = createPrisma();
    const result = await recordInterviewEmotion(prisma, {
      sessionId: 'session-1',
      userId: 'user-1',
      image,
    }, {
      analyze: async () => ({ outcome: 'ignored', reason }),
    });
    assert.equal(result.observation, null);
    assert.equal(prisma.observations.length, 0);
  }
});

test('allows only one in-flight emotion request per session', async () => {
  const prisma = createPrisma();
  let releaseAnalysis;
  const pendingAnalysis = new Promise((resolve) => {
    releaseAnalysis = resolve;
  });
  const firstRequest = recordInterviewEmotion(prisma, {
    sessionId: 'session-1',
    userId: 'user-1',
    image,
  }, { analyze: () => pendingAnalysis });
  await new Promise((resolve) => setImmediate(resolve));

  await assert.rejects(
    recordInterviewEmotion(prisma, {
      sessionId: 'session-1',
      userId: 'user-1',
      image,
    }, { analyze: identityAnalysis }),
    (error) => error instanceof InterviewEmotionError && error.status === 429,
  );

  releaseAnalysis({
    outcome: 'detected',
    emotion: 'happy',
    confidence: 0.91,
  });
  await firstRequest;
});
