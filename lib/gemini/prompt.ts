import "server-only";

import { Type, type Schema } from "@google/genai";
import { ROSTER_STATUSES } from "@/lib/roster/status";

export const ROSTER_ANALYSIS_PROMPT = `
Analyze this employee roster image by inspecting its visual table structure, not only OCR text.

Mandatory rules:
- Locate the employee row whose name is exactly NANCHAYA.
- Do not extract shifts for MINTRA, SUNISA, JANTARAS, or any other employee.
- Read the roster month and year from the title.
- Match every numbered date column to the corresponding NANCHAYA cell.
- Read shift-code start/end definitions from the DETAILS or legend table in the image.
- Extract the printed shift code and its start/end time exactly as before. Status color is separate metadata and must never change, replace, or override the shift code or its time.
- Inspect the background color of each NANCHAYA roster cell and compare it only with the color legend printed in the same image.
- Map legend meanings to status exactly as follows: SWITCH SHIFT -> SWITCH_SHIFT, CHANGE DAY OFF -> CHANGE_DAY_OFF, DAY OFF REQUEST -> DAY_OFF_REQUEST, OT -> OT, VACATION -> VACATION, BL or BUSINESS LEAVE -> BUSINESS_LEAVE, OT DAYOFF -> OT_DAYOFF, SL or SICK LEAVE -> SICK_LEAVE, SHIFT CHANGE -> SHIFT_CHANGE.
- Use NORMAL when the cell has no colored status, the legend has no matching entry, or the color cannot be distinguished reliably. Never infer a status from the shift code or text color alone.
- statusConfidence measures only the cell-background-to-legend match. If the status color is ambiguous, use NORMAL, lower statusConfidence, and add a warning with code status_color_uncertain. This uncertainty must not reduce the shift-code confidence when the printed code itself is clear.
- Read only REMARK entries that explicitly include NANCHAYA.
- OFF means a day off. Use code OFF, isDayOff true, and null start/end.
- Do not invent blurry, cropped, unreadable, or missing values. Record uncertainty in warnings.
- Preserve each printed shift code after trimming whitespace and normalizing letter case.
- Training, meetings, supervision, and other applicable remarks are separate specialEvents.
- Training may intentionally overlap a work shift. Keep both records and never shorten, remove, merge, or alter the work shift.
- Return exactly one shift record for every calendar date in the displayed month.
- Use YYYY-MM-DD dates and HH:mm 24-hour local times in Asia/Bangkok.
- Assign confidence from 0 to 1 to every shift and special event.
- rawRemarkText must contain the source remark that explicitly names NANCHAYA.
- Return JSON only, matching the supplied schema exactly. Do not return prose or Markdown.
`;

export const ROSTER_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: [
    "employee",
    "month",
    "year",
    "timezone",
    "shifts",
    "specialEvents",
    "warnings",
  ],
  propertyOrdering: [
    "employee",
    "month",
    "year",
    "timezone",
    "shifts",
    "specialEvents",
    "warnings",
  ],
  properties: {
    employee: { type: Type.STRING, format: "enum", enum: ["NANCHAYA"] },
    month: { type: Type.INTEGER },
    year: { type: Type.INTEGER },
    timezone: {
      type: Type.STRING,
      format: "enum",
      enum: ["Asia/Bangkok"],
    },
    shifts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: [
          "date",
          "code",
          "start",
          "end",
          "isDayOff",
          "source",
          "confidence",
          "status",
          "statusConfidence",
          "rawCellText",
        ],
        properties: {
          date: { type: Type.STRING },
          code: { type: Type.STRING },
          start: { type: Type.STRING, nullable: true },
          end: { type: Type.STRING, nullable: true },
          isDayOff: { type: Type.BOOLEAN },
          source: {
            type: Type.STRING,
            format: "enum",
            enum: ["roster"],
          },
          confidence: { type: Type.NUMBER },
          status: {
            type: Type.STRING,
            format: "enum",
            enum: [...ROSTER_STATUSES],
          },
          statusConfidence: { type: Type.NUMBER },
          rawCellText: { type: Type.STRING, nullable: true },
        },
      },
    },
    specialEvents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: [
          "date",
          "title",
          "start",
          "end",
          "source",
          "confidence",
          "rawRemarkText",
        ],
        properties: {
          date: { type: Type.STRING },
          title: { type: Type.STRING },
          start: { type: Type.STRING },
          end: { type: Type.STRING },
          source: {
            type: Type.STRING,
            format: "enum",
            enum: ["remark"],
          },
          confidence: { type: Type.NUMBER },
          rawRemarkText: { type: Type.STRING },
        },
      },
    },
    warnings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["code", "message", "date"],
        properties: {
          code: { type: Type.STRING },
          message: { type: Type.STRING },
          date: { type: Type.STRING, nullable: true },
        },
      },
    },
  },
} satisfies Schema;
