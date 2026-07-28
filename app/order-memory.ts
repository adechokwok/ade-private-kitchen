export const activeGuestOrderStorageKey = "ade-kitchen-active-guest-order-v1";

export function isGuestOrderToken(value: string) {
  return /^[a-f0-9]{32}$/i.test(value);
}
