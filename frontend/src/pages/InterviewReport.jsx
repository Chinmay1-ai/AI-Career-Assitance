import { useAuth } from '@clerk/react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import InterviewIcon from '../components/InterviewIcon.jsx';
import { getMessage, requestInterviewApi } from '../lib/interviews.js';
import { isClerkConfigured } from '../providers/ClerkAuthProvider.jsx';

function formatScore(score) {
  return typeof score === 'number' ? `${Math.round(score)}/100` : 'Not available';
}

function formatExpression(expression) {
  return expression ? expression.charAt(0).toLocaleUpperCase() + expression.slice(1) : 'None detected';
}

export default function InterviewReport() {
  const { sessionId } = useParams();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return undefined;
    let active = true;
    requestInterviewApi(`/api/interviews/${encodeURIComponent(sessionId)}/report`, getToken)
      .then(({ report: loadedReport }) => {
        if (active) setReport(loadedReport);
      })
      .catch((loadError) => {
        if (active) setError(getMessage(loadError, 'Could not load the performance report.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn, sessionId]);

  if (!isClerkConfigured()) {
    return <p className="setup-hint" role="status">Configure Clerk to view this report.</p>;
  }
  if (!isLoaded) return <p role="status">Checking sign-in…</p>;
  if (!isSignedIn) return <p className="error-text" role="alert">Sign in to view this report.</p>;
  if (loading) return <p role="status">Loading performance report…</p>;
  if (error || !report) {
    return (
      <section className="interview-page">
        <p className="error-text" role="alert">{error || 'This performance report is unavailable.'}</p>
        <Link className="btn btn-ghost" to="/dashboard">Back to dashboard</Link>
      </section>
    );
  }

  const { interview, answerPerformance, technicalPerformance, communicationIndicators, facialExpressionSummary } = report;
  const hasAnswers = interview.answeredQuestions > 0;
  const expressionEntries = Object.entries(facialExpressionSummary.expressionCounts)
    .filter(([, count]) => count > 0);
  const scoreWidth = (score) => typeof score === 'number'
    ? `${Math.max(0, Math.min(100, score))}%`
    : '0%';

  return (
    <section className="interview-page interview-report">
      <header className="report-header card">
        <div>
          <p className="eyebrow"><InterviewIcon name="chart" size={15} /> Interview analytics</p>
          <h1>{interview.role}</h1>
          <p className="lead">
            {interview.technology} · {interview.difficulty.toLocaleLowerCase()} · {interview.answeredQuestions} of {interview.questionCount} questions answered
          </p>
        </div>
        <Link className="btn btn-secondary" to="/dashboard">Return to dashboard</Link>
      </header>
      <p className="report-method-note">
        Automated preliminary evaluation using transparent rules; it is not a scientifically validated assessment.
      </p>
      {!interview.isComplete && (
        <p className="setup-hint" role="status">
          This interview is incomplete. Scores below reflect saved answers only and may change when it is completed.
        </p>
      )}

      <div className="report-summary-grid">
        <article className="card report-score-card">
          <p className="eyebrow"><InterviewIcon name="target" size={15} /> Overall score</p>
          <strong>{formatScore(report.overallScore)}</strong>
          <div className="report-metric-track" role="progressbar" aria-label="Overall score" aria-valuenow={report.overallScore ?? 0} aria-valuemin="0" aria-valuemax="100">
            <span style={{ width: scoreWidth(report.overallScore) }} />
          </div>
          <p className="interview-muted">Average of submitted answer scores.</p>
        </article>
        <article className="card">
          <h2><span className="icon-tile report-icon-indigo"><InterviewIcon name="question" size={17} /></span> Answer performance</h2>
          <p>Average: <strong>{formatScore(answerPerformance.averageScore)}</strong></p>
          <div className="report-metric-track" role="progressbar" aria-label="Average answer score" aria-valuenow={answerPerformance.averageScore ?? 0} aria-valuemin="0" aria-valuemax="100">
            <span style={{ width: scoreWidth(answerPerformance.averageScore) }} />
          </div>
          <p>Strongest: {answerPerformance.strongestAnswer
            ? `Question ${answerPerformance.strongestAnswer.questionIndex + 1} (${formatScore(answerPerformance.strongestAnswer.score)})`
            : 'No submitted answers'}
          </p>
          <p>Needs most review: {answerPerformance.weakestAnswer
            ? `Question ${answerPerformance.weakestAnswer.questionIndex + 1} (${formatScore(answerPerformance.weakestAnswer.score)})`
            : 'No submitted answers'}
          </p>
          <p>Quality distribution (submitted answers):</p>
          <ul className="report-compact-list">
            {Object.entries(answerPerformance.qualityDistribution).map(([quality, count]) => (
              <li key={quality}>{quality}: {count}</li>
            ))}
          </ul>
        </article>
        <article className="card">
          <h2><span className="icon-tile report-icon-violet"><InterviewIcon name="code" size={17} /></span> Technical performance</h2>
          <p><strong>{technicalPerformance.available ? formatScore(technicalPerformance.score) : 'Not available'}</strong></p>
          {technicalPerformance.available && (
            <div className="report-metric-track report-metric-violet" role="progressbar" aria-label="Automated technical coverage score" aria-valuenow={technicalPerformance.score} aria-valuemin="0" aria-valuemax="100">
              <span style={{ width: scoreWidth(technicalPerformance.score) }} />
            </div>
          )}
          <p className="interview-muted">
            {technicalPerformance.label}; compares answer terms with each saved reference answer.
          </p>
        </article>
        <article className="card">
          <h2><span className="icon-tile report-icon-blue"><InterviewIcon name="chart" size={17} /></span> Transcript indicators</h2>
          <p>Total transcript length: {communicationIndicators.totalTranscriptCharacters} characters</p>
          <p>Average sentences: {communicationIndicators.averageSentenceCount ?? 'Not available'}</p>
          <p>Multiple-sentence answers: {communicationIndicators.multipleSentenceAnswers}</p>
          <p>Average answer completeness: {formatScore(communicationIndicators.averageAnswerCompleteness)}</p>
          <p className="interview-muted">{communicationIndicators.basis}</p>
        </article>
      </div>

      <section className="card report-section">
        <h2><span className="icon-tile report-icon-green"><InterviewIcon name="check" size={17} /></span> Strengths</h2>
        {report.strengths.length
          ? <ul>{report.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
          : <p className="interview-muted">{hasAnswers ? 'No repeated strengths identified by the rules.' : 'Submit answers to see preliminary strengths.'}</p>}
      </section>
      <section className="card report-section">
        <h2><span className="icon-tile report-icon-amber"><InterviewIcon name="target" size={17} /></span> Areas for improvement</h2>
        {report.areasForImprovement.length
          ? <ul>{report.areasForImprovement.map((item) => <li key={item}>{item}</li>)}</ul>
          : <p className="interview-muted">{hasAnswers ? 'No specific areas were flagged by the rules.' : 'Submit answers to see preliminary areas for improvement.'}</p>}
      </section>
      <section className="card report-section">
        <h2><span className="icon-tile report-icon-violet"><InterviewIcon name="lightbulb" size={17} /></span> Actionable suggestions</h2>
        {report.suggestions.length
          ? <ul>{report.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
          : <p className="interview-muted">Suggestions will appear when answers are available.</p>}
      </section>

      <section className="card report-section">
        <h2><span className="icon-tile report-icon-blue"><InterviewIcon name="spark" size={17} /></span> Facial-expression detection summary</h2>
        <p className="interview-muted">{facialExpressionSummary.basis}</p>
        {facialExpressionSummary.detectionCount ? (
          <>
            <p>Most frequent detected expression: <strong>{formatExpression(facialExpressionSummary.mostFrequentDetectedExpression)}</strong></p>
            <p>Average detection confidence: {facialExpressionSummary.averageConfidence ?? 'Not available'}%</p>
            <ul className="report-compact-list">
              {expressionEntries.map(([expression, count]) => (
                <li key={expression}>{formatExpression(expression)}: {count}</li>
              ))}
            </ul>
            {facialExpressionSummary.perQuestionObservations.length > 0 && (
              <>
                <h3>Per-question observations</h3>
                <ul>
                  {facialExpressionSummary.perQuestionObservations.map((observation) => (
                    <li key={observation.questionIndex}>
                      Question {observation.questionIndex + 1}: {observation.detectionCount} detections; most frequent: {formatExpression(observation.mostFrequentExpression)}.
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p>No facial-expression observations were saved for this interview.</p>
        )}
      </section>

      <section className="report-section">
        <h2><span className="icon-tile report-icon-indigo"><InterviewIcon name="question" size={17} /></span> Per-question results</h2>
        {report.answers.map((answer) => (
          <article className="card report-answer" key={answer.questionIndex}>
            <p className="eyebrow">
              Question {answer.questionIndex + 1} · {answer.answered
                ? `${formatScore(answer.evaluation.score)} · ${answer.evaluation.quality}`
                : 'Unanswered'}
            </p>
            <h3>{answer.question}</h3>
            {answer.answered ? (
              <>
                <p className="report-transcript">{answer.transcriptAnswer}</p>
                {answer.evaluation.matchedKeywords.length > 0 && (
                  <p><strong>Matched reference terms:</strong> {answer.evaluation.matchedKeywords.join(', ')}</p>
                )}
                {answer.evaluation.missingKeywords.length > 0 && (
                  <p><strong>Not observed:</strong> {answer.evaluation.missingKeywords.join(', ')}</p>
                )}
              </>
            ) : (
              <p className="interview-muted">No transcript was saved for this question.</p>
            )}
            {answer.evaluation.suggestions.length > 0 && (
              <ul>{answer.evaluation.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
            )}
          </article>
        ))}
      </section>
    </section>
  );
}
