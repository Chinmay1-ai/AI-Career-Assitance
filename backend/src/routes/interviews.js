import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireClerkAuth } from '../middleware/requireClerkAuth.js';
import {
  DEFAULT_INTERVIEW_QUESTIONS,
  INTERVIEW_DIFFICULTIES,
  INTERVIEW_ROLES,
  INTERVIEW_TECHNOLOGIES,
  MAX_INTERVIEW_QUESTIONS,
  validateInterviewInput,
} from '../services/interviewQuestionBank.js';
import {
  createInterviewQuestionSet,
  getOwnedInterviewResumeContext,
  INTERVIEW_QUESTION_MODES,
  InterviewQuestionSetUnavailableError,
} from '../services/interviewQuestionGeneration.js';
import {
  InterviewEmotionError,
  recordInterviewEmotion,
} from '../services/emotionAnalysis.js';
import {
  evaluateInterviewAnswer,
  findOwnedInterviewReport,
} from '../services/interviewEvaluation.js';
import { createInterviewSessionRecord } from '../services/interviewSession.js';

const router = Router();
router.use(requireClerkAuth);

function toSessionResponse(session, { includeReferenceAnswers = false } = {}) {
  return {
    id: session.id,
    selectedRole: session.selectedRole,
    technology: session.technology,
    difficulty: session.difficulty,
    questionSource: session.questionSource,
    status: session.status,
    currentQuestionIndex: session.currentQuestionIndex,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    questions: session.answers.map((answer) => ({
      questionIndex: answer.questionIndex,
      questionText: answer.questionText,
      ...(includeReferenceAnswers ? { referenceAnswer: answer.referenceAnswer } : {}),
      transcriptAnswer: answer.transcriptAnswer,
      feedback: answer.feedback,
      rating: answer.rating,
      submittedAt: answer.submittedAt,
    })),
  };
}

async function findOwnedSession(sessionId, clerkUserId, { includeEmotions = false } = {}) {
  return prisma.interviewSession.findFirst({
    where: { id: sessionId, clerkUserId },
    include: {
      answers: { orderBy: { questionIndex: 'asc' } },
      ...(includeEmotions
        ? { emotions: { orderBy: { timestamp: 'asc' } } }
        : {}),
    },
  });
}

router.get('/options', (_req, res) => {
  res.json({
    roles: INTERVIEW_ROLES,
    technologies: INTERVIEW_TECHNOLOGIES,
    difficulties: INTERVIEW_DIFFICULTIES,
    defaultQuestionCount: DEFAULT_INTERVIEW_QUESTIONS,
    maxQuestionCount: MAX_INTERVIEW_QUESTIONS,
  });
});

router.get('/', async (req, res) => {
  try {
    const sessions = await prisma.interviewSession.findMany({
      where: { clerkUserId: req.auth.userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { answers: true } } },
    });
    res.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        selectedRole: session.selectedRole,
        technology: session.technology,
        difficulty: session.difficulty,
        questionSource: session.questionSource,
        status: session.status,
        questionCount: session._count.answers,
        currentQuestionIndex: session.currentQuestionIndex,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        createdAt: session.createdAt,
      })),
    });
  } catch (error) {
    console.error('Interview session list failed:', error);
    res.status(500).json({ error: 'Could not load interview sessions.' });
  }
});

