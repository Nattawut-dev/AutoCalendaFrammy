import "server-only";

import { Type, type Schema } from "@google/genai";
import { ROSTER_STATUSES } from "@/lib/roster/status";

const WEEKDAY_ENUM = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * The model only transcribes what is printed. Dates, times, coworkers and OT
 * hours are derived in code (lib/roster/expand-compact.ts), which keeps the
 * answer short enough to finish well within Vercel's time limit.
 */
export const ROSTER_ANALYSIS_PROMPT = `
Transcribe this employee roster image. Copy what is printed; do not calculate anything.

Rules:
- Read the roster month and year from the title.
- weekdays: one string with the weekday abbreviation printed above each numbered date column, day 1 to the last day, separated by single spaces (e.g. "SUN MON TUE ...").
- rows: every employee row in the table (e.g. MINTRA, SUNISA, JANTARAS, NANCHAYA). name is the printed name in uppercase. cells is one string with exactly one uppercase token per date column, left to right, separated by single spaces (e.g. "F9 K9 OFF VAC ..."). A token never contains a space. If one merged cell spans several dates (e.g. "MATERNITY LEAVE"), write LEAVE for each date it covers. Never skip, merge or shift columns.
- printedOffCount: the OFF total printed at the far right of the NANCHAYA row only. null if absent or unreadable.
- legend.shiftTimes: every shift definition printed in the DETAILS/legend box, e.g. "H9 : 08.00-18.00" -> { code: "H9", start: "08:00", end: "18:00" }. Empty array if there is no such box.
- legend.otTime: OT hours printed in the color key (e.g. "OT 09.00-11.00" -> { start: "09:00", end: "11:00" }), otherwise null.
- coloredDays: only the NANCHAYA cells that have a background color, as { day, status }, matched to the printed color key. Leave out white / uncolored cells:
  * Cyan / Turquoise: SWITCH_SHIFT
  * Orange: CHANGE_DAY_OFF
  * Light Yellow / Pale Yellow / Cream: DAY_OFF_REQUEST
  * The color the key labels OT (often pink / magenta): OT
  * Red: VACATION
  * Olive / Mustard or text "BL": BUSINESS_LEAVE
  * The color the key labels OT DAYOFF (often light / slate blue): OT_DAYOFF
  * The color the key labels SL (often peach): SICK_LEAVE
  * Light Green / Lime: SHIFT_CHANGE
  Only the cell background (fill) counts. Text/font color is never a status: OFF is often printed in red text on a white cell, and that cell is uncolored.
  Compare against the printed key first. If a color cannot be told apart reliably, leave the day out and list it in uncertainDays.
- uncertainDays: day numbers whose NANCHAYA code or color is blurry, cropped or ambiguous. Empty array when everything is clear.
- REMARK lines: use those naming NANCHAYA to confirm unusual NANCHAYA cells (e.g. "NANCHAYA : OT ON DAYOFF 30NOV26"). Only a remark that names NANCHAYA and prints a start and end time becomes a specialEvents item (date YYYY-MM-DD, HH:mm times, rawRemarkText = the remark text). Never invent times. A remark without times is normal and is not a conflict. Only when a remark clearly contradicts a NANCHAYA cell or color (e.g. it says OT ON DAYOFF on a date whose cell is OFF), keep the cell and add a warning with code remark_conflict.
- Do not invent blurry, cropped or missing values; record them in warnings.
- Return JSON only, matching the schema.
`;

export const ROSTER_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: [
    "month",
    "year",
    "printedOffCount",
    "legend",
    "weekdays",
    "rows",
    "coloredDays",
    "uncertainDays",
    "specialEvents",
    "warnings",
  ],
  propertyOrdering: [
    "month",
    "year",
    "printedOffCount",
    "legend",
    "weekdays",
    "rows",
    "coloredDays",
    "uncertainDays",
    "specialEvents",
    "warnings",
  ],
  properties: {
    month: { type: Type.INTEGER },
    year: { type: Type.INTEGER },
    printedOffCount: { type: Type.INTEGER, nullable: true },
    legend: {
      type: Type.OBJECT,
      required: ["shiftTimes", "otTime"],
      properties: {
        shiftTimes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["code", "start", "end"],
            properties: {
              code: { type: Type.STRING },
              start: { type: Type.STRING },
              end: { type: Type.STRING },
            },
          },
        },
        otTime: {
          type: Type.OBJECT,
          nullable: true,
          required: ["start", "end"],
          properties: {
            start: { type: Type.STRING },
            end: { type: Type.STRING },
          },
        },
      },
    },
    weekdays: { type: Type.STRING },
    rows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["name", "cells"],
        properties: {
          name: { type: Type.STRING },
          cells: { type: Type.STRING },
        },
      },
    },
    coloredDays: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["day", "status"],
        properties: {
          day: { type: Type.INTEGER },
          status: {
            type: Type.STRING,
            format: "enum",
            enum: ROSTER_STATUSES.filter((s) => s !== "NORMAL"),
          },
        },
      },
    },
    uncertainDays: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    specialEvents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["date", "title", "start", "end", "rawRemarkText"],
        properties: {
          date: { type: Type.STRING },
          title: { type: Type.STRING },
          start: { type: Type.STRING },
          end: { type: Type.STRING },
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

export const ROSTER_AUDIT_PROMPT = `
Independently transcribe one roster row from this image as a verification pass.

Strict rules:
- Inspect only the roster title, numbered date headers, printed weekday headers, the row whose employee name is exactly NANCHAYA, and that row's far-right OFF total.
- Ignore all background colors, DETAILS, FLIGHT, REMARK, and every other employee row.
- Work strictly left to right from day 1 through the final numbered day. Do not skip, merge, shift, or reorder columns.
- For every numbered column return the visible day number, the weekday abbreviation printed directly above it, the exact NANCHAYA cell text, and its normalized uppercase code.
- Normalize only obvious whitespace and letter case. OFF must remain OFF. Do not use the OFF total to guess or alter any individual cell.
- Read printedOffCount only from the far-right OFF total in the NANCHAYA row. Use null if it is absent or unreadable.
- This is an independent audit. Do not infer shift times, statuses, colors, or remarks.
- Return JSON only and exactly match the schema.
`;

export const ROSTER_AUDIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: ["employee", "month", "year", "printedOffCount", "cells"],
  propertyOrdering: ["employee", "month", "year", "printedOffCount", "cells"],
  properties: {
    employee: { type: Type.STRING, format: "enum", enum: ["NANCHAYA"] },
    month: { type: Type.INTEGER },
    year: { type: Type.INTEGER },
    printedOffCount: { type: Type.INTEGER, nullable: true },
    cells: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: [
          "day",
          "printedWeekday",
          "code",
          "rawCellText",
          "confidence",
        ],
        propertyOrdering: [
          "day",
          "printedWeekday",
          "code",
          "rawCellText",
          "confidence",
        ],
        properties: {
          day: { type: Type.INTEGER },
          printedWeekday: {
            type: Type.STRING,
            format: "enum",
            enum: WEEKDAY_ENUM,
          },
          code: { type: Type.STRING },
          rawCellText: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
      },
    },
  },
} satisfies Schema;
