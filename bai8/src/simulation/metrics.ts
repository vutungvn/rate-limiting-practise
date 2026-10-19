/** So request lon nhat trong BAT KY khoang 1 giay nao (cua so truot, khong chi giay tron). */
export function maxInAnyWindow(sortedTimes: number[], windowMs = 1_000): number {
  let max = 0;
  let i = 0;
  for (let j = 0; j < sortedTimes.length; j++) {
    while (sortedTimes[j] - sortedTimes[i] >= windowMs) i++;
    max = Math.max(max, j - i + 1);
  }
  return max;
}

/** So khoang 1 giay (lay moi moc request lam diem dau) vuot nguong - dem so lan "vi pham". */
export function windowsOver(sortedTimes: number[], limit: number, windowMs = 1_000): number {
  let over = 0;
  let j = 0;
  for (let i = 0; i < sortedTimes.length; i++) {
    while (j < sortedTimes.length && sortedTimes[j] - sortedTimes[i] < windowMs) j++;
    if (j - i > limit) over++;
  }
  return over;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
