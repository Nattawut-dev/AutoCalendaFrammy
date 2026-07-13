import "server-only";

import { z } from "zod";
import { calendarFilename, createRosterIcs } from "@/lib/calendar/create-ics";
import { getEnv } from "@/lib/env";
import { validateRoster } from "@/lib/roster/validate";
import { verifyDownloadToken } from "@/lib/security/download-token";
import { timingSafeStringEqual } from "@/lib/security/timing-safe";
import { getRosterJob } from "@/lib/storage/jobs";

const jobIdSchema = z.uuid();

function unavailable(reason: string): Response {
  console.warn(
    JSON.stringify({
      level: "warn",
      operation: "calendar_download",
      result: "rejected",
      reason,
    }),
  );
  return new Response("Calendar link is invalid or expired", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function createCalendarDownloadResponse(
  request: Request,
  rawJobId: string,
  requestedFilename?: string,
): Promise<Response> {
  const jobIdResult = jobIdSchema.safeParse(rawJobId);
  if (!jobIdResult.success) return unavailable("invalid_job_id");
  const jobId = jobIdResult.data;
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return unavailable("missing_token");

  let payload;
  try {
    payload = verifyDownloadToken(token, jobId, getEnv().DOWNLOAD_TOKEN_SECRET);
  } catch {
    return unavailable("invalid_token");
  }

  const job = await getRosterJob(jobId);
  if (!job) return unavailable("job_not_found");
  if (Date.parse(job.expiresAt) <= Date.now())
    return unavailable("job_expired");
  if (job.status !== "confirmed") return unavailable("job_not_confirmed");
  if (!timingSafeStringEqual(payload.binding, job.userId)) {
    return unavailable("user_binding_mismatch");
  }
  if (!validateRoster(job.roster).confirmable) {
    return unavailable("roster_not_confirmable");
  }

  const filename = calendarFilename(job.roster);
  if (requestedFilename !== undefined && requestedFilename !== filename) {
    return unavailable("filename_mismatch");
  }

  const calendar = createRosterIcs(job.roster);
  console.info(
    JSON.stringify({
      level: "info",
      operation: "calendar_download",
      result: "success",
    }),
  );
  return new Response(calendar, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
