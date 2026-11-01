import {
  expectedShiftTime,
  isAllowedShiftTime,
  parseLegendLine,
  resolveShiftTime,
} from "@/lib/roster/legend";
import { ROSTER_STATUSES, STATUS_PRESENTATION } from "@/lib/roster/status";
import type {
  RosterCoworker,
  RosterLegend,
  RosterStatus,
  SpecialEvent,
} from "@/lib/types";
import { formatThaiMonth, isValidTime } from "@/lib/utils/date";

type DayDetail = {
  code: string;
  start: string | null;
  end: string | null;
  coworkers: RosterCoworker[];
  status: RosterStatus;
};

const stripEmoji = (value: string) =>
  value.replace(/^[\s\p{Extended_Pictographic}\uFE0F\u200D]+/u, "").trim();

/** Definition lines from the roster legend; they override built-in times. */
export function parseTextLegend(lines: string[]): RosterLegend | undefined {
  const legend: RosterLegend = { shiftTimes: [], otTime: null };
  const seen = new Set<string>();
  for (const line of lines) {
    const entry = parseLegendLine(line);
    if (!entry) continue;
    if (
      !isValidTime(entry.start) ||
      !isValidTime(entry.end) ||
      entry.start === entry.end
    )
      throw new Error(`เวลาในคำอธิบายกะ ${entry.code} ไม่ถูกต้อง`);
    if (seen.has(entry.code)) throw new Error(`คำอธิบายกะ ${entry.code} ซ้ำ`);
    seen.add(entry.code);
    if (entry.code === "OT")
      legend.otTime = { start: entry.start, end: entry.end };
    else legend.shiftTimes.push(entry);
  }
  return seen.size ? legend : undefined;
}

export const isLegendLine = (line: string) => parseLegendLine(line) !== null;

