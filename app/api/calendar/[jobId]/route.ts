import { z } from "zod";
import { calendarFilename, createRosterIcs } from "@/lib/calendar/create-ics";
import { getEnv } from "@/lib/env";
import { validateRoster } from "@/lib/roster/validate";
import { verifyDownloadToken } from "@/lib/security/download-token";
import { timingSafeStringEqual } from "@/lib/security/timing-safe";
import { getRosterJob } from "@/lib/storage/jobs";

export const runtime = "nodejs";

const jobIdSchema = z.uuid();

function unavailable(): Response {
  return new Response("Calendar link is invalid or expired", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  try {
    const { jobId: rawJobId } = await context.params;
    const jobId = jobIdSchema.parse(rawJobId);
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return unavailable();
    const payload = verifyDownloadToken(
      token,
      jobId,
      getEnv().DOWNLOAD_TOKEN_SECRET,
    );
    const job = await getRosterJob(jobId);
    if (
      !job ||
      Date.parse(job.expiresAt) <= Date.now() ||
      job.status !== "confirmed" ||
      !timingSafeStringEqual(payload.binding, job.userId) ||
      !validateRoster(job.roster).confirmable
    ) {
      return unavailable();
    }
    const calendar = createRosterIcs(job.roster);
    return new Response(calendar, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${calendarFilename(job.roster)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return unavailable();
  }
}
