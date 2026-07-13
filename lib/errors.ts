export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedLineUserError extends AppError {
  constructor() {
    super("LINE user is not authorized", "UNAUTHORIZED_LINE_USER");
  }
}
export class InvalidLineSignatureError extends AppError {
  constructor() {
    super("Invalid LINE signature", "INVALID_LINE_SIGNATURE");
  }
}
export class LineContentDownloadError extends AppError {
  constructor() {
    super("Unable to download LINE content", "LINE_CONTENT_DOWNLOAD_FAILED");
  }
}
export class UnsupportedImageError extends AppError {
  constructor(message = "Unsupported image") {
    super(message, "UNSUPPORTED_IMAGE");
  }
}
export class GeminiAnalysisError extends AppError {
  constructor() {
    super("Gemini analysis failed", "GEMINI_ANALYSIS_FAILED");
  }
}
export class RosterValidationError extends AppError {
  constructor(readonly issues: string[]) {
    super("Roster validation failed", "ROSTER_VALIDATION_FAILED");
  }
}
export class JobNotFoundError extends AppError {
  constructor() {
    super("Job not found", "JOB_NOT_FOUND");
  }
}
export class JobExpiredError extends AppError {
  constructor() {
    super("Job expired", "JOB_EXPIRED");
  }
}
export class InvalidDownloadTokenError extends AppError {
  constructor() {
    super("Invalid download token", "INVALID_DOWNLOAD_TOKEN");
  }
}
