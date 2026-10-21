import { useCallback, useEffect, useRef, useState } from 'react';
import InterviewIcon from './InterviewIcon.jsx';

export default function InterviewMediaPreview({
  onMediaReady,
  onMediaUnavailable,
  onCameraControlReady,
  overlay,
  roomMode = false,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [mediaStream, setMediaStream] = useState(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!mediaStream || !video) return;

    video.srcObject = mediaStream;
    video.play().catch((playError) => {
      onMediaUnavailable?.();
      setError(
        playError instanceof Error
          ? `Camera is connected, but the preview could not start: ${playError.message}`
          : 'Camera is connected, but the preview could not start.',
      );
    });
    let notifiedReady = false;
    const handleLoaded = () => {
      if (notifiedReady || video.videoWidth === 0 || video.videoHeight === 0) return;
      notifiedReady = true;
      const microphoneReady = mediaStream.getAudioTracks()
        .some((track) => track.readyState === 'live' && track.enabled);
      onMediaReady?.(video, microphoneReady);
    };
    const videoTrack = mediaStream.getVideoTracks()[0];
    const handleEnded = () => {
      setError('Camera connection ended. Retry the camera to reconnect.');
      onMediaUnavailable?.();
    };
    videoTrack?.addEventListener('ended', handleEnded);
    video.addEventListener('loadeddata', handleLoaded);
    handleLoaded();
    return () => {
      videoTrack?.removeEventListener('ended', handleEnded);
      video.removeEventListener('loadeddata', handleLoaded);
    };
  }, [mediaStream, onMediaReady, onMediaUnavailable]);

  const enableMedia = useCallback(async () => {
    if (requesting) return;
    setError('');
    setRequesting(true);
    onMediaUnavailable?.();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setMediaStream(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setMediaStream(stream);
    } catch (mediaError) {
      setError(
        mediaError instanceof Error
          ? `Camera or microphone access failed: ${mediaError.message}`
          : 'Camera or microphone access failed. Check browser permissions and try again.',
      );
    } finally {
      setRequesting(false);
    }
  }, [onMediaUnavailable, requesting]);

  const cameraControl = useCallback(() => {
    if (requesting) return;
    if (!mediaStream || error) {
      enableMedia();
      return;
    }
    videoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [enableMedia, error, mediaStream, requesting]);

  useEffect(() => {
    onCameraControlReady?.(cameraControl);
  }, [cameraControl, onCameraControlReady]);

  return (
    <aside className={`sidebar-panel card interview-media ${roomMode ? 'room-camera-card' : ''}`} aria-label="Camera and microphone preflight">
      <div className="panel-header-row">
        <div>
          <p className="eyebrow"><InterviewIcon name="camera" size={15} /> Camera</p>
          <h2>{roomMode ? 'Candidate' : 'Live preview'}</h2>
        </div>
        <span className={`live-pill ${mediaStream && !error ? 'active' : ''}`}>
          <span aria-hidden="true">●</span>{mediaStream && !error ? 'LIVE' : 'Unavailable'}
        </span>
      </div>
      <p className="interview-muted">
        Camera access enables real-time facial-expression detection. Raw images and video are not stored.
      </p>
      {mediaStream ? (
        <div className="camera-frame">
          <video
            ref={videoRef}
            className="interview-video"
            autoPlay
            muted
            playsInline
            aria-label="Camera preview"
          />
          {overlay}
        </div>
      ) : (
        <div className="camera-frame camera-placeholder">
          <div className="camera-placeholder-inner">
            <span className="camera-icon"><InterviewIcon name="camera" size={30} /></span>
            <p>Camera preview appears here after permission is granted.</p>
          </div>
          {overlay}
        </div>
      )}
      <p className={`camera-connection-status ${mediaStream && !error ? 'connected' : ''}`} role="status">
        {mediaStream && !error
          ? <><InterviewIcon name="check" size={15} /> Camera connected</>
          : <><span aria-hidden="true">⚠</span> Camera unavailable</>}
      </p>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={enableMedia}
        disabled={requesting}
      >
        {requesting ? 'Requesting permissions…' : mediaStream ? 'Retry camera' : 'Enable camera and microphone'}
      </button>
      {error && <p className="error-text" role="alert">{error}</p>}
      {!mediaStream && !error && (
        <p className="interview-muted">Microphone access is optional for typed answers, but useful for speech recognition.</p>
      )}
    </aside>
  );
}
