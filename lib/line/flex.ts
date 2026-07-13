import type { LineMessage } from "@/lib/line/client";
import { textMessage } from "@/lib/line/messages";
import { summarizeRoster } from "@/lib/roster/summarize";
import type { StoredRosterJob } from "@/lib/types";
import { formatThaiMonth } from "@/lib/utils/date";

export function createPreviewFlexMessage(job: StoredRosterJob): LineMessage {
  const summary = summarizeRoster(job.roster);
  const month = formatThaiMonth(job.roster.month);
  return {
    type: "flex",
    altText: `ตรวจสอบตารางเวร NANCHAYA ${month} ${job.roster.year}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#12372A",
        contents: [
          {
            type: "text",
            text: "ตรวจสอบตารางเวร",
            color: "#FFFFFF",
            weight: "bold",
            size: "xl",
          },
          {
            type: "text",
            text: `NANCHAYA · ${month} ${job.roster.year}`,
            color: "#D8EFD3",
            size: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: `วันทำงาน ${summary.workDays} · OFF ${summary.offDays} · กิจกรรม ${summary.specialEvents}`,
            wrap: true,
            weight: "bold",
          },
          {
            type: "text",
            text: "กิจกรรมอบรมสามารถซ้อนกับกะทำงานได้ โดยระบบจะเก็บทั้งสองรายการ",
            wrap: true,
            size: "sm",
            color: "#666666",
          },
          {
            type: "text",
            text: "ลิงก์งานมีอายุ 30 นาที",
            size: "sm",
            color: "#B26A00",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#12372A",
            action: {
              type: "postback",
              label: "ยืนยันสร้าง Calendar",
              data: `action=confirm&job=${job.id}`,
            },
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: "ยกเลิก",
              data: `action=cancel&job=${job.id}`,
            },
          },
        ],
      },
    },
  };
}

function splitDetails(lines: string[], heading: string): LineMessage[] {
  const chunks: string[] = [];
  let current = heading;
  for (const line of lines) {
    if (`${current}\n${line}`.length > 4600) {
      chunks.push(current);
      current = `${heading} (ต่อ)\n${line}`;
    } else {
      current += `\n${line}`;
    }
  }
  if (current !== heading) chunks.push(current);
  return chunks.map(textMessage);
}

export function createPreviewMessages(job: StoredRosterJob): LineMessage[] {
  const month = formatThaiMonth(job.roster.month);
  const shiftLines = job.roster.shifts.map((shift) => {
    const day = Number(shift.date.slice(-2));
    return shift.isDayOff
      ? `${day} ${month} — OFF`
      : `${day} ${month} — ${shift.code} — ${shift.start}–${shift.end}`;
  });
  const specialLines = job.roster.specialEvents.map((event) => {
    const day = Number(event.date.slice(-2));
    return `${day} ${month} — ${event.title} — ${event.start}–${event.end}`;
  });
  const warningLines = job.roster.warnings.map(
    (warning) => `${warning.date ?? "ทั่วไป"} — ${warning.message}`,
  );
  const detailMessages = splitDetails(shiftLines, "รายละเอียดทุกวัน");
  if (specialLines.length)
    detailMessages.push(...splitDetails(specialLines, "กิจกรรมจาก REMARK"));
  if (warningLines.length)
    detailMessages.push(...splitDetails(warningLines, "คำเตือน"));
  return [createPreviewFlexMessage(job), ...detailMessages].slice(0, 5);
}
