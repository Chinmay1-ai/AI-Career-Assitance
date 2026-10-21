import { useState } from 'react';
import { Link } from 'react-router-dom';
import InterviewIcon from './InterviewIcon.jsx';
import InterviewMediaPreview from './InterviewMediaPreview.jsx';
import SpeechAnswerInput from './SpeechAnswerInput.jsx';

function AIInterviewerVisual({ speaking }) {
  return (
    <div className={`ai-interviewer-visual ${speaking ? 'is-speaking' : ''}`} aria-hidden="true">
      <img src="/assets/ai-interviewer-male.png" alt="" />
      {speaking && (
        <>
          <span className="ai-portrait-speaking-ring" />
          <span className="ai-portrait-voice-indicator">
            <i />
            <i />
            <i />
          </span>
        </>
      )}
    </div>
  );
}

function statusLabel(state, listening) {
  if (listening) return 'Listening...';
  if (state === 'speaking') return 'AI is speaking';
  if (state === 'unsupported') return 'Voice playback unavailable';
  if (state === 'voice-off') return 'Voice off · your turn';
  return 'Your turn';
}

function statusIcon(state, listening) {
  if (listening) return 'microphone';
  if (state === 'speaking') return 'speaker';
  if (state === 'unsupported' || state === 'voice-off') return 'info';
  return 'microphone';
}

