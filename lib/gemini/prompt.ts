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
  type: "object",
  additionalProperties: false,
  required: [
    "employee",
    "month",
    "year",
    "timezone",
    "shifts",
    "specialEvents",
    "warnings",
  ],
  properties: {
    employee: { type: "string", enum: ["NANCHAYA"] },
    month: { type: "integer", minimum: 1, maximum: 12 },
    year: { type: "integer", minimum: 2020, maximum: 2100 },
    timezone: { type: "string", enum: ["Asia/Bangkok"] },
    shifts: {
      type: "array",
      minItems: 1,
      maxItems: 31,
      items: {
        type: "object",
        additionalProperties: false,
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
          date: { type: "string" },
          code: { type: "string" },
          start: { anyOf: [{ type: "string" }, { type: "null" }] },
          end: { anyOf: [{ type: "string" }, { type: "null" }] },
          isDayOff: { type: "boolean" },
          source: { type: "string", enum: ["roster"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rawCellText: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
    specialEvents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
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
          date: { type: "string" },
          title: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          source: { type: "string", enum: ["remark"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rawRemarkText: { type: "string" },
        },
      },
    },
    warnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message", "date"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          date: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
} as const;
