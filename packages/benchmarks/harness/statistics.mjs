/** Record every latency in bounded, 0.1ms buckets rather than sampling requests. */
export function createLatencyRecorder() {
  const bins = new Map();
  let count = 0;
  let total = 0;
  return {
    record(milliseconds) {
      const bin = Math.ceil(milliseconds * 10);
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
      count += 1;
      total += milliseconds;
    },
    snapshot() {
      const histogram = [...bins].sort(([a], [b]) => a - b);
      const quantile = (fraction) => {
        let cumulative = 0;
        for (const [bin, frequency] of histogram) {
          cumulative += frequency;
          if (cumulative >= Math.ceil(count * fraction)) return bin / 10;
        }
        return null;
      };
      return {
        count,
        meanMs: count ? total / count : null,
        p50Ms: quantile(0.5),
        p95Ms: quantile(0.95),
        p99Ms: quantile(0.99),
        histogramTenthsMs: histogram,
      };
    },
  };
}

/** Seeded Fisher-Yates keeps each complete round balanced and reproducible. */
export function shuffleTrials({ trials, seed }) {
  const result = [...trials];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
