import { createCalendarDownloadResponse } from "@/lib/calendar/download-response";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await context.params;
  return createCalendarDownloadResponse(request, jobId);
}
