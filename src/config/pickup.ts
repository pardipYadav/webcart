export const PICKUP_OPTIONS = [
  { minutes: 0, label: "As soon as it's ready" },
  { minutes: 10, label: "In 10 minutes" },
  { minutes: 15, label: "In 15 minutes" },
  { minutes: 20, label: "In 20 minutes" },
  { minutes: 30, label: "In 30 minutes" },
] as const;

export type PickupMinutes = (typeof PICKUP_OPTIONS)[number]["minutes"];

export function isPickupMinutes(value: number): value is PickupMinutes {
  return PICKUP_OPTIONS.some((option) => option.minutes === value);
}

export function pickupLabel(minutes: number) {
  return PICKUP_OPTIONS.find((option) => option.minutes === minutes)?.label ?? null;
}
