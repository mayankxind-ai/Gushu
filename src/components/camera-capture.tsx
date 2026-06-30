import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, RefreshCcw, X, Send, Trash2, Loader as Loader2, Video, Square, Image, Play, Pause, ChevronLeft, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CameraCaptureProps {
  onCapture: (blob: Blob, kind: "image" | "video") => Promise<void>;
  onClose: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [flashOn, setFlashOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const flashRef = useRef<HTMLDivElement>(null);

  // Build constraints for maximum quality the device supports
  const getConstraints = useCallback(
    (facing: "user" | "environment") => {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facing,
          width: { ideal: 4096, max: 8192 },
          height: { ideal: 4096, max: 8192 },
          frameRate: { ideal: 60, max: 120 },
          aspectRatio: { ideal: 1.777 },
          // Request high-quality capture where supported
          brightness: { ideal: 50 },
          contrast: { ideal: 50 },
          saturation: { ideal: 50 },
        },
        audio: mode === "video",
      };
      return constraints;
    },
    [mode],
  );

  const startCamera = useCallback(async () => {
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const constraints = getConstraints(facingMode);
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Check for torch support
      const videoTrack = newStream.getVideoTracks()[0];
      const capabilities = videoTrack.getCapabilities?.() as any;
      if (capabilities?.torch) {
        setTorchAvailable(true);
      } else {
        setTorchAvailable(false);
      }

      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err: any) {
      toast.error(err?.message || "Camera access denied or not available");
      onClose();
    }
  }, [facingMode, getConstraints, mode, onClose, stream]);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode, mode]);

  const toggleTorch = async () => {
    const videoTrack = stream?.getVideoTracks()[0];
    if (!videoTrack) return;
    try {
      const capabilities = videoTrack.getCapabilities?.() as any;
      if (!capabilities?.torch) return;
      const next = !flashOn;
      await (videoTrack as any).applyConstraints({ advanced: [{ torch: next }] });
      setFlashOn(next);
    } catch {
      toast.error("Flash not available on this device");
    }
  };

  const doFlash = () => {
    const el = flashRef.current;
    if (!el) return;
    el.style.opacity = "1";
    requestAnimationFrame(() => {
      el.style.transition = "opacity 150ms ease-out";
      el.style.opacity = "0";
    });
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // If mirrored (user-facing), flip back so the saved image is correct
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Flash effect
    doFlash();

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          setStream(null);
        }
      },
      "image/jpeg",
      0.95,
    );
  };

  const startRecording = () => {
    if (!stream) return;
    const options: MediaRecorderOptions = {};
    const mimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        options.mimeType = type;
        break;
      }
    }
    if (options.mimeType) options.videoBitsPerSecond = 8000000;

    const recorder = new MediaRecorder(stream, options);
    recordedChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const mime = options.mimeType || "video/webm";
      const blob = new Blob(recordedChunksRef.current, { type: mime });
      setCapturedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setIsRecording(false);
      setRecordDuration(0);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
    };

    recorder.onerror = () => {
      toast.error("Recording failed");
      setIsRecording(false);
      setRecordDuration(0);
    };

    recorder.start(100);
    recorderRef.current = recorder;
    setIsRecording(true);
    setRecordDuration(0);
    recordTimerRef.current = setInterval(() => {
      setRecordDuration((d) => d + 1);
    }, 1000);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const handleSend = async () => {
    if (!capturedBlob) return;
    setBusy(true);
    try {
      await onCapture(capturedBlob, mode === "video" ? "video" : "image");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = () => {
    setCapturedBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setVideoPlaying(false);
    startCamera();
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white md:rounded-3xl md:inset-4 md:shadow-2xl overflow-hidden">
      {/* Flash overlay */}
      <div ref={flashRef} className="pointer-events-none absolute inset-0 z-30 bg-white opacity-0" />

      {/* Top bar */}
      <div className="flex items-center justify-between p-4 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h3 className="text-sm font-medium">
            {mode === "photo" ? "Capture Photo" : "Record Video"}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center rounded-full bg-white/10 p-0.5">
            <button
              onClick={() => setMode("photo")}
              className={`rounded-full p-1.5 transition-colors ${mode === "photo" ? "bg-white/20 text-white" : "text-white/50 hover:text-white"}`}
              aria-label="Photo mode"
            >
              <Image className="size-4" />
            </button>
            <button
              onClick={() => setMode("video")}
              className={`rounded-full p-1.5 transition-colors ${mode === "video" ? "bg-white/20 text-white" : "text-white/50 hover:text-white"}`}
              aria-label="Video mode"
            >
              <Video className="size-4" />
            </button>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10">
            <X className="size-6" />
          </Button>
        </div>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 bg-neutral-900 overflow-hidden flex items-center justify-center">
        {!capturedBlob ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                transform: facingMode === "user" ? "scaleX(-1)" : "none",
              }}
            />

            {/* Recording indicator */}
            {isRecording && (
              <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2 flex items-center gap-2 rounded-full bg-red-500/90 px-4 py-1.5 text-sm font-semibold text-white shadow-lg">
                <span className="size-2.5 rounded-full bg-white animate-pulse" />
                {formatDuration(recordDuration)}
              </div>
            )}

            {/* Controls */}
            <div className="absolute bottom-10 left-0 right-0 z-20 flex items-center justify-center gap-6">
              {/* Flash */}
              {torchAvailable && mode === "photo" && (
                <button
                  onClick={toggleTorch}
                  className="grid size-12 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Toggle flash"
                >
                  {flashOn ? <Zap className="size-5" /> : <ZapOff className="size-5" />}
                </button>
              )}

              {/* Flip camera */}
              <button
                onClick={toggleCamera}
                className="grid size-12 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Switch camera"
              >
                <RefreshCcw className="size-6" />
              </button>

              {/* Shutter / Record */}
              {mode === "photo" ? (
                <button
                  onClick={capturePhoto}
                  className="size-20 rounded-full border-4 border-white bg-transparent transition-transform hover:scale-105 active:scale-95"
                >
                  <div className="size-16 rounded-full bg-white" />
                </button>
              ) : (
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className="grid size-20 place-items-center rounded-full border-4 border-white bg-transparent transition-transform hover:scale-105 active:scale-95"
                >
                  {isRecording ? (
                    <div className="size-10 rounded-md bg-red-500" />
                  ) : (
                    <div className="size-16 rounded-full bg-red-500" />
                  )}
                </button>
              )}

              {/* Spacer to balance layout */}
              <div className="size-12" />
            </div>
          </>
        ) : (
          <>
            {/* Preview */}
            {mode === "video" && previewUrl ? (
              <div className="relative h-full w-full">
                <video
                  src={previewUrl}
                  className="h-full w-full object-contain"
                  controls={false}
                  onClick={(e) => {
                    const v = e.currentTarget;
                    if (v.paused) {
                      v.play();
                      setVideoPlaying(true);
                    } else {
                      v.pause();
                      setVideoPlaying(false);
                    }
                  }}
                />
                {!videoPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <button
                      onClick={() => {
                        const v = document.querySelector("video[src='" + previewUrl + "']") as HTMLVideoElement;
                        v?.play();
                        setVideoPlaying(true);
                      }}
                      className="grid size-16 place-items-center rounded-full bg-white/20 backdrop-blur-sm transition-transform hover:scale-110"
                    >
                      <Play className="size-8 text-white fill-white" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              previewUrl && (
                <img src={previewUrl} alt="Captured" className="h-full w-full object-contain" />
              )
            )}

            {/* Bottom actions */}
            <div className="absolute bottom-10 left-0 right-0 z-20 flex items-center justify-center gap-4 px-4">
              <Button
                variant="secondary"
                onClick={handleDiscard}
                className="flex-1 gap-2 rounded-xl"
                disabled={busy}
              >
                <Trash2 className="size-4" />
                Retake
              </Button>
              <Button
                onClick={handleSend}
                className="flex-1 gap-2 rounded-xl brand-gradient"
                disabled={busy}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send
              </Button>
            </div>
          </>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
