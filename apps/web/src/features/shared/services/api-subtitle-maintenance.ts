import { request } from "./api-core";

export type SubtitlePreExtractionStatus =
  "idle" | "running" | "completed" | "failed";

export interface SubtitlePreExtractionProgress {
  jobId: string | null;
  status: SubtitlePreExtractionStatus;
  totalMediaItems: number;
  processedMediaItems: number;
  extractedTracks: number;
  existingTracks: number;
  unsupportedTracks: number;
  failedTracks: number;
  failedMediaItems: number;
  currentMediaTitle: string | null;
  message: string | null;
  error: string | null;
  lastFailure: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
}

export function startSubtitlePreExtraction(token: string) {
  return request<SubtitlePreExtractionProgress>(
    "/admin/subtitles/pre-extraction/start",
    { method: "POST" },
    token,
  );
}

export function getSubtitlePreExtractionProgress(token: string) {
  return request<SubtitlePreExtractionProgress>(
    "/admin/subtitles/pre-extraction/status",
    {},
    token,
  );
}
