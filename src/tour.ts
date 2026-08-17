export function identityOrder(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

export function isPermutation(order: readonly number[], length: number): boolean {
  if (order.length !== length) return false;
  const seen = new Uint8Array(length);

  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= length || seen[index]) {
      return false;
    }
    seen[index] = 1;
  }

  return true;
}