router.post('/', async (req, res) => {
  const validation = validateInterviewInput(req.body);
  if (validation.errors) {
    res.status(400).json({ error: 'Interview setup is invalid.', fields: validation.errors });
    return;
  }

  const resumeId = req.body?.resumeId;
  if (
    resumeId !== undefined &&
    (typeof resumeId !== 'string' || !resumeId.trim() || resumeId.length > 100)
  ) {
    res.status(400).json({ error: 'Provide a valid resume ID.' });
    return;
  }

  const questionMode = req.body?.questionMode ?? 'AI';
  if (
    typeof questionMode !== 'string' ||
    !INTERVIEW_QUESTION_MODES.includes(questionMode)
  ) {
    res.status(400).json({ error: 'Choose AI or local interview questions.' });
    return;
  }

  const { selectedRole, technology, difficulty, questionCount } = validation.value;
  let resumeContext = null;
  if (resumeId !== undefined) {
    let resumeResult;
    try {
      resumeResult = await getOwnedInterviewResumeContext(
        prisma,
        resumeId.trim(),
        req.auth.userId,
        selectedRole,
      );
    } catch (error) {
      console.error('Interview resume context lookup failed:', {
        phase: 'resume_lookup',
        classification: 'database_error',
      });
      res.status(500).json({ error: 'Could not load resume context for this interview.' });
      return;
    }
    if (!resumeResult.found) {
      res.status(404).json({ error: 'Resume not found.' });
      return;
    }
    resumeContext = resumeResult.context;
    if (resumeResult.hasAnalysis && !resumeContext) {
      console.warn('Interview resume context omitted:', {
        phase: 'resume_context_validation',
        classification: 'invalid_saved_context',
      });
    }
  }

  let questionSet;
  try {
    questionSet = await createInterviewQuestionSet(
      { selectedRole, technology, difficulty, questionCount },
      resumeContext,
      { mode: questionMode },
    );
    if (questionSet.diagnostic) {
      console.warn('Interview question generation used local fallback:', questionSet.diagnostic);
    }
  } catch (error) {
    if (error instanceof InterviewQuestionSetUnavailableError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    console.error('Interview question selection failed:', {
      phase: 'question_set_creation',
      classification: 'local_question_bank_error',
    });
    res.status(500).json({ error: 'Could not select interview questions.' });
    return;
  }

  try {
    const session = await createInterviewSessionRecord(
      prisma,
      req.auth.userId,
      { selectedRole, technology, difficulty },
      questionSet,
    );

    res.status(201).json({ session: toSessionResponse(session) });
  } catch (error) {
    console.error('Interview session creation failed:', error);
    res.status(500).json({ error: 'Could not create the interview session.' });
  }
});

router.post('/:sessionId/emotions', async (req, res) => {
  if (
    req.body === null ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((key) => !['image', 'questionIndex'].includes(key)) ||
    Buffer.byteLength(JSON.stringify(req.body), 'utf8') > 90 * 1024
  ) {
    res.status(413).json({ error: 'Emotion frame request is invalid or too large.' });
    return;
  }

  const controller = new AbortController();
  const abortOnDisconnect = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.once('close', abortOnDisconnect);
  try {
    const result = await recordInterviewEmotion(prisma, {
      sessionId: req.params.sessionId,
      userId: req.auth.userId,
      image: req.body.image,
      questionIndex: req.body.questionIndex,
      signal: controller.signal,
    });
    res.json(result);
  } catch (error) {
    if (res.destroyed) return;
    if (error instanceof InterviewEmotionError) {
      if (error.status === 503 || error.status === 502) {
        console.warn('Interview facial-expression detection skipped:', {
          phase: 'emotion_service',
          classification: error.diagnostic ?? error.code,
          status: error.status,
        });
        res.status(503).json({
          error: 'Facial expression detection is temporarily unavailable.',
        });
        return;
      }
      res.status(error.status).json({
        error: error.status === 404
          ? 'Interview session not found.'
          : error.status === 409
            ? 'This interview session is no longer active.'
            : error.status === 400
              ? 'Emotion frame request is invalid.'
              : 'Facial expression detection is unavailable.',
      });
      return;
    }
    console.error('Interview emotion persistence failed:', {
      phase: 'emotion_observation',
      classification: 'unexpected_error',
    });
    res.status(500).json({
      error: 'Facial expression detection is temporarily unavailable.',
    });
  } finally {
    res.removeListener('close', abortOnDisconnect);
  }
});

router.get('/:sessionId', async (req, res) => {
  try {
    const session = await findOwnedSession(req.params.sessionId, req.auth.userId);
    if (!session) {
      res.status(404).json({ error: 'Interview session not found.' });
      return;
    }
    res.json({ session: toSessionResponse(session) });
  } catch (error) {
    console.error('Interview session lookup failed:', error);
    res.status(500).json({ error: 'Could not load the interview session.' });
  }
});

router.get('/:sessionId/questions', async (req, res) => {
  try {
    const session = await findOwnedSession(req.params.sessionId, req.auth.userId);
    if (!session) {
      res.status(404).json({ error: 'Interview session not found.' });
      return;
    }
    res.json({
      sessionId: session.id,
      status: session.status,
      questionSource: session.questionSource,
      currentQuestionIndex: session.currentQuestionIndex,
      questions: toSessionResponse(session).questions,
    });
  } catch (error) {
    console.error('Interview questions lookup failed:', error);
    res.status(500).json({ error: 'Could not load interview questions.' });
  }
});

router.post('/:sessionId/answers', async (req, res) => {
  const questionIndex = req.body?.questionIndex;
  const requestedCurrentQuestionIndex = req.body?.currentQuestionIndex;
  if (!Number.isInteger(questionIndex) || questionIndex < 0) {
    res.status(400).json({ error: 'Provide a valid question index.' });
    return;
  }
  if (typeof req.body?.transcriptAnswer !== 'string') {
    res.status(400).json({ error: 'Answer must be text.' });
    return;
  }
  const transcriptAnswer = req.body.transcriptAnswer.trim();
  if (transcriptAnswer.length > 20000) {
    res.status(400).json({ error: 'Answer must contain at most 20,000 characters.' });
    return;
  }
  if (
    requestedCurrentQuestionIndex !== undefined &&
    (!Number.isInteger(requestedCurrentQuestionIndex) || requestedCurrentQuestionIndex < 0)
  ) {
    res.status(400).json({ error: 'Provide a valid current question index.' });
    return;
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const session = await transaction.interviewSession.findFirst({
        where: { id: req.params.sessionId, clerkUserId: req.auth.userId },
        select: {
          id: true,
          status: true,
          currentQuestionIndex: true,
          _count: { select: { answers: true } },
        },
      });
      if (!session) return { kind: 'not-found' };
      if (session.status !== 'IN_PROGRESS') return { kind: 'completed' };

      const answer = await transaction.interviewAnswer.findUnique({
        where: { sessionId_questionIndex: { sessionId: session.id, questionIndex } },
        select: { id: true },
      });
      if (!answer) return { kind: 'invalid-question' };
      if (
        requestedCurrentQuestionIndex !== undefined &&
        requestedCurrentQuestionIndex >= session._count.answers
      ) {
        return { kind: 'invalid-question' };
      }

      const submittedAt = transcriptAnswer ? new Date() : null;
      const updatedAnswer = await transaction.interviewAnswer.update({
        where: { id: answer.id },
        data: { transcriptAnswer: transcriptAnswer || null, submittedAt },
        select: {
          questionIndex: true,
          questionText: true,
          transcriptAnswer: true,
          submittedAt: true,
        },
      });
      await transaction.interviewSession.update({
        where: { id: session.id },
        data: {
          currentQuestionIndex:
            requestedCurrentQuestionIndex ??
            Math.min(questionIndex + 1, session._count.answers - 1),
        },
      });
      return { kind: 'saved', answer: updatedAnswer };
    });

    if (result.kind === 'not-found') {
      res.status(404).json({ error: 'Interview session not found.' });
    } else if (result.kind === 'completed') {
      res.status(409).json({ error: 'This interview session is already complete.' });
    } else if (result.kind === 'invalid-question') {
      res.status(400).json({ error: 'Question does not belong to this interview session.' });
    } else {
      res.json({ answer: result.answer });
    }
  } catch (error) {
    console.error('Interview answer submission failed:', error);
    res.status(500).json({ error: 'Could not save the interview answer.' });
  }
});

