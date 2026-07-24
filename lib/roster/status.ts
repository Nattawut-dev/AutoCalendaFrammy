import type { RosterStatus } from "@/lib/types";

export const ROSTER_STATUSES = [
  "NORMAL",
  "SWITCH_SHIFT",
  "CHANGE_DAY_OFF",
  "DAY_OFF_REQUEST",
  "OT",
  "VACATION",
  "BUSINESS_LEAVE",
  "OT_DAYOFF",
  "SICK_LEAVE",
  "SHIFT_CHANGE",
] as const satisfies readonly RosterStatus[];

type StatusPresentation = {
  label: string;
  emoji: string;
  icsColor: string;
};

export const STATUS_PRESENTATION: Readonly<
  Record<RosterStatus, StatusPresentation>
> = {
  NORMAL: { label: "ปกติ", emoji: "🤍", icsColor: "gray" },
  SWITCH_SHIFT: {
    label: "SWITCH SHIFT",
    emoji: "🦋",
    icsColor: "turquoise",
  },
  CHANGE_DAY_OFF: {
    label: "CHANGE DAY OFF",
    emoji: "🍊",
    icsColor: "darkorange",
  },
  DAY_OFF_REQUEST: {
    label: "DAY OFF REQUEST",
    emoji: "🌼",
    icsColor: "lightyellow",
  },
  OT: { label: "OT", emoji: "💜", icsColor: "magenta" },
  VACATION: { label: "VACATION", emoji: "🌹", icsColor: "red" },
  BUSINESS_LEAVE: {
    label: "BUSINESS LEAVE",
    emoji: "🌻",
    icsColor: "gold",
  },
  OT_DAYOFF: {
    label: "OT DAYOFF",
    emoji: "💙",
    icsColor: "royalblue",
  },
  SICK_LEAVE: {
    label: "SICK LEAVE",
    emoji: "🌸",
    icsColor: "pink",
  },
  SHIFT_CHANGE: {
    label: "SHIFT CHANGE",
    emoji: "🍀",
    icsColor: "limegreen",
  },
};

const SHIFT_PRESENTATION: Readonly<
  Record<string, Pick<StatusPresentation, "emoji" | "icsColor">>
> = {
  F9: { emoji: "🩵", icsColor: "dodgerblue" },
  K9: { emoji: "🧡", icsColor: "orange" },
  HH9: { emoji: "💜", icsColor: "mediumpurple" },
  JJ9: { emoji: "💛", icsColor: "gold" },
  M7: { emoji: "💚", icsColor: "seagreen" },
  L8: { emoji: "🤎", icsColor: "sienna" },
  I8: { emoji: "💙", icsColor: "deepskyblue" },
};

export function shiftPresentation(
  code: string,
): Pick<StatusPresentation, "emoji" | "icsColor"> {
  return (
    SHIFT_PRESENTATION[code] ?? {
      emoji: "🤍",
      icsColor: "gray",
    }
  );
}

export function rosterPresentation(
  status: RosterStatus,
  shiftCode: string,
): StatusPresentation {
  if (status !== "NORMAL") return STATUS_PRESENTATION[status];
  return {
    label: "ปกติ",
    ...shiftPresentation(shiftCode),
  };
}
