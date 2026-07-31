import { useEffect, useRef, useState } from 'react';
import { useSpeech } from '../useSpeech.js';

interface RecorderOptions {
  onSaved?: (result: { blob: Blob; transcript: string }) => void;
  onError?: (message: string) => void;
}

// Encapsulates the camera + MediaRecorder + timer + speech-capture lifecycle.
// The component handles what to do with the result via `onSaved({ blob, transcript })`.
export function useRecorder({ onSaved, onError }: RecorderOptions = {}) {
  const { startDictation, stopDictation } = useSpeech();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);

  // Turn everything off when the component unmounts (camera/mic light off).
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current ?? undefined);
      try {
        if (recRef.current && recRef.current.state === 'recording') recRef.current.stop();
      } catch {
        /* already stopped */
      }
      stopDictation();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  async function enableCam() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = s;
      setStream(s);
    } catch {
      onError?.('Permita o acesso à câmera e ao microfone (precisa de HTTPS).');
    }
  }

  function disableCam() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }

  function start() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' });
    } catch {
      mr = new MediaRecorder(streamRef.current);
    }
    recRef.current = mr;
    mr.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      onSaved?.({ blob, transcript: transcriptRef.current });
    };
    mr.start();
    setRecording(true);
    setElapsed(0);
    transcriptRef.current = '';
    setLiveTranscript('');
    try {
      startDictation({ onInterim: setLiveTranscript }); // capture speech for AI feedback
    } catch {
      /* dictation unsupported — recording still works */
    }
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }

  async function stop() {
    setRecording(false);
    clearInterval(timerRef.current ?? undefined);
    try {
      transcriptRef.current = await stopDictation();
    } catch {
      transcriptRef.current = '';
    }
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }

  return { videoRef, stream, recording, elapsed, liveTranscript, enableCam, disableCam, start, stop };
}