router.post('/:sessionId/complete', async (req, res) => {
  try {
    const session = await prisma.$transaction(async (transaction) => {
      const ownedSession = await transaction.interviewSession.findFirst({
        where: { id: req.params.sessionId, clerkUserId: req.auth.userId },
        include: { answers: { orderBy: { questionIndex: 'asc' } } },
      });
      if (!ownedSession) return null;

      for (const answer of ownedSession.answers) {
        await transaction.interviewAnswer.update({
          where: { id: answer.id },
          data: { evaluation: evaluateInterviewAnswer(answer) },
        });
      }

      return transaction.interviewSession.update({
        where: { id: ownedSession.id },
        data: ownedSession.status === 'COMPLETED'
          ? {}
          : { status: 'COMPLETED', completedAt: new Date() },
        include: { answers: { orderBy: { questionIndex: 'asc' } } },
      });
    });

    if (!session) {
      res.status(404).json({ error: 'Interview session not found.' });
      return;
    }
    res.json({ session: toSessionResponse(session) });
  } catch (error) {
    console.error('Interview completion failed:', error);
    res.status(500).json({ error: 'Could not complete the interview session.' });
  }
});

router.get('/:sessionId/report', async (req, res) => {
  try {
    const report = await findOwnedInterviewReport(
      prisma,
      req.params.sessionId,
      req.auth.userId,
    );
    if (!report) {
      res.status(404).json({ error: 'Interview session not found.' });
      return;
    }
    res.json({ report });
  } catch (error) {
    console.error('Interview performance report failed:', error);
    res.status(500).json({ error: 'Could not load the interview performance report.' });
  }
});

router.get('/:sessionId/results', async (req, res) => {
  try {
    const session = await findOwnedSession(
      req.params.sessionId,
      req.auth.userId,
      { includeEmotions: true },
    );
    if (!session) {
      res.status(404).json({ error: 'Interview session not found.' });
      return;
    }
    const answers = toSessionResponse(session, { includeReferenceAnswers: true }).questions;
    res.json({
      session: {
        id: session.id,
        selectedRole: session.selectedRole,
        technology: session.technology,
        difficulty: session.difficulty,
        questionSource: session.questionSource,
        status: session.status,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
      },
      summary: {
        totalQuestions: answers.length,
        answeredQuestions: answers.filter((answer) => answer.transcriptAnswer).length,
      },
      answers,
      emotionObservations: session.emotions.map((observation) => ({
        timestamp: observation.timestamp,
        emotion: observation.emotion,
        confidence: observation.confidence,
        questionIndex: observation.questionIndex,
      })),
    });
  } catch (error) {
    console.error('Interview results lookup failed:', error);
    res.status(500).json({ error: 'Could not load interview results.' });
  }
});

export default router;
