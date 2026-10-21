import { useAuth, useUser } from '@clerk/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import InterviewRoom from '../components/InterviewRoom.jsx';
import { normalizeSpeechText, selectEnglishVoice } from '../lib/interviewerVoice.js';
import { getMessage, requestInterviewApi } from '../lib/interviews.js';
import { isClerkConfigured } from '../providers/ClerkAuthProvider.jsx';

export default function InterviewSession() {
  const { sessionId } = useParams();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';
  const [session, setSession] = useState(null);
  const [resultsSummary, setResultsSummary] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerDraft, setAnswerDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [emotionEnabled, setEmotionEnabled] = useState(false);
  const [emotionCameraReady, setEmotionCameraReady] = useState(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [emotionStatus, setEmotionStatus] = useState('');
  const [latestExpression, setLatestExpression] = useState(null);
  const [interviewerState, setInterviewerState] = useState(speechSupported ? 'turn' : 'unsupported');
  const [interviewerMessage, setInterviewerMessage] = useState('');
  const [greetingText, setGreetingText] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const emotionVideoRef = useRef(null);
  const emotionQuestionIndexRef = useRef(questionIndex);
  const speechRunRef = useRef(0);
  const greetedSessionRef = useRef(null);
  const spokenQuestionRef = useRef(null);
  const cameraControlRef = useRef(null);
  const speechVoicesRef = useRef([]);
  const speechVoiceWaitersRef = useRef(new Set());
  const loggedVoiceRef = useRef('');

  useEffect(() => {
    if (!speechSupported) return undefined;
    const voiceWaiters = speechVoiceWaitersRef.current;
    const updateVoices = () => {
      speechVoicesRef.current = window.speechSynthesis.getVoices();
      if (speechVoicesRef.current.length > 0) {
        voiceWaiters.forEach((resolve) => resolve(speechVoicesRef.current));
        voiceWaiters.clear();
      }
    };
    updateVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', updateVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', updateVoices);
      voiceWaiters.forEach((resolve) => resolve([]));
      voiceWaiters.clear();
    };
  }, [speechSupported]);

  const getPreferredInterviewerVoice = useCallback(async () => {
    const availableVoices = window.speechSynthesis.getVoices();
    if (availableVoices.length > 0) {
      speechVoicesRef.current = availableVoices;
    } else if (speechVoicesRef.current.length === 0) {
      const loadedVoices = await new Promise((resolve) => {
        let settled = false;
        let timeout;
        const finish = (voices) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          speechVoiceWaitersRef.current.delete(onVoicesLoaded);
          resolve(voices);
        };
        const onVoicesLoaded = (voices) => finish(voices);
        speechVoiceWaitersRef.current.add(onVoicesLoaded);
        timeout = window.setTimeout(() => finish(window.speechSynthesis.getVoices()), 1200);

        const voicesNowAvailable = window.speechSynthesis.getVoices();
        if (voicesNowAvailable.length > 0) finish(voicesNowAvailable);
      });
      if (loadedVoices.length > 0) speechVoicesRef.current = loadedVoices;
    }

    const selectedVoice = selectEnglishVoice(speechVoicesRef.current);
    if (selectedVoice) {
      const selectionKey = `${selectedVoice.name}:${selectedVoice.lang}`;
      if (import.meta.env.DEV && loggedVoiceRef.current !== selectionKey) {
        console.info('AI interviewer voice selected:', selectedVoice.name, selectedVoice.lang);
        loggedVoiceRef.current = selectionKey;
      }
    }
    return selectedVoice;
  }, []);

  const loadSession = useCallback(async () => {
    const { session: loadedSession } = await requestInterviewApi(
      `/api/interviews/${encodeURIComponent(sessionId)}`,
      getToken,
    );
    setSession(loadedSession);
    const activeIndex = Math.min(
      loadedSession.currentQuestionIndex,
      Math.max(0, loadedSession.questions.length - 1),
    );
    emotionQuestionIndexRef.current = activeIndex;
    setQuestionIndex(activeIndex);
    setAnswerDraft(loadedSession.questions[activeIndex]?.transcriptAnswer ?? '');
    if (loadedSession.status === 'COMPLETED') {
      const results = await requestInterviewApi(
        `/api/interviews/${encodeURIComponent(sessionId)}/results`,
        getToken,
      );
      setResultsSummary(results.summary);
    }
  }, [getToken, sessionId]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      loadSession()
        .catch((loadError) => {
          if (active) setError(getMessage(loadError, 'Could not load this interview.'));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isLoaded, isSignedIn, loadSession]);

  const currentQuestion = session?.questions[questionIndex];
  const activeQuestionIndex = currentQuestion?.questionIndex;
  const activeQuestionText = currentQuestion?.questionText;
  const displayName = user?.fullName?.trim() || user?.firstName?.trim() || '';
  const emotionMeta = {
    angry: { icon: '😠', label: 'Angry', tone: 'angry' },
    disgust: { icon: '🤢', label: 'Disgust', tone: 'disgust' },
    fear: { icon: '😨', label: 'Fear', tone: 'fear' },
    happy: { icon: '😊', label: 'Happy', tone: 'happy' },
    neutral: { icon: '😐', label: 'Neutral', tone: 'neutral' },
    sad: { icon: '😔', label: 'Sad', tone: 'sad' },
    surprise: { icon: '😮', label: 'Surprise', tone: 'surprise' },
  };

  const currentEmotion = latestExpression ? emotionMeta[latestExpression.emotion] : null;
  const handleEmotionMediaReady = useCallback((video, audioReady) => {
    emotionVideoRef.current = video;
    setEmotionCameraReady(true);
    setMicrophoneReady(audioReady);
    setEmotionStatus('');
  }, []);

  const handleEmotionMediaUnavailable = useCallback(() => {
    emotionVideoRef.current = null;
    setEmotionCameraReady(false);
    setMicrophoneReady(false);
  }, []);

  const registerCameraControl = useCallback((control) => {
    cameraControlRef.current = control;
  }, []);

  const runCameraControl = useCallback(() => {
    cameraControlRef.current?.();
  }, []);

  const cancelInterviewerSpeech = useCallback(() => {
    speechRunRef.current += 1;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setInterviewerState('turn');
    setInterviewerMessage('');
  }, []);

  const speakQuestion = useCallback(async (text, runId) => {
    if (!speechSupported || !text) {
      setInterviewerState('turn');
      setInterviewerMessage('');
      return;
    }
    if (runId !== speechRunRef.current) return;
    setInterviewerState('turn');
    setInterviewerMessage('');
    const preferredVoice = await getPreferredInterviewerVoice();
    if (runId !== speechRunRef.current) return;
    const utterance = new SpeechSynthesisUtterance(normalizeSpeechText(text));
    utterance.lang = 'en-US';
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    const finish = () => {
      if (runId === speechRunRef.current) {
        setInterviewerState('turn');
        setInterviewerMessage('');
      }
    };
    utterance.onstart = () => {
      if (runId === speechRunRef.current) {
        setInterviewerState('speaking');
        setInterviewerMessage(text);
      }
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    setInterviewerState('turn');
    window.speechSynthesis.speak(utterance);
  }, [getPreferredInterviewerVoice, speechSupported]);

  useEffect(() => {
    if (!session?.id || session.status !== 'IN_PROGRESS' || activeQuestionText === undefined || !isUserLoaded) {
      return undefined;
    }

    const runId = ++speechRunRef.current;
    let startTimer;
    window.speechSynthesis?.cancel();

    startTimer = window.setTimeout(async () => {
      if (runId !== speechRunRef.current) return;
      const questionText = activeQuestionText;
      const questionKey = `${session.id}:${activeQuestionIndex}`;
      const speakCurrentQuestion = () => {
        if (spokenQuestionRef.current === questionKey) {
          setInterviewerState('turn');
          return;
        }
        spokenQuestionRef.current = questionKey;
        speakQuestion(questionText, runId);
      };
      if (greetedSessionRef.current === session.id) {
        speakCurrentQuestion();
        return;
      }

      const hour = new Date().getHours();
      const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
      const greeting = displayName
        ? `Hello ${displayName}, good ${timeOfDay}. Welcome to your AI mock interview. Today we'll focus on ${session.technology} for the ${session.selectedRole} role at ${session.difficulty.toLocaleLowerCase()} difficulty. Let's begin.`
        : 'Hello, welcome to your AI mock interview.';
      setGreetingText(greeting);
      if (!speechSupported || !voiceEnabled) {
        setInterviewerState(!speechSupported ? 'unsupported' : 'voice-off');
        setInterviewerMessage('');
        return;
      }
      const preferredVoice = await getPreferredInterviewerVoice();
      if (runId !== speechRunRef.current) return;
      const utterance = new SpeechSynthesisUtterance(normalizeSpeechText(greeting));
      utterance.lang = 'en-US';
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      const continueWithQuestion = () => {
        if (runId === speechRunRef.current) {
          setInterviewerState('turn');
          setInterviewerMessage('');
          speakCurrentQuestion();
        }
      };
      utterance.onstart = () => {
        if (runId === speechRunRef.current) {
          greetedSessionRef.current = session.id;
          setInterviewerState('speaking');
          setInterviewerMessage(greeting);
        }
      };
      utterance.onend = continueWithQuestion;
      utterance.onerror = continueWithQuestion;
      setInterviewerState('turn');
      setInterviewerMessage('');
      greetedSessionRef.current = session.id;
      window.speechSynthesis.speak(utterance);
    }, 0);

    return () => {
      window.clearTimeout(startTimer);
      if (runId === speechRunRef.current) speechRunRef.current += 1;
      window.speechSynthesis?.cancel();
    };
  }, [
    activeQuestionIndex,
    activeQuestionText,
    displayName,
    isUserLoaded,
    session?.difficulty,
    session?.id,
    session?.selectedRole,
    session?.status,
    session?.technology,
    getPreferredInterviewerVoice,
    speakQuestion,
    speechSupported,
    voiceEnabled,
  ]);

  useEffect(() => () => {
    speechRunRef.current += 1;
    window.speechSynthesis?.cancel();
  }, []);

  const handleRecognitionChange = useCallback((isListening) => {
    if (isListening) {
      cancelInterviewerSpeech();
      setInterviewerState('listening');
      setInterviewerMessage('');
    } else {
      setInterviewerState('turn');
    }
  }, [cancelInterviewerSpeech]);

  const toggleVoice = useCallback(() => {
    if (voiceEnabled) {
      cancelInterviewerSpeech();
      setVoiceEnabled(false);
      setInterviewerState('voice-off');
      return;
    }
    spokenQuestionRef.current = null;
    setVoiceEnabled(true);
    setInterviewerState('turn');
  }, [cancelInterviewerSpeech, voiceEnabled]);

  useEffect(() => {
    if (
      !emotionEnabled ||
      !emotionCameraReady ||
      !emotionVideoRef.current ||
      session?.status !== 'IN_PROGRESS'
    ) {
      return undefined;
    }

    let active = true;
    let timer;
    let controller;

    async function analyzeFrame() {
      const video = emotionVideoRef.current;
      if (
        !active ||
        !video ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / video.videoWidth);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Frame capture is unavailable.');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = canvas.toDataURL('image/jpeg', 0.6);
        controller = new AbortController();
        const result = await requestInterviewApi(
          `/api/interviews/${encodeURIComponent(sessionId)}/emotions`,
          getToken,
          {
            method: 'POST',
            body: JSON.stringify({
              image,
              questionIndex: emotionQuestionIndexRef.current,
            }),
            signal: controller.signal,
          },
        );
        if (active && result.observation?.emotion) {
          setLatestExpression({
            emotion: result.observation.emotion,
            confidence: result.observation.confidence,
            updatedAtLabel: 'just now',
          });
          setEmotionStatus('');
        }
      } catch (analysisError) {
        if (active && analysisError?.name !== 'AbortError') {
          setEmotionStatus('Facial expression detection is temporarily unavailable. Your interview can continue.');
        }
      } finally {
        controller = null;
        if (active) timer = window.setTimeout(analyzeFrame, 3000);
      }
    }

    timer = window.setTimeout(analyzeFrame, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [
    emotionCameraReady,
    emotionEnabled,
    getToken,
    session?.status,
    sessionId,
  ]);

  async function saveAnswer(nextQuestionIndex = questionIndex) {
    if (!currentQuestion) return true;
    setSaving(true);
    setError('');
    try {
      const { answer } = await requestInterviewApi(
        `/api/interviews/${encodeURIComponent(sessionId)}/answers`,
        getToken,
        {
          method: 'POST',
          body: JSON.stringify({
            questionIndex,
            currentQuestionIndex: nextQuestionIndex,
            transcriptAnswer: answerDraft,
          }),
        },
      );
      setSession((previous) => ({
        ...previous,
        currentQuestionIndex: nextQuestionIndex,
        questions: previous.questions.map((question) =>
          question.questionIndex === answer.questionIndex
            ? {
                ...question,
                transcriptAnswer: answer.transcriptAnswer,
                submittedAt: answer.submittedAt,
              }
            : question,
        ),
      }));
      return true;
    } catch (saveError) {
      setError(getMessage(saveError, 'Could not save your answer.'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function goToQuestion(nextIndex) {
    const saved = await saveAnswer(nextIndex);
    if (saved) {
      cancelInterviewerSpeech();
      spokenQuestionRef.current = null;
      emotionQuestionIndexRef.current = nextIndex;
      setAnswerDraft(session.questions[nextIndex]?.transcriptAnswer ?? '');
      setQuestionIndex(nextIndex);
    }
  }

  async function completeInterview() {
    cancelInterviewerSpeech();
    if (!(await saveAnswer())) return;
    setSaving(true);
    setError('');
    try {
      const { session: completedSession } = await requestInterviewApi(
        `/api/interviews/${encodeURIComponent(sessionId)}/complete`,
        getToken,
        { method: 'POST' },
      );
      setSession(completedSession);
      const results = await requestInterviewApi(
        `/api/interviews/${encodeURIComponent(sessionId)}/results`,
        getToken,
      );
      setResultsSummary(results.summary);
    } catch (completeError) {
      setError(getMessage(completeError, 'Could not complete this interview.'));
    } finally {
      setSaving(false);
    }
  }

  function replayQuestion() {
    if (!currentQuestion || !speechSupported) return;
    cancelInterviewerSpeech();
    const runId = speechRunRef.current;
    speakQuestion(currentQuestion.questionText, runId);
  }

  if (!isClerkConfigured()) {
    return (
      <p className="setup-hint" role="status">
        Configure Clerk in the new project to open an authenticated interview session.
      </p>
    );
  }
  if (!isLoaded) return <p role="status">Checking sign-in…</p>;
  if (!isSignedIn) {
    return <p className="error-text" role="alert">Sign in to open this interview.</p>;
  }
  if (loading) return <p role="status">Loading interview…</p>;
  if (error && !session) {
    return (
      <section className="interview-page">
        <p className="error-text" role="alert">{error}</p>
        <Link className="btn btn-ghost" to="/dashboard">Back to dashboard</Link>
      </section>
    );
  }
  if (!session) return null;

  if (session.status === 'COMPLETED') {
    return (
      <section className="interview-page">
        <p className="eyebrow">Interview complete</p>
        <h1>Your interview is saved</h1>
        <p role="status">
          {resultsSummary
            ? `${resultsSummary.answeredQuestions} of ${resultsSummary.totalQuestions} answers saved.`
            : 'Your interview answers have been saved.'}
        </p>
        <p className="interview-muted">
          Review the rule-based preliminary evaluation and saved facial-expression observations.
        </p>
        <Link className="btn btn-primary" to={`/interviews/${encodeURIComponent(sessionId)}/report`}>
          View Performance Report
        </Link>
        <Link className="btn btn-primary" to="/dashboard">Return to dashboard</Link>
      </section>
    );
  }

  const confidencePercent = typeof latestExpression?.confidence === 'number'
    ? Math.round(latestExpression.confidence * 100)
    : null;

  return (
    <InterviewRoom
      session={session}
      sessionId={sessionId}
      questionIndex={questionIndex}
      currentQuestion={currentQuestion}
      answerDraft={answerDraft}
      setAnswerDraft={setAnswerDraft}
      saving={saving}
      questionSource={session.questionSource}
      error={error}
      emotionEnabled={emotionEnabled}
      setEmotionEnabled={(enabled) => {
        setEmotionEnabled(enabled);
        setEmotionStatus('');
        if (!enabled) setLatestExpression(null);
      }}
      emotionCameraReady={emotionCameraReady}
      microphoneReady={microphoneReady}
      emotionStatus={emotionStatus}
      currentEmotion={currentEmotion}
      confidencePercent={confidencePercent}
      interviewerState={interviewerState}
      interviewerMessage={interviewerMessage}
      greetingText={greetingText}
      speechSupported={speechSupported}
      voiceEnabled={voiceEnabled}
      onToggleVoice={toggleVoice}
      onMediaReady={handleEmotionMediaReady}
      onMediaUnavailable={handleEmotionMediaUnavailable}
      onCameraControlReady={registerCameraControl}
      onCameraAction={runCameraControl}
      onRecordingChange={handleRecognitionChange}
      onReplayQuestion={replayQuestion}
      onPrevious={() => goToQuestion(questionIndex - 1)}
      onSaveNext={() => goToQuestion(questionIndex + 1)}
      onComplete={completeInterview}
      savingLabel={questionIndex < session.questions.length - 1 ? 'Saving answer…' : 'Saving interview…'}
    />
  );
}
