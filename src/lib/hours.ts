import type { CartStatus } from "@/lib/types";
import { clockToMinutes, formatClock, zonedMinutes } from "@/lib/time";

export type HoursInput = {
  openTime: string;
  closeTime: string;
  timeZone: string;
  prepMinutes: number;
  forceOpen: boolean;
  forceClosed: boolean;
};

export function evaluateCart(now: Date, input: HoursInput): CartStatus {
  const openLabel = formatClock(input.openTime);
  const closeLabel = formatClock(input.closeTime);
  const hoursLabel = `Open daily, ${openLabel} – ${closeLabel}`;
  const closedMessage = `The cart is closed right now. You can order between ${openLabel} and ${closeLabel}.`;
  const prepMinutes = input.prepMinutes;

  if (input.forceClosed) {
    return {
      open: false,
      hoursLabel,
      closedMessage: "The cart is closed today. Please come back tomorrow morning.",
      prepMinutes,
    };
  }

  if (input.forceOpen) {
    return { open: true, hoursLabel, closedMessage, prepMinutes };
  }

  const nowMinutes = zonedMinutes(now, input.timeZone);
  const start = clockToMinutes(input.openTime);
  const end = clockToMinutes(input.closeTime);
  const open = start <= end ? nowMinutes >= start && nowMinutes <= end : nowMinutes >= start || nowMinutes <= end;

  return { open, hoursLabel, closedMessage, prepMinutes };
}
