import { KNOWN_SHIFT_TIMES } from "@/lib/constants";
import type { RosterAnalysis } from "@/lib/types";
import { daysInMonth, weekdayForIsoDate } from "@/lib/utils/date";
import {
  parseDailyDetails,
  parseTextRemarks,
} from "@/lib/roster/parse-text-details";

export const MANUAL_ROSTER_EXAMPLE = `ตาราง 2026-10 OFF=10
L8 H8 H8 OFF H8 H8 H8 H8 OFF H8 H8 H8 OFF OFF H8 H8 H8 H8 OFF OFF H8 L8 OFF H8 L8 OFF OFF H8 H8 H8 OFF`;

type TextRosterResult =
  { ok: true; roster: RosterAnalysis } | { ok: false; error: string };

/** Strict, complete-month input: never infer omitted dates or unknown codes. */
export function parseTextRoster(text: string): TextRosterResult | null {
  const input = text.trim();
  if (!/^(?:ตาราง|กะ|roster)(?:\s|$)/i.test(input)) return null;
  const fail = (error: string): TextRosterResult => ({ ok: false, error });
  if (input.length > 5000)
    return fail("ข้อความยาวเกินไป กรุณาส่งครั้งละหนึ่งเดือน");
  const match =
    /^(?:ตาราง|กะ|roster)\s+(\d{4})-(\d{1,2})\s+OFF\s*=\s*(\d{1,2})(?:\s+([\s\S]*))?$/i.exec(
      input,
    );
  if (!match)
    return fail(
      "เริ่มด้วย ตาราง YYYY-MM OFF=จำนวนวันหยุด แล้วตามด้วยรหัสกะเรียงจากวันที่ 1",
    );
  const enteredYear = Number(match[1]);
  const year = enteredYear >= 2500 ? enteredYear - 543 : enteredYear;
  const month = Number(match[2]);
  if (year < 2020 || year > 2100 || month < 1 || month > 12) {
    return fail(
      "เดือนหรือปีไม่ถูกต้อง ใช้เดือน 1–12 และปี ค.ศ. 2020–2100 หรือ พ.ศ. ที่ตรงกัน",
    );
  }
  const totalDays = daysInMonth(year, month);
  const offCount = Number(match[3]);
  if (offCount > totalDays)
    return fail(`ยอด OFF ต้องอยู่ระหว่าง 0–${totalDays}`);
  const dateForDay = (day: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const lines = (match[4] ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const remarkLines = lines.filter((line) => /^REMARK\b/i.test(line));
  const shiftLines = lines.filter(
    (line) => !/^REMARK\b/i.test(line) && line !== "รายละเอียดทุกวัน",
  );
  let details: ReturnType<typeof parseDailyDetails> | undefined;
  let specialEvents: RosterAnalysis["specialEvents"];
  try {
    specialEvents = parseTextRemarks(remarkLines, dateForDay, totalDays);
    if (shiftLines.some((line) => /^\d/.test(line))) {
      details = parseDailyDetails(shiftLines, month, totalDays);
    }
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "รายละเอียดตารางไม่ถูกต้อง",
    );
  }
  const codes = details
    ? Array.from({ length: totalDays }, (_, i) => details!.get(i + 1)!.code)
    : shiftLines
        .join(" ")
        .trim()
        .toUpperCase()
        .split(/[\s,]+/)
        .filter(Boolean);
  if (codes.length !== totalDays) {
    return fail(
      `เดือนนี้มี ${totalDays} วัน แต่ได้รับ ${codes.length} รหัส กรุณาส่งให้ครบเรียงจากวันที่ 1`,
    );
  }
  const unknown = codes.findIndex(
    (code) => code !== "OFF" && !Object.hasOwn(KNOWN_SHIFT_TIMES, code),
  );
  if (unknown !== -1) {
    return fail(
      `ไม่รู้จักรหัสวันที่ ${unknown + 1}: ${codes[unknown].slice(0, 24)}\nรองรับ ${Object.keys(KNOWN_SHIFT_TIMES).join(", ")} และ OFF`,
    );
  }
  const actualOff = codes.filter((code) => code === "OFF").length;
  if (actualOff !== offCount) {
    return fail(
      `นับ OFF ได้ ${actualOff} วัน แต่ระบุ OFF=${offCount} กรุณาตรวจรหัสและยอดวันหยุด`,
    );
  }
  return {
    ok: true,
    roster: {
      employee: "NANCHAYA",
      inputMethod: "text",
      month,
      year,
      timezone: "Asia/Bangkok",
      printedOffCount: offCount,
      shifts: codes.map((code, index) => {
        const date = dateForDay(index + 1);
        const detail = details?.get(index + 1);
        const time = code === "OFF" ? undefined : KNOWN_SHIFT_TIMES[code];
        return {
          date,
          printedWeekday: weekdayForIsoDate(date),
          code,
          start: time?.start ?? null,
          end: time?.end ?? null,
          isDayOff: code === "OFF",
          source: "roster",
          confidence: 1,
          status: detail?.status ?? "NORMAL",
          statusConfidence: 1,
          rawCellText: code,
          coworkers: detail?.coworkers ?? [],
        };
      }),
      specialEvents,
      warnings: [],
    },
  };
}
