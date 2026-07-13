import "server-only";

import { calendarFilename } from "@/lib/calendar/create-ics";
import type { StoredRosterJob } from "@/lib/types";

export function createCalendarDownloadUrl(
  appBaseUrl: string,
  job: StoredRosterJob,
  token: string,
): string {
  const url = new URL(
    `/api/calendar/${job.id}/${calendarFilename(job.roster)}`,
    appBaseUrl,
  );
  url.searchParams.set("token", token);
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}
