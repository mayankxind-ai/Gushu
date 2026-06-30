import { useState, useRef, useEffect } from "react";
import { Mic, Square, Trash2, Send, Loader2, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface VoiceRecorderProps {
  onSend: (blob: Blob) => Promise<void>;
  onCancel: () => void;
}

export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      toast.error("Microphone access denied or not available");
      onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleSend = async () => {
    if (!recordedBlob) return;
    setBusy(true);
    try {
      await onSend(recordedBlob);
    } catch (err) {
      console.error("Failed to send voice note:", err);
      toast.error("Failed to send voice note");
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = () => {
    setRecordedBlob(null);
    setPreviewUrl(null);
    setDuration(0);
    if (!isRecording) onCancel();
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    // Start recording automatically when component mounts
    startRecording();
  }, []);

  return (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-muted/50 p-2 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2">
      <div className="flex h-10 flex-1 items-center gap-3 px-3">
        {isRecording ? (
          <>
            <div className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
            </div>
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatDuration(duration)}
            </span>
            <div className="flex-1 overflow-hidden">
              <div className="flex gap-0.5 items-center justify-center">
                {[...Array(20)].map((_, i) => (
                  <div 
                    key={i} 
                    className="w-0.5 bg-primary/40 rounded-full animate-pulse" 
                    style={{ 
                      height: `${Math.random() * 16 + 4}px`,
                      animationDelay: `${i * 0.05}s`
                    }} 
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={togglePlayback}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatDuration(duration)}
            </span>
            <div className="flex-1 h-1 bg-primary/20 rounded-full overflow-hidden">
              <div className={cn("h-full bg-primary transition-all duration-300", isPlaying ? "w-full" : "w-0")} />
            </div>
          </>
        )}
      </div>

      <audio 
        ref={audioRef} 
        src={previewUrl || ""} 
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="size-10 text-muted-foreground hover:text-destructive"
          onClick={handleDiscard}
          disabled={busy}
        >
          <Trash2 className="size-5" />
        </Button>
        
        {isRecording ? (
          <Button
            size="icon"
            className="size-10 rounded-full bg-red-500 hover:bg-red-600"
            onClick={stopRecording}
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="size-10 rounded-full brand-gradient"
            onClick={handleSend}
            disabled={busy || !recordedBlob}
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Send className="size-5" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
