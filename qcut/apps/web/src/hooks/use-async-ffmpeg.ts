import { useEffect, useState, useRef } from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { createFFmpeg } from "@/lib/ffmpeg-loader";

export function useAsyncFFmpeg() {
  const [ffmpeg, setFFmpeg] = useState<FFmpeg | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadFFmpeg() {
      try {
        const instance = await createFFmpeg();

        if (mounted) {
          // Set up progress callback
          instance.on("progress", ({ progress }) => {
            if (mounted) {
              setProgress(Math.round(progress * 100));
            }
          });

          ffmpegRef.current = instance;
          setFFmpeg(instance);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err : new Error("Failed to load FFmpeg")
          );
          setLoading(false);
        }
      }
    }

    loadFFmpeg();

    return () => {
      mounted = false;
      // Clean up FFmpeg instance if needed
      if (ffmpegRef.current) {
        // FFmpeg cleanup if necessary
      }
    };
  }, []);

  return { ffmpeg, loading, error, progress };
}

// Hook for loading FFmpeg utilities
export function useAsyncFFmpegUtils() {
  const [utils, setUtils] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadUtils() {
      try {
        const { getFFmpegUtilFunctions } = await import(
          "@/lib/ffmpeg-utils-loader"
        );
        const utilFunctions = await getFFmpegUtilFunctions();

        if (mounted) {
          setUtils(utilFunctions);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err
              : new Error("Failed to load FFmpeg utilities")
          );
          setLoading(false);
        }
      }
    }

    loadUtils();

    return () => {
      mounted = false;
    };
  }, []);

  return { utils, loading, error };
}
