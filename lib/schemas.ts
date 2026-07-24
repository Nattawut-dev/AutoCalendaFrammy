import { z } from "zod";
import { ROSTER_STATUSES } from "@/lib/roster/status";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const localTime = /^([01]\d|2[0-3]):[0-5]\d$/;

export const rosterShiftSchema = z.object({
  date: z.string().regex(isoDate),
  code: z.string().min(1).max(24),
  start: z.string().regex(localTime).nullable(),
  end: z.string().regex(localTime).nullable(),
  isDayOff: z.boolean(),
  source: z.literal("roster"),
  confidence: z.number().min(0).max(1),
  status: z.enum(ROSTER_STATUSES).default("NORMAL"),
  statusConfidence: z.number().min(0).max(1).default(1),
  rawCellText: z.string().nullable(),
});

export const specialEventSchema = z.object({
  date: z.string().regex(isoDate),
  title: z.string().min(1).max(160),
  start: z.string().regex(localTime),
  end: z.string().regex(localTime),
  source: z.literal("remark"),
  confidence: z.number().min(0).max(1),
  rawRemarkText: z.string().min(1).max(1000),
});

export const rosterWarningSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  date: z.string().regex(isoDate).nullable(),
});

export const rosterAnalysisSchema = z.object({
  employee: z.literal("NANCHAYA"),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  timezone: z.literal("Asia/Bangkok"),
  shifts: z.array(rosterShiftSchema).min(1).max(31),
  specialEvents: z.array(specialEventSchema).max(100),
  warnings: z.array(rosterWarningSchema).max(100),
});

export const storedRosterJobSchema = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  status: z.enum(["ready", "needs_review", "confirmed"]),
  roster: rosterAnalysisSchema,
  sourceMessageId: z.string().min(1),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export const lineWebhookSchema = z.object({
  events: z.array(z.record(z.string(), z.unknown())).default([]),
});
