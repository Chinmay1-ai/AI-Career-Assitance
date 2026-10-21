const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'being', 'but', 'by', 'can', 'could', 'did', 'do',
  'does', 'each', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'here',
  'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'may',
  'me', 'more', 'most', 'my', 'no', 'not', 'of', 'on', 'once', 'one', 'onto',
  'or', 'our', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some',
  'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'using', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
]);

const QUALITY_LEVELS = ['Excellent', 'Good', 'Fair', 'Needs Improvement'];

function tokenize(text) {
  return (text.toLocaleLowerCase().match(/c\+\+|c#|\.net|node\.js|[a-z0-9][a-z0-9+#.-]*/g) ?? [])
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function unique(items) {
  return [...new Set(items)];
}

function sentenceCount(text) {
  return (text.match(/[.!?]+(?=\s|$)/g) ?? []).length || (text.trim() ? 1 : 0);
}

function qualityForScore(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs Improvement';
}

function round(value) {
  return Math.round(value * 10) / 10;
}

export function evaluateInterviewAnswer({ transcriptAnswer, referenceAnswer }) {
  const transcript = typeof transcriptAnswer === 'string' ? transcriptAnswer.trim() : '';
  const reference = typeof referenceAnswer === 'string' ? referenceAnswer.trim() : '';
  const answerTerms = tokenize(transcript);
  const referenceTerms = unique(tokenize(reference));
  const answerTermSet = new Set(answerTerms);
  const matchedKeywords = referenceTerms.filter((term) => answerTermSet.has(term));
  const missingKeywords = referenceTerms.filter((term) => !answerTermSet.has(term));
  const words = transcript ? transcript.match(/\S+/g) ?? [] : [];
  const sentences = sentenceCount(transcript);
  const repetitionRatio = answerTerms.length
    ? 1 - new Set(answerTerms).size / answerTerms.length
    : 0;
  const keywordCoverage = referenceTerms.length
    ? matchedKeywords.length / referenceTerms.length
    : null;
  const overlap = referenceTerms.length
    ? matchedKeywords.length / new Set([...referenceTerms, ...answerTerms]).size
    : null;
  const completenessScore = transcript
    ? round((keywordCoverage ?? 0.5) * 100)
    : 0;

  let score = 0;
  if (transcript) score += 10;
  if (words.length >= 15) score += 20;
  else if (words.length >= 8) score += 12;
  else if (words.length >= 4) score += 7;
  else if (words.length > 0) score += 3;
  score += keywordCoverage === null ? 17.5 : 35 * keywordCoverage;
  score += overlap === null ? 10 : 20 * overlap;
  score += transcript ? 10 * (keywordCoverage ?? 0.5) : 0;
  if (sentences >= 2 && words.length >= 8) score += 5;
  else if (transcript && words.length >= 8) score += 3;
  if (repetitionRatio > 0.3) score -= Math.min(10, (repetitionRatio - 0.3) * 25);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (!transcript) {
    weaknesses.push('No transcript was submitted for this question.');
    suggestions.push('Submit a response before drawing conclusions from this answer.');
  } else {
    if (matchedKeywords.length) {
      strengths.push(`Addressed ${matchedKeywords.length} reference-answer concept${matchedKeywords.length === 1 ? '' : 's'}.`);
    }
    if (words.length >= 15) strengths.push('Provided a response with useful detail by length.');
    if (sentences >= 2 && words.length >= 8) strengths.push('Used multiple sentences to organize the response.');
    if (missingKeywords.length) {
      weaknesses.push(`Did not mention these reference-answer terms: ${missingKeywords.slice(0, 6).join(', ')}.`);
      suggestions.push(`Consider addressing relevant concepts such as ${missingKeywords.slice(0, 4).join(', ')}.`);
    }
    if (words.length < 8) {
      weaknesses.push('The response is short and may not provide enough detail.');
      suggestions.push('Expand the response with an explanation and a relevant example.');
    }
    if (repetitionRatio > 0.3) {
      weaknesses.push('Repeated terms make up a relatively large share of the response.');
      suggestions.push('Reduce repeated wording and use the space to explain distinct points.');
    }
    if (!strengths.length) strengths.push('A transcript was saved and can be reviewed.');
    if (!suggestions.length) suggestions.push('Review the answer against the question and add relevant supporting detail.');
  }

  return {
    schemaVersion: '1',
    evaluationType: 'rule-based answer evaluation',
    score,
    quality: qualityForScore(score),
    strengths,
    weaknesses,
    suggestions,
    matchedKeywords,
    missingKeywords,
    metrics: {
      transcriptCharacters: transcript.length,
      wordCount: words.length,
      sentenceCount: sentences,
      keywordCoverage: keywordCoverage === null ? null : round(keywordCoverage * 100),
      referenceOverlap: overlap === null ? null : round(overlap * 100),
      answerCompleteness: completenessScore,
      repetitionRatio: round(repetitionRatio * 100),
    },
  };
}

function savedEvaluation(answer) {
  return answer.evaluation?.schemaVersion === '1'
    ? answer.evaluation
    : evaluateInterviewAnswer(answer);
}

function mean(values) {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function countValues(values, allowedValues) {
  return Object.fromEntries(allowedValues.map((value) => [
    value,
    values.filter((candidate) => candidate === value).length,
  ]));
}

function listUnique(values) {
  return [...new Set(values)];
}

export function buildInterviewReport(session) {
  const answers = [...session.answers].sort((left, right) => left.questionIndex - right.questionIndex);
  const observations = session.emotions ?? [];
  const answered = answers.filter((answer) => Boolean(answer.transcriptAnswer?.trim()));
  const evaluatedAnswers = answered.map((answer) => ({
    answer,
    evaluation: savedEvaluation(answer),
  }));
  const scores = evaluatedAnswers.map(({ evaluation }) => evaluation.score);
  const technicalCoverage = evaluatedAnswers
    .map(({ evaluation }) => evaluation.metrics.keywordCoverage)
    .filter((value) => value !== null);
  const mostCommon = (values) => {
    if (!values.length) return null;
    const counts = countValues(values, listUnique(values));
    return Object.entries(counts).sort(([leftName, leftCount], [rightName, rightCount]) =>
      rightCount - leftCount || leftName.localeCompare(rightName),
    )[0][0];
  };
  const scoredByIndex = new Map(evaluatedAnswers.map(({ answer, evaluation }) => [
    answer.questionIndex,
    evaluation,
  ]));
  const getRankedAnswer = (descending) => {
    const ordered = [...evaluatedAnswers].sort((left, right) =>
      (descending ? right.evaluation.score - left.evaluation.score : left.evaluation.score - right.evaluation.score) ||
      left.answer.questionIndex - right.answer.questionIndex,
    );
    if (!ordered.length) return null;
    const { answer, evaluation } = ordered[0];
    return { questionIndex: answer.questionIndex, question: answer.questionText, score: evaluation.score };
  };
  const expressionCounts = countValues(
    observations.map((observation) => observation.emotion),
    ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise'],
  );
  const perQuestionObservations = answers.map((answer) => {
    const questionObservations = observations.filter(
      (observation) => observation.questionIndex === answer.questionIndex,
    );
    const expressions = questionObservations.map((observation) => observation.emotion);
    return {
      questionIndex: answer.questionIndex,
      detectionCount: questionObservations.length,
      expressionCounts: countValues(expressions, Object.keys(expressionCounts)),
      mostFrequentExpression: mostCommon(expressions),
    };
  }).filter((observation) => observation.detectionCount > 0);
  const confidenceValues = observations
    .map((observation) => observation.confidence)
    .filter((confidence) => typeof confidence === 'number' && Number.isFinite(confidence));
  const evaluations = answers.map((answer) => scoredByIndex.get(answer.questionIndex) ?? savedEvaluation(answer));
  const allStrengths = evaluatedAnswers.flatMap(({ evaluation }) => evaluation.strengths);
  const allWeaknesses = evaluatedAnswers.flatMap(({ evaluation }) => evaluation.weaknesses);
  const allSuggestions = evaluatedAnswers.flatMap(({ evaluation }) => evaluation.suggestions);
  const distributionEvaluations = evaluatedAnswers.map(({ evaluation }) => evaluation.quality);

  return {
    schemaVersion: '1',
    evaluationType: 'automated preliminary evaluation using deterministic rules',
    interview: {
      id: session.id,
      role: session.selectedRole,
      technology: session.technology,
      difficulty: session.difficulty,
      status: session.status,
      questionCount: answers.length,
      answeredQuestions: answered.length,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      isComplete: session.status === 'COMPLETED' && answered.length === answers.length,
    },
    overallScore: mean(scores),
    answerPerformance: {
      averageScore: mean(scores),
      strongestAnswer: getRankedAnswer(true),
      weakestAnswer: getRankedAnswer(false),
      qualityDistribution: countValues(distributionEvaluations, QUALITY_LEVELS),
      unansweredQuestions: answers.length - answered.length,
    },
    technicalPerformance: {
      label: 'Automated preliminary reference-keyword coverage',
      score: mean(technicalCoverage),
      evaluatedAnswers: technicalCoverage.length,
      available: technicalCoverage.length > 0,
    },
    communicationIndicators: {
      basis: 'Transcript text only; these are structural indicators, not a measure of spoken communication quality.',
      totalTranscriptCharacters: answered.reduce((sum, answer) => sum + answer.transcriptAnswer.length, 0),
      averageTranscriptCharacters: mean(evaluatedAnswers.map(({ evaluation }) => evaluation.metrics.transcriptCharacters)),
      averageSentenceCount: mean(evaluatedAnswers.map(({ evaluation }) => evaluation.metrics.sentenceCount)),
      multipleSentenceAnswers: evaluatedAnswers.filter(({ evaluation }) => evaluation.metrics.sentenceCount > 1).length,
      averageAnswerCompleteness: mean(evaluatedAnswers.map(({ evaluation }) => evaluation.metrics.answerCompleteness)),
    },
    facialExpressionSummary: {
      basis: 'Automated computer-vision detections; not a definitive measurement of emotional state.',
      detectionCount: observations.length,
      expressionCounts,
      mostFrequentDetectedExpression: mostCommon(observations.map((observation) => observation.emotion)),
      averageConfidence: mean(confidenceValues.map((confidence) => confidence * 100)),
      perQuestionObservations,
    },
    strengths: listUnique(allStrengths),
    areasForImprovement: listUnique(allWeaknesses),
    suggestions: listUnique(allSuggestions),
    answers: answers.map((answer) => ({
      questionIndex: answer.questionIndex,
      question: answer.questionText,
      transcriptAnswer: answer.transcriptAnswer,
      answered: Boolean(answer.transcriptAnswer?.trim()),
      evaluation: savedEvaluation(answer),
    })),
  };
}

export async function findOwnedInterviewReport(database, sessionId, userId) {
  const session = await database.interviewSession.findFirst({
    where: { id: sessionId, clerkUserId: userId },
    include: {
      answers: { orderBy: { questionIndex: 'asc' } },
      emotions: { orderBy: { timestamp: 'asc' } },
    },
  });
  return session ? buildInterviewReport(session) : null;
}
