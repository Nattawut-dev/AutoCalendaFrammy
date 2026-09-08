import "server-only";

import { Type, type Schema } from "@google/genai";
import { ROSTER_STATUSES } from "@/lib/roster/status";

const WEEKDAY_ENUM = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const ROSTER_ANALYSIS_PROMPT = `
Analyze this employee roster image by inspecting its visual table structure, not only OCR text.

Mandatory rules:
- Locate the employee row whose name is exactly NANCHAYA.
- Read the roster month and year from the title.
- First pass — shift text only: ignore all cell background colors. Match every numbered date column and its printed weekday header to the corresponding NANCHAYA cell, then read the printed code in each cell from left to right.
- Shift time definitions:
  - If a DETAILS or legend table is visible in the image, read the shift-code start/end definitions from it.
  - If no DETAILS or legend table is present in the image (e.g. cropped roster grid), use these standard shift definitions:
    * F9: 06:00 - 16:00
    * HH9: 08:30 - 18:30
    * JJ9: 10:30 - 20:30
    * K9: 11:00 - 21:00
    * M7: 13:00 - 21:00
    * L8: 12:00 - 21:00
    * I8: 09:00 - 18:00
- Read the printed OFF total at the far right of the NANCHAYA row into printedOffCount. Never use another employee's OFF total. Use null only if this total is absent or genuinely unreadable.
- Count the extracted OFF cells and compare that count with printedOffCount. If they differ, re-check date alignment and every NANCHAYA cell before returning. Never change a clear cell merely to force the count to match. If the mismatch cannot be resolved from the image, preserve the visually supported codes, lower confidence only on ambiguous cells, and add a warning with code off_count_mismatch.
- Extract the printed shift code and its start/end time. Status color is separate metadata and must never change, replace, or override the shift code, OFF value, or its time.
- Second pass — status color: inspect the background color and text markers of each already-read NANCHAYA cell. Even if no legend is printed in the image, map cell colors and markers according to these standard definitions:
  * Cyan / Turquoise: SWITCH_SHIFT (SWITCH SHIFT)
  * Orange: CHANGE_DAY_OFF (CHANGE DAY OFF)
  * Light Yellow / Pale Yellow / Cream: DAY_OFF_REQUEST (DAY OFF REQUEST)
  * Magenta / Fuchsia: OT (OT)
  * Red: VACATION (VACATION)
  * Olive / Mustard / Yellow-green or text contains "BL": BUSINESS_LEAVE (BUSINESS LEAVE)
  * Slate Blue / Medium Blue or text contains "OT DAYOFF": OT_DAYOFF (OT DAYOFF)
  * Light Pink / Peach or text contains "SL": SICK_LEAVE (SICK LEAVE)
  * Light Green / Lime: SHIFT_CHANGE (SHIFT CHANGE)
  * Plain white / uncolored: NORMAL
- If a color legend is visible in the image, compare against both the visible legend and the standard definitions above.
- Use NORMAL when the cell has no colored status or the color cannot be distinguished reliably. Never infer a status from the shift code alone.
- statusConfidence measures only the cell-background-to-legend match. If the status color is ambiguous, use NORMAL, lower statusConfidence, and add a warning with code status_color_uncertain. This uncertainty must not reduce the shift-code confidence when the printed code itself is clear.
- Coworkers on duty:
  - For each date column where NANCHAYA is working (not OFF): inspect all other employee rows in the table (e.g. MINTRA, SUNISA, JANTARAS). Extract every colleague who is also working on that same date (exclude colleagues whose code is OFF, leave, or absent) into the coworkers array ({ name: "EMPLOYEE_NAME", code: "SHIFT_CODE" }). Normalize employee names to clean uppercase.
  - If NANCHAYA is OFF on that date or no other colleagues are working, return an empty array [] for coworkers.
- Read only REMARK entries that explicitly include NANCHAYA.
- OFF means a day off. Use code OFF, isDayOff true, and null start/end.
- Do not invent blurry, cropped, unreadable, or missing values. Record uncertainty in warnings.
- Preserve each printed shift code after trimming whitespace and normalizing letter case.
- Training, meetings, supervision, and other applicable remarks are separate specialEvents.
- Training may intentionally overlap a work shift. Keep both records and never shorten, remove, merge, or alter the work shift.
- Return exactly one shift record for every calendar date in the displayed month.
- printedWeekday is the weekday abbreviation visibly printed above that exact date column. Do not calculate or invent it.
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
    "printedOffCount",
    "shifts",
    "specialEvents",
    "warnings",
  ],
  propertyOrdering: [
    "employee",
    "month",
    "year",
    "timezone",
    "printedOffCount",
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
    printedOffCount: { type: Type.INTEGER, nullable: true },
    shifts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: [
          "date",
          "printedWeekday",
          "code",
          "start",
          "end",
          "isDayOff",
          "source",
          "confidence",
          "status",
          "statusConfidence",
          "rawCellText",
          "coworkers",
        ],
        properties: {
          date: { type: Type.STRING },
          printedWeekday: {
            type: Type.STRING,
            format: "enum",
            enum: WEEKDAY_ENUM,
          },
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
          coworkers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["name", "code"],
              properties: {
                name: { type: Type.STRING },
                code: { type: Type.STRING },
              },
            },
          },
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
