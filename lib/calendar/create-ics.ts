import "server-only";

import { createHash } from "node:crypto";
import { createEvents, type EventAttributes } from "ics";
import { shiftPresentation, STATUS_PRESENTATION } from "@/lib/roster/status";
import type { RosterAnalysis } from "@/lib/types";
import { addOneDay } from "@/lib/utils/date";
import { sanitizeFilename } from "@/lib/utils/text";

const PRODUCT_ID = "-//NANCHAYA Roster Bot//TH";
const EVENT_BACKGROUND_COLOR = "mediumpurple";
const BANGKOK_TIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Asia/Bangkok",
  "X-LIC-LOCATION:Asia/Bangkok",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0700",
  "TZOFFSETTO:+0700",
  "TZNAME:+07",
  "DTSTART:19700101T000000",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

function dateTimeArray(
  date: string,
  time: string,
): [number, number, number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return [year, month, day, hour, minute];
}

function deterministicUid(parts: string[]): string {
  return `${createHash("sha256").update(parts.join("\u001f")).digest("hex")}@nanchaya-roster-bot`;
}

function eventEndDate(date: string, start: string, end: string): string {
  return end <= start ? addOneDay(date) : date;
}

function commonEvent(input: {
  date: string;
  start: string;
  end: string;
  title: string;
  description: string;
  uidParts: string[];
  categories: string[];
}): EventAttributes {
  return {
    start: dateTimeArray(input.date, input.start),
    end: dateTimeArray(
      eventEndDate(input.date, input.start, input.end),
      input.end,
    ),
    startInputType: "local",
    startOutputType: "local",
    endInputType: "local",
    endOutputType: "local",
    title: input.title,
    description: input.description,
    categories: input.categories,
    uid: deterministicUid(input.uidParts),
    status: "CONFIRMED",
    alarms: [
      {
        action: "display",
        description: input.title,
        trigger: { hours: 1, before: true },
      },
    ],
  };
}

type ColoredEvent = {
  attributes: EventAttributes;
  color: string;
};

export function calendarFilename(
  roster: Pick<RosterAnalysis, "year" | "month">,
): string {
  return sanitizeFilename(
    `NANCHAYA-${roster.year}-${String(roster.month).padStart(2, "0")}.ics`,
  );
}

/**
 * Feed events are keyed by date (one shift per day), so a corrected month
 * replaces the old shift instead of adding a second one. Downloaded files keep
 * their original IDs so calendars that already imported them do not duplicate.
 */
type UidStyle = "download" | "feed";

function rosterEvents(roster: RosterAnalysis, uidStyle: UidStyle) {
  const events: ColoredEvent[] = [];

  for (const shift of roster.shifts) {
    const shiftMarker = shiftPresentation(shift.code).emoji;
    const statusPresentation = STATUS_PRESENTATION[shift.status];
    const statusDescription =
      shift.status === "NORMAL" ? "" : `\nสถานะ: ${statusPresentation.label}`;
    const coworkersDescription =
      shift.coworkers && shift.coworkers.length > 0
        ? `\nเข้างานกับ: ${shift.coworkers.map((c) => `${c.name} (${c.code})`).join(", ")}`
        : "";
    if (shift.isDayOff || !shift.start || !shift.end) continue;
    const statusTitle =
      shift.status === "NORMAL"
        ? ""
        : ` · ${statusPresentation.emoji} ${statusPresentation.label}`;
    const title = `กะ ${shift.code} ${shiftMarker}${statusTitle}`;
    events.push({
      attributes: commonEvent({
        date: shift.date,
        start: shift.start,
        end: shift.end,
        title,
        description: `รหัสกะ: ${shift.code}${statusDescription}${coworkersDescription}`,
        uidParts:
          uidStyle === "feed"
            ? [roster.employee, shift.date, "shift"]
            : [
                roster.employee,
                shift.date,
                shift.start,
                shift.end,
                shift.code,
                shift.source,
              ],
        categories: ["ROSTER", shift.status, shift.code],
      }),
      color: EVENT_BACKGROUND_COLOR,
    });
  }

  for (const special of roster.specialEvents) {
    events.push({
      attributes: commonEvent({
        date: special.date,
        start: special.start,
        end: special.end,
        title: `🌷 ${special.title}`,
        description: "กิจกรรมจาก REMARK\nสามารถซ้อนกับกะทำงานได้",
        uidParts: [
          roster.employee,
          special.date,
          special.start,
          special.end,
          special.title,
          special.source,
          ...(uidStyle === "feed" ? ["feed"] : []),
        ],
        categories: ["REMARK"],
      }),
      color: EVENT_BACKGROUND_COLOR,
    });
  }

  return events;
}

function renderCalendar(events: ColoredEvent[], calName: string): string {
  const result = createEvents(
    events.map((event) => event.attributes),
    {
      calName,
      productId: PRODUCT_ID,
      method: "PUBLISH",
    },
  );
  if (result.error || !result.value) {
    throw new Error("Unable to generate calendar");
  }

  let colorIndex = 0;
  return result.value
    .replace(/^DTSTART:/gm, "DTSTART;TZID=Asia/Bangkok:")
    .replace(/^DTEND:/gm, "DTEND;TZID=Asia/Bangkok:")
    .replace("BEGIN:VEVENT\r\n", `${BANGKOK_TIMEZONE}\r\nBEGIN:VEVENT\r\n`)
    .replace(/BEGIN:VEVENT\r\n/g, (line) => {
      const color = events[colorIndex]?.color;
      colorIndex += 1;
      return color ? `${line}COLOR:${color}\r\n` : line;
    });
}

export function createRosterIcs(roster: RosterAnalysis): string {
  return renderCalendar(
    rosterEvents(roster, "download"),
    `NANCHAYA Roster ${roster.year}-${String(roster.month).padStart(2, "0")}`,
  );
}

export const FEED_CALENDAR_NAME = "NANCHAYA Roster";

/** One subscribed calendar with every stored month; apps refresh it themselves. */
export function createFeedIcs(rosters: RosterAnalysis[]): string {
  return renderCalendar(
    rosters.flatMap((roster) => rosterEvents(roster, "feed")),
    FEED_CALENDAR_NAME,
  ).replace(
    "X-PUBLISHED-TTL:PT1H\r\n",
    "X-PUBLISHED-TTL:PT1H\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n",
  );
}
