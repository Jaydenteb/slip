// Event dates are stored as UTC midnight for the calendar day, so format them in UTC.
export function formatDay(d: Date | null | undefined, opts: { year?: boolean } = {}) {
  if (!d) return "";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(opts.year === false ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

export function formatDayRange(start: Date | null, end: Date | null) {
  if (!start) return "Date to be confirmed";
  if (!end || end.getTime() === start.getTime()) return formatDay(start);
  return `${formatDay(start, { year: false })} – ${formatDay(end)}`;
}

// Real moments (payments, approvals) are shown in the school's time zone.
export function formatMoment(d: Date) {
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Melbourne",
  });
}

// Whether something happened in the last `ms` milliseconds (e.g. to highlight a fresh result).
export function isRecent(d: Date | null, ms: number) {
  return d !== null && Date.now() - d.getTime() < ms;
}
