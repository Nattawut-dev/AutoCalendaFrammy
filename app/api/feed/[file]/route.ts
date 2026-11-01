import { createFeedResponse } from "@/lib/calendar/feed-response";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await context.params;
  return createFeedResponse(file);
}
