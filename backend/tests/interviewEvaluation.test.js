import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInterviewReport,
  evaluateInterviewAnswer,
  findOwnedInterviewReport,
} from '../src/services/interviewEvaluation.js';

const strongAnswer = {
  questionText: 'How do you investigate a slow Node.js API?',
  referenceAnswer: 'Measure event-loop delay, inspect blocking work, and profile the hot path.',
  transcriptAnswer: 'I measure event-loop delay first. Then I inspect blocking work and profile the hot path to identify what is slowing the Node.js API.',
};

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    selectedRole: 'Backend Developer',
    technology: 'Node.js',
    difficulty: 'INTERMEDIATE',
    status: 'COMPLETED',
    startedAt: new Date('2026-10-08T10:00:00.000Z'),
    completedAt: new Date('2026-10-08T10:30:00.000Z'),
    answers: [{ questionIndex: 0, ...strongAnswer }],
    emotions: [],
    ...overrides,
  };
}

test('scores a detailed technical answer with broad reference concept coverage', () => {
  const evaluation = evaluateInterviewAnswer(strongAnswer);
  assert.equal(evaluation.evaluationType, 'rule-based answer evaluation');
  assert.ok(evaluation.score >= 70);
  assert.ok(evaluation.matchedKeywords.includes('event-loop'));
  assert.ok(evaluation.matchedKeywords.includes('blocking'));
  assert.ok(evaluation.missingKeywords.length < 3);
});

test('scores empty and short transcripts as needing more answer detail', () => {
  for (const transcriptAnswer of ['', '   ', 'Yes.']) {
    const evaluation = evaluateInterviewAnswer({
      transcriptAnswer,
      referenceAnswer: strongAnswer.referenceAnswer,
    });
    assert.equal(evaluation.score < 50, true);
    assert.equal(evaluation.quality, 'Needs Improvement');
    assert.ok(evaluation.weaknesses.length > 0);
  }
});

test('scores a long but technically unrelated answer weakly', () => {
  const evaluation = evaluateInterviewAnswer({
    transcriptAnswer: 'I enjoy working with people and planning thoughtful projects. I communicate clearly and learn every day by asking good questions.',
    referenceAnswer: strongAnswer.referenceAnswer,
  });
  assert.ok(evaluation.score < 50);
  assert.equal(evaluation.matchedKeywords.length, 0);
});

test('reports partial reference keyword coverage deterministically', () => {
  const evaluation = evaluateInterviewAnswer({
    transcriptAnswer: 'Measure event-loop delay and inspect it carefully.',
    referenceAnswer: 'Measure event-loop delay, inspect blocking work, and profile the hot path.',
  });
  assert.ok(evaluation.matchedKeywords.length > 0);
  assert.ok(evaluation.missingKeywords.length > 0);
  assert.ok(evaluation.metrics.keywordCoverage > 0);
  assert.ok(evaluation.metrics.keywordCoverage < 100);
});

test('reports no matching keywords when a meaningful reference has no observed overlap', () => {
  const evaluation = evaluateInterviewAnswer({
    transcriptAnswer: 'A complete but unrelated response with several words.',
    referenceAnswer: strongAnswer.referenceAnswer,
  });
  assert.deepEqual(evaluation.matchedKeywords, []);
  assert.ok(evaluation.missingKeywords.length > 0);
  assert.equal(evaluation.metrics.keywordCoverage, 0);
});

test('treats references without meaningful keywords as unavailable for coverage', () => {
  const evaluation = evaluateInterviewAnswer({
    transcriptAnswer: 'A complete but unrelated response with several words.',
    referenceAnswer: 'The and is to',
  });
  assert.deepEqual(evaluation.matchedKeywords, []);
  assert.deepEqual(evaluation.missingKeywords, []);
  assert.equal(evaluation.metrics.keywordCoverage, null);
});

test('summarizes multiple saved emotion observations with cautious wording', () => {
  const report = buildInterviewReport(makeSession({
    emotions: [
      { emotion: 'sad', confidence: 0.8, questionIndex: 0 },
      { emotion: 'happy', confidence: 0.6, questionIndex: 0 },
      { emotion: 'sad', confidence: 1, questionIndex: 0 },
      { emotion: 'neutral', confidence: null, questionIndex: null },
    ],
  }));
  assert.equal(report.facialExpressionSummary.detectionCount, 4);
  assert.equal(report.facialExpressionSummary.mostFrequentDetectedExpression, 'sad');
  assert.equal(report.facialExpressionSummary.averageConfidence, 80);
  assert.equal(report.facialExpressionSummary.perQuestionObservations[0].detectionCount, 3);
  assert.match(report.facialExpressionSummary.basis, /not a definitive measurement/);
});

test('reports empty facial-expression observations without a fabricated expression', () => {
  const summary = buildInterviewReport(makeSession()).facialExpressionSummary;
  assert.equal(summary.detectionCount, 0);
  assert.equal(summary.mostFrequentDetectedExpression, null);
  assert.equal(summary.averageConfidence, null);
  assert.deepEqual(summary.perQuestionObservations, []);
});

test('does not return a report for a missing or wrong-user session', async () => {
  let query;
  const report = await findOwnedInterviewReport({
    interviewSession: {
      findFirst: async (args) => {
        query = args;
        return null;
      },
    },
  }, 'session-1', 'another-user');
  assert.equal(report, null);
  assert.deepEqual(query.where, { id: 'session-1', clerkUserId: 'another-user' });
});

test('marks reports for incomplete interviews and counts unanswered questions', () => {
  const report = buildInterviewReport(makeSession({
    status: 'IN_PROGRESS',
    completedAt: null,
    answers: [
      { questionIndex: 0, ...strongAnswer },
      { questionIndex: 1, questionText: 'Explain a database index.', referenceAnswer: 'An index speeds up database lookups.', transcriptAnswer: null },
    ],
  }));
  assert.equal(report.interview.isComplete, false);
  assert.equal(report.interview.answeredQuestions, 1);
  assert.equal(report.answerPerformance.unansweredQuestions, 1);
  assert.equal(report.overallScore, report.answers[0].evaluation.score);
});

test('builds a complete report with scores and a result for each saved answer', () => {
  const session = makeSession({
    answers: [
      { questionIndex: 0, ...strongAnswer },
      {
        questionIndex: 1,
        questionText: 'What does a cache do?',
        referenceAnswer: 'A cache stores frequently used data to reduce repeated work.',
        transcriptAnswer: 'A cache stores frequently used data so repeated work can be reduced.',
      },
    ],
  });
  const report = buildInterviewReport(session);
  assert.equal(report.interview.isComplete, true);
  assert.equal(report.interview.questionCount, 2);
  assert.equal(report.interview.answeredQuestions, 2);
  assert.equal(report.answers.length, 2);
  assert.equal(report.answerPerformance.averageScore, report.overallScore);
  assert.equal(report.technicalPerformance.available, true);
  assert.equal(report.answers[0].evaluation.evaluationType, 'rule-based answer evaluation');
});
