export type RosterStatus =
  | "NORMAL"
  | "SWITCH_SHIFT"
  | "CHANGE_DAY_OFF"
  | "DAY_OFF_REQUEST"
  | "OT"
  | "VACATION"
  | "BUSINESS_LEAVE"
  | "OT_DAYOFF"
  | "SICK_LEAVE"
  | "SHIFT_CHANGE";

export type PrintedWeekday =
  "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export type RosterCoworker = {
  name: string;
  code: string;
};

export type RosterShift = {
  date: string;
  printedWeekday: PrintedWeekday | null;
  code: string;
  start: string | null;
  end: string | null;
  isDayOff: boolean;
  source: "roster";
  confidence: number;
  status: RosterStatus;
  statusConfidence: number;
  rawCellText: string | null;
  coworkers: RosterCoworker[];
};

export type SpecialEvent = {
  date: string;
  title: string;
  start: string;
  end: string;
  source: "remark";
  confidence: number;
  rawRemarkText: string;
};

export type RosterWarning = {
  code: string;
  message: string;
  date: string | null;
};

export type ShiftTime = { start: string; end: string };

/** Definitions printed on the roster (DETAILS/legend), e.g. "H9 : 08.00-18.00", "OT 09.00-11.00". */
export type RosterLegend = {
  shiftTimes: ({ code: string } & ShiftTime)[];
  otTime: ShiftTime | null;
};

export type RosterAnalysis = {
  employee: "NANCHAYA";
  inputMethod?: "image" | "text";
  month: number;
  year: number;
  timezone: "Asia/Bangkok";
  printedOffCount: number | null;
  legend?: RosterLegend;
  shifts: RosterShift[];
  specialEvents: SpecialEvent[];
  warnings: RosterWarning[];
};

export type RosterJobStatus = "ready" | "needs_review" | "confirmed";

export type StoredRosterJob = {
  id: string;
  userId: string;
  status: RosterJobStatus;
  roster: RosterAnalysis;
  sourceMessageId: string;
  createdAt: string;
  expiresAt: string;
};

export type ValidationIssue = {
  code: string;
  message: string;
  date?: string;
};

export type RosterAuditCell = {
  day: number;
  printedWeekday: PrintedWeekday;
  code: string;
  rawCellText: string;
  confidence: number;
};

export type RosterAudit = {
  employee: "NANCHAYA";
  month: number;
  year: number;
  printedOffCount: number | null;
  cells: RosterAuditCell[];
};
