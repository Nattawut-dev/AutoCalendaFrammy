import "server-only";

import { createFeedIcs } from "@/lib/calendar/create-ics";
import { validateRoster } from "@/lib/roster/validate";
import { findFeedOwner, getFeedRosters } from "@/lib/storage/feed";

const HEADERS = {
  "Cache-Control": "private, no-cache",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

/** Serves /api/feed/<token>.ics — the subscribed calendar for one person. */
export async function createFeedResponse(file: string): Promise<Response> {
  const token = file.endsWith(".ics") ? file.slice(0, -4) : "";
  const owner = token ? await findFeedOwner(token) : null;
  if (!owner) {
    console.warn(
      JSON.stringify({
        level: "warn",
        operation: "calendar_feed",
        result: "rejected",
      }),
    );
    return new Response("Calendar link is invalid or was reset", {
      status: 404,
      headers: HEADERS,
    });
  }
  const rosters = (await getFeedRosters(owner)).filter(
    (roster) => validateRoster(roster).confirmable,
  );
  console.info(
    JSON.stringify({
      level: "info",
      operation: "calendar_feed",
      result: "success",
      months: rosters.length,
    }),
  );
  return new Response(createFeedIcs(rosters), {
    status: 200,
    headers: {
      ...HEADERS,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="nanchaya-roster.ics"',
    },
  });
}
