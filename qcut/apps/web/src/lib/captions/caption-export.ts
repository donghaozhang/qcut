import type { TranscriptionSegment } from "@/types/captions";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";

export type CaptionFormat = "srt" | "vtt" | "ass" | "ttml";

export interface CaptionExportOptions {
  format?: CaptionFormat;
  language?: string;
  includeTimestamps?: boolean;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
}

/**
 * Convert timeline caption elements to caption segments
 */
export function extractCaptionSegments(tracks: TimelineTrack[]): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];
  
  tracks
    .filter(track => track.type === "captions")
    .forEach(track => {
      track.elements.forEach((element, index) => {
        if (element.type === "captions") {
          segments.push({
            id: index + 1,
            seek: element.startTime * 1000,
            start: element.startTime,
            end: element.startTime + element.duration,
            text: element.text,
            tokens: [],
            temperature: 0.0,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
            no_speech_prob: element.confidence ? 1 - element.confidence : 0.1,
          });
        }
      });
    });
  
  return segments.sort((a, b) => a.start - b.start);
}

/**
 * Format time for SRT format (HH:MM:SS,mmm)
 */
function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Format time for VTT format (HH:MM:SS.mmm)
 */
function formatVttTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Export captions in SRT format
 */
export function exportSrt(segments: TranscriptionSegment[], options: Partial<CaptionExportOptions> = {}): string {
  let content = "";
  
  segments.forEach((segment, index) => {
    content += `${index + 1}\n`;
    content += `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n`;
    content += `${segment.text.trim()}\n\n`;
  });
  
  return content.trim();
}

/**
 * Export captions in VTT format
 */
export function exportVtt(segments: TranscriptionSegment[], options: Partial<CaptionExportOptions> = {}): string {
  let content = "WEBVTT\n\n";
  
  if (options.language) {
    content += `Language: ${options.language}\n\n`;
  }
  
  segments.forEach((segment, index) => {
    content += `${index + 1}\n`;
    content += `${formatVttTime(segment.start)} --> ${formatVttTime(segment.end)}\n`;
    content += `${segment.text.trim()}\n\n`;
  });
  
  return content.trim();
}

/**
 * Export captions in ASS format (Advanced SubStation Alpha)
 */
export function exportAss(segments: TranscriptionSegment[], options: Partial<CaptionExportOptions> = {}): string {
  const fontFamily = options.fontFamily || "Arial";
  const fontSize = options.fontSize || 16;
  const fontColor = options.fontColor || "&Hffffff";
  
  let content = `[Script Info]
Title: QCut Generated Subtitles
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${fontColor},&Hffffff,&H0,&H0,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  segments.forEach((segment) => {
    const startTime = formatAssTime(segment.start);
    const endTime = formatAssTime(segment.end);
    content += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${segment.text.trim()}\n`;
  });
  
  return content;
}

/**
 * Format time for ASS format (H:MM:SS.cc)
 */
function formatAssTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100); // centiseconds
  
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

/**
 * Export captions in TTML format (Timed Text Markup Language)
 */
export function exportTtml(segments: TranscriptionSegment[], options: Partial<CaptionExportOptions> = {}): string {
  const language = options.language || "en";
  
  let content = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" 
    xmlns:tts="http://www.w3.org/ns/ttml#styling" 
    xml:lang="${language}">
  <head>
    <styling>
      <style xml:id="defaultStyle" 
             tts:fontFamily="${options.fontFamily || 'Arial'}" 
             tts:fontSize="${options.fontSize || 16}px" 
             tts:color="${options.fontColor || 'white'}" 
             tts:textAlign="center"/>
    </styling>
  </head>
  <body style="defaultStyle">
    <div>
`;

  segments.forEach((segment) => {
    const startTime = formatTtmlTime(segment.start);
    const endTime = formatTtmlTime(segment.end);
    content += `      <p begin="${startTime}" end="${endTime}">${escapeXml(segment.text.trim())}</p>\n`;
  });

  content += `    </div>
  </body>
</tt>`;
  
  return content;
}

/**
 * Format time for TTML format (HH:MM:SS.mmm)
 */
function formatTtmlTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Main export function that handles all formats
 */
export function exportCaptions(
  segments: TranscriptionSegment[], 
  format: CaptionFormat, 
  options: Partial<CaptionExportOptions> = {}
): string {
  switch (format) {
    case "srt":
      return exportSrt(segments, options);
    case "vtt":
      return exportVtt(segments, options);
    case "ass":
      return exportAss(segments, options);
    case "ttml":
      return exportTtml(segments, options);
    default:
      throw new Error(`Unsupported caption format: ${format}`);
  }
}

/**
 * Get file extension for caption format
 */
export function getCaptionFileExtension(format: CaptionFormat): string {
  switch (format) {
    case "srt":
      return "srt";
    case "vtt":
      return "vtt";
    case "ass":
      return "ass";
    case "ttml":
      return "ttml";
    default:
      return "txt";
  }
}

/**
 * Get MIME type for caption format
 */
export function getCaptionMimeType(format: CaptionFormat): string {
  switch (format) {
    case "srt":
      return "text/srt";
    case "vtt":
      return "text/vtt";
    case "ass":
      return "text/x-ssa";
    case "ttml":
      return "application/ttml+xml";
    default:
      return "text/plain";
  }
}

/**
 * Download captions as file
 */
export function downloadCaptions(
  segments: TranscriptionSegment[],
  format: CaptionFormat,
  filename: string,
  options: Partial<CaptionExportOptions> = {}
): void {
  const content = exportCaptions(segments, format, options);
  const extension = getCaptionFileExtension(format);
  const mimeType = getCaptionMimeType(format);
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}