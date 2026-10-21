import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import InterviewIcon from './InterviewIcon.jsx';

export default function SpeechAnswerInput({
  value,
  onChange,
  disabled = false,
  onRecordingChange,
  controlContainer,
  roomMode = false,
}) {
  const recognitionRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const Recognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : undefined;

  useEffect(() => () => {
    recognitionRef.current?.stop();
    onRecordingChange?.(false);
  }, [onRecordingChange]);

  function toggleRecognition() {
    setSpeechError('');
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      onRecordingChange?.(false);
      return;
    }
    if (!Recognition) {
      setSpeechError('Speech recognition is not supported by this browser. You can type your answer instead.');
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      onChange(transcript);
    };
    recognition.onerror = (event) => {
      setSpeechError(
        event.error === 'not-allowed'
          ? 'Microphone access was denied. Allow microphone access in your browser settings or type your answer.'
          : `Speech recognition stopped: ${event.error}. You can continue by typing.`,
      );
      setRecording(false);
      onRecordingChange?.(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setRecording(false);
      onRecordingChange?.(false);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setRecording(true);
      onRecordingChange?.(true);
    } catch (error) {
      recognitionRef.current = null;
      setSpeechError(error instanceof Error ? error.message : 'Could not start speech recognition.');
      onRecordingChange?.(false);
    }
  }

  const recognitionButton = (
    <button
      type="button"
      className={`btn btn-secondary speech-action ${recording ? 'is-recording' : ''} ${roomMode ? 'room-speech-action' : ''}`}
      onClick={toggleRecognition}
      disabled={disabled || (!Recognition && recording)}
      aria-pressed={recording}
      aria-label={recording ? 'Stop speech recognition' : 'Start speech recognition'}
      title={recording ? 'Stop speech recognition' : 'Start microphone speech recognition'}
    >
      {recording
        ? <><span className="recording-indicator" aria-hidden="true" /> Listening...</>
        : <><InterviewIcon name="microphone" size={17} /> Start Speech Recognition</>}
    </button>
  );

  return (
    <div className="speech-answer">
      <div className="field-header-row">
        <div className="answer-field-heading">
          <label htmlFor="interview-answer">{roomMode ? 'Your answer' : 'Your Answer'}</label>
          <p className="interview-helper-text">
            {roomMode ? 'Your response is added to this interview transcript.' : 'Type your answer or use speech recognition.'}
          </p>
        </div>
        {!controlContainer && recognitionButton}
      </div>
      <textarea
        id="interview-answer"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={9}
        maxLength={20000}
        placeholder="Type your answer or use speech recognition to speak naturally…"
        disabled={disabled}
      />
      {!Recognition && (
        <p className="interview-muted">This browser does not support speech recognition; typed answers are available.</p>
      )}
      {speechError && <p className="error-text" role="alert">{speechError}</p>}
      {controlContainer && createPortal(recognitionButton, controlContainer)}
    </div>
  );
}
