import { createCalendarDownloadResponse } from "@/lib/calendar/download-response";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string; filename: string }> },
): Promise<Response> {
  const { jobId, filename } = await context.params;
  return createCalendarDownloadResponse(request, jobId, filename);
}
