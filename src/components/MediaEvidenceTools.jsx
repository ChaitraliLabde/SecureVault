import { Camera, Mic, Pause, Play, RotateCcw, Square, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

export function CameraEvidenceCapture({ caseId, disabled = false, onSaved }) {
  const { notify } = useApp();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [capture, setCapture] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!capture) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(capture);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [capture]);

  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => setError("Camera preview could not start."));
    }
  }, [open, capture]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const close = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCapture(null);
    setError("");
    setOpen(false);
  };

  const startCamera = async () => {
    setError("");
    setCapture(null);
    setCameraReady(false);
    setOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera capture is not supported in this browser. Use HTTPS or localhost and a supported browser.");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (cameraError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(cameraError.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in the browser to capture evidence."
        : `Camera could not be opened: ${cameraError.message}`);
    }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("Camera preview is not ready yet.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Could not access the photo capture canvas.");
      return;
    }
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Could not encode the captured photo.");
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraReady(false);
      setCapture(blob);
      setError("");
    }, "image/jpeg", 0.94);
  };

  const savePhoto = async () => {
    if (!capture || !caseId) return;
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", capture, `camera-evidence-${Date.now()}.jpg`);
      form.append("caseId", caseId);
      form.append("type", "Digital Evidence");
      form.append("title", "Camera Evidence Capture");
      form.append("description", "Photograph captured in SecureVault using the browser camera.");
      form.append("captureSource", "camera");
      const result = await api("/api/documents", { method: "POST", form });
      notify("Camera evidence saved. SHA-256 recorded and custody event logged.");
      onSaved?.(result.document);
      close();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button className="btn btn-ghost" type="button" onClick={startCamera} disabled={disabled || !caseId}>
        <Camera size={16} /> Capture Evidence Photo / Scan
      </button>
      {open ? (
        <div className="media-modal-backdrop" role="presentation">
          <section className="media-modal card" role="dialog" aria-modal="true" aria-labelledby="camera-capture-title">
            <div className="media-modal-head">
              <div>
                <h2 id="camera-capture-title">Capture Evidence Photo / Scan</h2>
                <p className="muted">The saved image is linked to case {caseId}; its SHA-256 is recorded by the server.</p>
              </div>
              <button className="icon-btn" type="button" aria-label="Close camera" onClick={close}><X size={18} /></button>
            </div>
            {capture && previewUrl ? (
              <img className="camera-preview" src={previewUrl} alt="Captured evidence preview" />
            ) : (
              <video className="camera-preview" ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview" />
            )}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="actions-row">
              {capture ? (
                <>
                  <button className="btn btn-ghost" type="button" onClick={startCamera} disabled={saving}>
                    <RotateCcw size={16} /> Retake
                  </button>
                  <button className="btn btn-primary" type="button" onClick={savePhoto} disabled={saving}>
                    <Upload size={16} /> {saving ? "Saving evidence…" : "Save Evidence to Case"}
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" type="button" onClick={takePhoto} disabled={!cameraReady}>
                  <Camera size={16} /> Take Photo
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function AudioEvidenceRecorder({ caseId, disabled = false, onSaved }) {
  const { notify } = useApp();
  const previewRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const meterFrameRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [audioDocument, setAudioDocument] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [savingAudio, setSavingAudio] = useState(false);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [transcriptSaved, setTranscriptSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!audioFile) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(audioFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  const stopAudioMeter = () => {
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setAudioLevel(0);
  };

  const discardRecording = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current.removeAttribute("src");
      previewRef.current.load();
    }
    audioChunksRef.current = [];
    recorderRef.current = null;
    setPreviewUrl("");
    setAudioFile(null);
    setAudioDocument(null);
    setTranscript("");
    setTranscriptSaved(false);
    setRecording(false);
    setPaused(false);
    setFinalizing(false);
    setError("");
    setAudioLevel(0);
  };

  useEffect(() => () => {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    stopAudioMeter();
  }, []);

  const startRecording = async () => {
    setError("");
    setAudioFile(null);
    setAudioDocument(null);
    setTranscript("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Audio recording is not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        stream.getAudioTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setError("This browser does not support WebM audio recording. Use a current Chrome, Edge, or Firefox browser.");
        return;
      }
      const audioContext = new AudioContext();
      await audioContext.resume();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      const samples = new Uint8Array(analyser.fftSize);
      const updateLevel = () => {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + (sample - 128) ** 2, 0) / samples.length);
        setAudioLevel(Math.min(100, Math.round((rms / 64) * 100)));
        meterFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("The browser could not complete the audio recording.");
        setRecording(false);
        setPaused(false);
        setFinalizing(false);
        streamRef.current?.getAudioTracks().forEach((track) => track.stop());
        streamRef.current = null;
        stopAudioMeter();
      };
      recorder.onstop = () => {
        setRecording(false);
        setPaused(false);
        setFinalizing(false);
        streamRef.current?.getAudioTracks().forEach((track) => track.stop());
        streamRef.current = null;
        stopAudioMeter();
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size === 0) {
          setError("No audio recorded. Please check microphone permissions.");
          return;
        }
        const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, { type: mimeType });
        setAudioFile(audioFile);
      };
      audioChunksRef.current = [];
      recorder.start(100);
      setRecording(true);
      setPaused(false);
    } catch (recordError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      stopAudioMeter();
      setError(recordError.name === "NotAllowedError"
        ? "Microphone permission was denied. Allow microphone access in the browser to record evidence."
        : `Microphone could not be opened: ${recordError.message}`);
    }
  };

  const pauseRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.pause();
      setPaused(true);
    } else if (recorder?.state === "paused") {
      recorder.resume();
      setPaused(false);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state !== "inactive") {
      setFinalizing(true);
      recorderRef.current.stop();
    }
  };

  const saveAudio = async () => {
    if (!audioFile || audioFile.size === 0 || !caseId) {
      setError("No audio recorded. Please check microphone permissions.");
      return;
    }
    setSavingAudio(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", audioFile);
      form.append("caseId", caseId);
      form.append("type", "Digital Evidence");
      form.append("title", "Audio Interview Recording");
      form.append("description", "Original audio recorded in SecureVault using the browser MediaRecorder API.");
      form.append("captureSource", "audio");
      const result = await api("/api/documents", { method: "POST", form });
      setAudioDocument(result.document);
      setTranscriptSaved(false);
      notify("Original audio saved as protected evidence. SHA-256 recorded.");
      onSaved?.(result.document);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingAudio(false);
    }
  };

  const saveTranscript = async () => {
    if (!audioDocument || !transcript.trim()) return;
    setSavingTranscript(true);
    setError("");
    try {
      const transcriptBlob = new Blob([transcript.trim()], { type: "text/plain;charset=utf-8" });
      const form = new FormData();
      form.append("file", transcriptBlob, `${audioDocument.id}-transcript.txt`);
      form.append("caseId", caseId);
      form.append("type", "Investigation Report");
      form.append("title", `${audioDocument.title} - Transcript (Derivative)`);
      form.append("description", `Derivative transcript/notes associated with original audio evidence ${audioDocument.id}. This text is not the original recording.`);
      form.append("captureSource", "transcript");
      form.append("derivativeOf", audioDocument.id);
      const result = await api("/api/documents", { method: "POST", form });
      setTranscriptSaved(true);
      notify("Transcript saved separately as a derivative document.");
      onSaved?.(result.document);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingTranscript(false);
    }
  };

  return (
    <section className="card card-pad media-evidence-tool" aria-label="Audio evidence recording">
      <div className="card-title"><Mic size={17} /> Audio Recording / Interview Notes</div>
      <p className="muted">Recordings are saved as separate, SHA-256-protected evidence files. Transcript notes are stored separately as derivatives.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="actions-row">
        {!recording ? (
          <button className="btn btn-primary" type="button" onClick={startRecording} disabled={disabled || finalizing || savingAudio || savingTranscript}>
            <Mic size={16} /> {finalizing ? "Finalizing Recording…" : "Start Recording"}
          </button>
        ) : (
          <>
            <button className="btn btn-ghost" type="button" onClick={pauseRecording} disabled={finalizing}>
              <Pause size={16} /> {paused ? "Resume" : "Pause"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={stopRecording} disabled={finalizing}>
              <Square size={16} /> Stop
            </button>
          </>
        )}
      </div>
      {recording ? <p className="recording-indicator" role="status">{paused ? "Recording paused" : "Recording in progress…"}</p> : null}
      {recording || audioFile ? (
        <div className="audio-level" aria-label="Microphone input level">
          <label htmlFor="audio-level-meter">Microphone level</label>
          <meter id="audio-level-meter" min="0" max="100" value={audioLevel}>{audioLevel}%</meter>
          <span>{recording ? (paused ? "Paused" : audioLevel > 4 ? "Audio detected" : "Listening…") : "Recording stopped"}</span>
        </div>
      ) : null}
      {audioFile ? (
        <div className="audio-evidence-preview">
          <div className="card-title">Recording Preview</div>
          {previewUrl ? <audio ref={previewRef} controls src={previewUrl} aria-label="Recorded audio preview" /> : <p>Preparing preview…</p>}
          <p className="muted">Captured file: {audioFile.name} · {audioFile.size.toLocaleString()} bytes</p>
          <div className="actions-row">
            <button className="btn btn-ghost" type="button" onClick={() => previewRef.current?.play()}>
              <Play size={16} /> Play Preview
            </button>
            <button className="btn btn-primary" type="button" onClick={saveAudio} disabled={savingAudio || Boolean(audioDocument)}>
              <Upload size={16} /> {savingAudio ? "Saving audio…" : audioDocument ? "Original Audio Saved" : "Save Original Audio"}
            </button>
            {!audioDocument ? (
              <button className="btn btn-ghost" type="button" onClick={discardRecording} disabled={savingAudio || savingTranscript}>
                Discard / Retake Audio
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {audioDocument ? (
        <div className="derivative-panel">
          <strong>Optional Transcript / Interview Notes</strong>
          <p className="muted">This text will be a separate derivative document linked to the protected original audio, not a replacement or edit of the recording.</p>
          <textarea
            className="textarea"
            rows={5}
            value={transcript}
            maxLength={50000}
            onChange={(event) => { setTranscript(event.target.value); setTranscriptSaved(false); }}
            placeholder="Enter manually prepared transcript or interview notes…"
            aria-label="Optional derivative transcript"
          />
          <button className="btn btn-ghost" type="button" onClick={saveTranscript} disabled={!transcript.trim() || savingTranscript || transcriptSaved}>
            <Upload size={16} /> {savingTranscript ? "Saving transcript…" : transcriptSaved ? "Transcript Saved as Derivative" : "Save Transcript as Derivative"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
