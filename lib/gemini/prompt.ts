import "server-only";

import { Type, type Schema } from "@google/genai";

export const ROSTER_ANALYSIS_PROMPT = `
Analyze this employee roster image by inspecting its visual table structure, not only OCR text.

Mandatory rules:
- Locate the employee row whose name is exactly NANCHAYA.
- Do not extract shifts for MINTRA, SUNISA, JANTARAS, or any other employee.
- Read the roster month and year from the title.
- Match every numbered date column to the corresponding NANCHAYA cell.
- Read shift-code start/end definitions from the DETAILS or legend table in the image.
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
