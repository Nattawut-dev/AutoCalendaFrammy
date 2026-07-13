export const EMPLOYEE_NAME = "NANCHAYA" as const;
export const TIMEZONE = "Asia/Bangkok" as const;
export const JOB_TTL_SECONDS = 30 * 60;
export const DOWNLOAD_TOKEN_TTL_SECONDS = 15 * 60;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_RATE_LIMIT = 5;
export const IMAGE_RATE_WINDOW_SECONDS = 60 * 60;
export const MIN_SHIFT_CONFIDENCE = 0.88;
export const MIN_SPECIAL_EVENT_CONFIDENCE = 0.85;

export const KNOWN_SHIFT_TIMES: Readonly<
  Record<string, { start: string; end: string }>
> = {
  F9: { start: "06:00", end: "16:00" },
  HH9: { start: "08:30", end: "18:30" },
  JJ9: { start: "10:30", end: "20:30" },
  K9: { start: "11:00", end: "21:00" },
  M7: { start: "13:00", end: "21:00" },
  L8: { start: "12:00", end: "21:00" },
  I8: { start: "09:00", end: "18:00" },
};