/** Parse explicit dates, never infer missing dates from line positions. */
export function parseDailyDetails(
  lines: string[],
  month: number,
  totalDays: number,
  legend?: RosterLegend,
): Map<number, DayDetail> {
  const days = new Map<number, DayDetail>();
  for (const line of lines) {
    const match = /^(\d{1,2})(?:\s+([^\s—]+))?\s*—\s*(.+)$/.exec(line);
    if (!match) throw new Error(`รูปแบบรายวันไม่ถูกต้อง: ${line.slice(0, 80)}`);
    const day = Number(match[1]);
    if (day < 1 || day > totalDays || days.has(day))
      throw new Error(`วันที่ ${day} ซ้ำหรืออยู่นอกเดือน`);
    if (match[2] && match[2] !== formatThaiMonth(month))
      throw new Error(`ชื่อเดือนวันที่ ${day} ไม่ตรงกับหัวตาราง`);
    let body = match[3];
    const coworkers: RosterCoworker[] = [];
    const coworkerMatch = /\s*\(เข้ากับ:\s*(.+)\)\s*$/.exec(body);
    if (coworkerMatch) {
      body = body.slice(0, coworkerMatch.index).trim();
      for (const entry of coworkerMatch[1].split(",")) {
        const person =
          /^\s*([\p{L}\p{M} .'-]{1,50})\s*\[([A-Za-z0-9]+)\]\s*$/u.exec(entry);
        if (!person)
          throw new Error(`รูปแบบเพื่อนร่วมงานวันที่ ${day} ไม่ถูกต้อง`);
        const name = person[1].trim().toUpperCase();
        const code = person[2].toUpperCase();
        if (
          !name ||
          name === "NANCHAYA" ||
          coworkers.some((p) => p.name === name) ||
          !resolveShiftTime(code, legend)
        )
          throw new Error(
            `ชื่อหรือรหัสเพื่อนร่วมงานวันที่ ${day} ไม่ถูกต้องหรือซ้ำ`,
          );
        coworkers.push({ name, code });
      }
    }
    const parts = body.split(/\s*—\s*/);
    const [codeText, statusText, ...extra] = parts[0].split(/\s*·\s*/);
    const code = stripEmoji(codeText).toUpperCase();
    let status: RosterStatus = "NORMAL";
    if (statusText !== undefined) {
      const label = stripEmoji(statusText).toUpperCase();
      const found = ROSTER_STATUSES.find(
        (s) => STATUS_PRESENTATION[s].label.toUpperCase() === label,
      );
      if (!found) throw new Error(`ไม่รู้จักสถานะวันที่ ${day}`);
      status = found;
    }
    if (extra.length || parts.length > 2)
      throw new Error(`รายละเอียดวันที่ ${day} ไม่ถูกต้อง`);
    if (code === "OFF") {
      if (parts.length !== 1 || coworkers.length || status !== "NORMAL")
        throw new Error(`วันหยุดวันที่ ${day} ให้ระบุเพียง OFF`);
      days.set(day, { code, start: null, end: null, coworkers, status });
      continue;
    }
    const times = /^(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})$/.exec(parts[1] ?? "");
    if (!resolveShiftTime(code, legend))
      throw new Error(
        `ไม่รู้จักกะ ${code} วันที่ ${day} ถ้าเป็นกะใหม่ให้เพิ่มบรรทัดตามตาราง เช่น ${code} 08:00-18:00`,
      );
    if (!times || !isValidTime(times[1]) || !isValidTime(times[2]))
      throw new Error(`รหัสหรือเวลากะวันที่ ${day} ไม่ถูกต้อง`);
    const expected = expectedShiftTime(code, status, legend)!;
    if (!isAllowedShiftTime(code, status, times[1], times[2], legend))
      throw new Error(
        status === "OT" || status === "OT_DAYOFF"
          ? `เวลากะ ${code} + OT วันที่ ${day} ไม่ตรงกับตาราง (${expected.start}–${expected.end})`
          : `เวลากะ ${code} วันที่ ${day} ไม่ตรงกับตาราง ${expected.start}–${expected.end} (ถ้าเป็น OT ให้ใส่ · OT)`,
      );
    days.set(day, { code, start: times[1], end: times[2], coworkers, status });
  }
  if (days.size !== totalDays)
    throw new Error(
      `ต้องระบุวันที่ครบ ${totalDays} วัน ได้รับ ${days.size} วัน`,
    );
  return days;
}

/** Remarks are separate events, including when they overlap a shift or fall on OFF. */
export function parseTextRemarks(
  lines: string[],
  dateForDay: (day: number) => string,
  totalDays: number,
): SpecialEvent[] {
  const events: SpecialEvent[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const match =
      /^REMARK\s+(\d{1,2})(?:-(\d{1,2}))?\s+(\d{2}:\d{2})[–-](\d{2}:\d{2})\s+(.+)$/i.exec(
        line,
      );
    if (!match)
      throw new Error(
        "REMARK ต้องระบุวัน เวลา และหัวข้อ เช่น REMARK 6-7 09:00-13:00 TRAINING",
      );
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    const [, , , start, end, rawTitle] = match;
    const title = rawTitle.trim();
    if (
      first < 1 ||
      last > totalDays ||
      first > last ||
      !isValidTime(start) ||
      !isValidTime(end) ||
      start >= end ||
      !title ||
      title.length > 160
    )
      throw new Error(
        "วัน เวลา หรือหัวข้อ REMARK ไม่ถูกต้อง (เวลาสิ้นสุดต้องหลังเวลาเริ่มในวันเดียวกัน)",
      );
    for (let day = first; day <= last; day++) {
      const date = dateForDay(day);
      const key = JSON.stringify([date, start, end, title.toUpperCase()]);
      if (seen.has(key)) throw new Error(`REMARK วันที่ ${day} ซ้ำ`);
      seen.add(key);
      events.push({
        date,
        title,
        start,
        end,
        source: "remark",
        confidence: 1,
        rawRemarkText: `NANCHAYA: ${line}`,
      });
    }
  }
  if (events.length > 31)
    throw new Error("รองรับ REMARK ไม่เกิน 31 กิจกรรมต่อเดือน");
  return events;
}