export default function InterviewRoom({
  session,
  sessionId,
  questionSource,
  questionIndex,
  currentQuestion,
  answerDraft,
  setAnswerDraft,
  saving,
  error,
  emotionEnabled,
  setEmotionEnabled,
  emotionCameraReady,
  microphoneReady,
  emotionStatus,
  currentEmotion,
  confidencePercent,
  interviewerState,
  interviewerMessage,
  greetingText,
  speechSupported,
  voiceEnabled,
  onToggleVoice,
  onMediaReady,
  onMediaUnavailable,
  onCameraControlReady,
  onCameraAction,
  onRecordingChange,
  onReplayQuestion,
  onPrevious,
  onSaveNext,
  onComplete,
  savingLabel,
}) {
  const [controlHost, setControlHost] = useState(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(true);
  const questionCount = session.questions.length;
  const progressPercent = questionCount ? ((questionIndex + 1) / questionCount) * 100 : 0;
  const listening = interviewerState === 'listening';
  const questionState = statusLabel(interviewerState, listening);
  const emotionUnavailable = Boolean(emotionStatus) || !emotionCameraReady;
  const expressionLabel = emotionEnabled
    ? emotionUnavailable
      ? 'Expression detection unavailable'
      : currentEmotion?.label ?? 'Waiting for expression'
    : 'Detection off';

  return (
    <section className="interview-room" aria-label="Live AI interview room">
      <header className="room-topbar">
        <div className="room-brand">
          <span className="room-brand-icon"><InterviewIcon name="spark" size={18} /></span>
          <div>
            <p>AI MOCK INTERVIEW</p>
            <h1>{session.selectedRole}<span> · {session.technology} · {session.difficulty.toLocaleLowerCase()}</span></h1>
          </div>
        </div>
        <div className="room-progress">
          <span className="room-live"><i /> LIVE</span>
          <strong>Question {String(questionIndex + 1).padStart(2, '0')} / {String(questionCount).padStart(2, '0')}</strong>
          <span className="room-progress-track" role="progressbar" aria-label="Interview progress" aria-valuenow={questionIndex + 1} aria-valuemin={1} aria-valuemax={questionCount}>
            <i style={{ width: `${progressPercent}%` }} />
          </span>
        </div>
      </header>

      {questionSource === 'LOCAL_FALLBACK' && (
        <div className="room-fallback-notice" role="status">
          <span><InterviewIcon name="info" size={15} /></span>
          <p>AI question generation is temporarily unavailable. Using the local interview question bank.</p>
        </div>
      )}

      <div className="room-grid">
        <section className={`room-panel ai-room-panel ${interviewerState === 'speaking' ? 'ai-room-speaking' : ''}`} aria-label="AI interviewer">
          <div className="room-panel-heading">
            <span className="room-panel-icon ai-icon"><InterviewIcon name="spark" size={16} /></span>
            <span>AI INTERVIEWER</span>
            <span className={`room-state-badge ${interviewerState === 'speaking' ? 'active' : ''} ${listening ? 'listening' : ''}`}>
              <InterviewIcon name={statusIcon(interviewerState, listening)} size={13} />
              {questionState}
            </span>
          </div>
          <AIInterviewerVisual speaking={interviewerState === 'speaking'} />
          <div className="ai-room-caption">
            <span className="ai-caption-avatar"><InterviewIcon name="spark" size={15} /></span>
            <span>
              <strong>AI Interviewer</strong>
              <small>{interviewerState === 'speaking'
                ? (interviewerMessage === greetingText ? 'Speaking your personalized welcome' : 'Reading the current question aloud')
                : interviewerState === 'unsupported'
                  ? 'Read the question below to continue'
                  : interviewerState === 'voice-off'
                    ? 'Voice is off · read the question below'
                    : 'Ready for your response'}</small>
            </span>
          </div>
        </section>

        <section className="room-panel candidate-room-panel" aria-label="Candidate camera and expression analysis">
          <InterviewMediaPreview
            roomMode
            overlay={(
              <div className={`camera-emotion-overlay ${currentEmotion ? `overlay-${currentEmotion.tone}` : ''}`}>
                <span className="camera-emotion-icon" aria-hidden="true">{emotionEnabled && !emotionUnavailable ? currentEmotion?.icon ?? '…' : '—'}</span>
                <span className="camera-emotion-copy">
                  <strong>{expressionLabel}</strong>
                  <small>{confidencePercent !== null && emotionEnabled && !emotionUnavailable ? `${confidencePercent}% confidence` : emotionEnabled ? emotionStatus || 'Waiting for detection' : 'Detection off'}</small>
                </span>
                <span className={`camera-emotion-live ${emotionEnabled && emotionCameraReady && !emotionStatus ? 'active' : ''}`}><i /></span>
              </div>
            )}
            onMediaReady={onMediaReady}
            onMediaUnavailable={onMediaUnavailable}
            onCameraControlReady={onCameraControlReady}
          />
          <label className="room-analysis-toggle">
            <input
              type="checkbox"
              checked={emotionEnabled}
              onChange={(event) => setEmotionEnabled(event.target.checked)}
            />
            <InterviewIcon name="spark" size={14} />
            Facial-expression analysis
          </label>
        </section>

        <section className={`room-panel transcript-room-panel ${transcriptExpanded ? '' : 'transcript-collapsed'}`} aria-label="Interview transcript and answer">
          <div className="transcript-heading">
            <div><span className="room-panel-icon transcript-icon"><InterviewIcon name="chart" size={16} /></span><span>TRANSCRIPT</span></div>
            <button type="button" className="transcript-toggle" onClick={() => setTranscriptExpanded((expanded) => !expanded)} aria-expanded={transcriptExpanded}>
              {transcriptExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
          <div className="transcript-scroll">
            {session.questions.map((question, index) => {
              const isCurrent = index === questionIndex;
              const answerText = isCurrent ? answerDraft : question.transcriptAnswer ?? '';
              if (!isCurrent && !answerText.trim()) return null;
              return (
                <article className={`conversation-entry ${isCurrent ? 'current-entry' : ''}`} key={question.questionIndex}>
                  <p className="conversation-speaker"><span className="conversation-dot ai-dot" /> AI INTERVIEWER · QUESTION {String(index + 1).padStart(2, '0')}</p>
                  <p className="conversation-bubble question-bubble">{question.questionText}</p>
                  {answerText.trim() && (
                    <>
                      <p className="conversation-speaker candidate-speaker"><span className="conversation-dot candidate-dot" /> YOUR ANSWER{isCurrent && answerText !== question.transcriptAnswer ? ' · DRAFT' : ''}</p>
                      <p className="conversation-bubble candidate-bubble">{answerText}</p>
                    </>
                  )}
                </article>
              );
            })}
            {!currentQuestion && <p className="transcript-empty">Your interview conversation will appear here.</p>}
          </div>
          <div className="current-question-status">
            <span className={`question-status-indicator ${interviewerState}`}>
              <InterviewIcon name={statusIcon(interviewerState, listening)} size={14} />
              {questionState}
            </span>
            {interviewerState === 'speaking' && <span className="current-speaking-copy">The AI interviewer is reading this question.</span>}
          </div>
          <SpeechAnswerInput
            value={answerDraft}
            onChange={setAnswerDraft}
            disabled={saving}
            onRecordingChange={onRecordingChange}
            controlContainer={controlHost}
            roomMode
          />
          {error && <p className="room-error" role="alert">{error}</p>}
          <div className="transcript-actions">
            {questionIndex > 0 && <button type="button" className="room-previous-button" onClick={onPrevious} disabled={saving}>Previous</button>}
            {questionIndex < questionCount - 1
              ? <button type="button" className="room-next-button" onClick={onSaveNext} disabled={saving}>{saving ? savingLabel : <>Save &amp; Next <span aria-hidden="true">→</span></>}</button>
              : <button type="button" className="room-next-button" onClick={onComplete} disabled={saving}>{saving ? savingLabel : 'Complete interview'}</button>}
          </div>
        </section>
      </div>

      <div className="room-utility-row">
        <span className={emotionCameraReady ? 'ready' : ''}><InterviewIcon name={emotionCameraReady ? 'check' : 'camera'} size={14} /> Camera {emotionCameraReady ? 'connected' : 'unavailable'}</span>
        <span className={microphoneReady ? 'ready' : ''}><InterviewIcon name={microphoneReady ? 'check' : 'microphone'} size={14} /> Microphone {microphoneReady ? 'ready' : 'optional'}</span>
        <span className={speechSupported && voiceEnabled ? 'ready' : ''}><InterviewIcon name="speaker" size={14} /> AI voice {speechSupported && voiceEnabled ? 'ready' : 'unavailable'}</span>
        {emotionEnabled && emotionStatus && <span className="room-media-warning">{emotionStatus}</span>}
      </div>

      <nav className="room-control-dock" aria-label="Interview controls">
        <div className="dock-transport-controls">
          <span ref={setControlHost} className={`dock-mic-portal ${listening ? 'is-active' : ''}`} />
          <button
            type="button"
            className={`dock-control ${emotionCameraReady ? 'is-active' : ''}`}
            aria-label={emotionCameraReady ? 'Focus camera preview' : 'Enable camera'}
            title={emotionCameraReady ? 'Focus camera preview' : 'Enable camera'}
            onClick={onCameraAction}
          >
            <InterviewIcon name="camera" size={19} />
          </button>
          <button
            type="button"
            className={`dock-control ${voiceEnabled ? 'is-active' : ''}`}
            aria-label={voiceEnabled ? 'Turn AI voice off' : 'Turn AI voice on'}
            title={voiceEnabled ? 'Turn AI voice off' : 'Turn AI voice on'}
            onClick={onToggleVoice}
            disabled={!speechSupported}
          >
            <InterviewIcon name="speaker" size={19} />
          </button>
          <button
            type="button"
            className="dock-control replay-dock"
            aria-label="Replay current question"
            title="Replay question"
            onClick={onReplayQuestion}
            disabled={!speechSupported || listening}
          >
            <InterviewIcon name="replay" size={19} />
          </button>
        </div>
        <button type="button" className="dock-end-button" title="End interview and save your current answer" onClick={onComplete} disabled={saving}>
          <InterviewIcon name="close" size={17} /> End Interview
        </button>
      </nav>
      <p className="room-privacy"><InterviewIcon name="shield" size={13} /> Camera frames are processed temporarily; raw images, video and audio are not stored.</p>
      <Link className="room-report-link" to={`/interviews/${encodeURIComponent(sessionId)}/report`}>Interview report</Link>
    </section>
  );
}
