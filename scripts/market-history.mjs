export function parseIndexCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const fields = header.split(",");
  if (!fields.includes("date") || !fields.includes("close")) throw new Error("Index CSV schema is incomplete");
  return lines.map(line => {
    const values = line.split(",");
    return Object.fromEntries(fields.map((field, i) => [field, field === "date" ? values[i] : values[i] === "" ? null : Number(values[i])]));
  });
}

export function mergeIndexTail(previous, tail) {
  if (!previous.length || !tail.length) throw new Error("Historical baseline or incremental index data is empty");
  const lookup = new Map(previous.map(row => [row.date, row]));
  let overlap = 0;
  for (const row of tail) {
    const old = lookup.get(row.date);
    if (old) {
      overlap += 1;
      if (Math.abs(old.close - row.close) > .05) throw new Error(`Index overlap disagrees on ${row.date}`);
    }
    if (![row.open, row.close, row.high, row.low].every(value => Number.isFinite(value) && value > 0)
      || row.high + .005 < Math.max(row.open, row.close) || row.low - .005 > Math.min(row.open, row.close)) {
      throw new Error(`Invalid incremental index OHLC on ${row.date}`);
    }
    lookup.set(row.date, row);
  }
  if (!overlap) throw new Error("Incremental index data has no verifiable overlap");
  if (tail.at(-1).date < previous.at(-1).date) throw new Error("Incremental index data is older than the baseline");
  return [...lookup.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function completedChinaDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (Number(parts.hour) >= 16) return day;
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
