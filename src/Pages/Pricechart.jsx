import './Pricechart.css'
import { useEffect, useId, useMemo, useRef, useState } from "react";

const RANGES = [
  { id: "24H", title: "the last 24 hours", unit: "hour" },
  { id: "1W", title: "the last week", unit: "day" },
  { id: "1M", title: "the last month", unit: "day" },
  { id: "3M", title: "the last 3 months", unit: "day" },
  { id: "1Y", title: "the last year", unit: "week" },
];

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DAYS = 366;

/* ---------- helpers ---------- */
function seededRandom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inr = (v) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedInr = (v) => (v > 0 ? "+" : v < 0 ? "-" : "") + inr(Math.abs(v));
const pct = (v, d = 2) => {
  const r = Number(v.toFixed(d));
  return (r > 0 ? "+" : r < 0 ? "-" : "") + Math.abs(r).toFixed(d) + "%";
};
const compact = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// One year of daily candles ending with the card's 7-day trend
function buildDaily(city, commodity, priceFor) {
  const p = priceFor(city, commodity);
  const r = seededRandom(`${city.name}|${commodity.key}|history`);

  const closes = [...p.trend];
  while (closes.length < DAYS) closes.unshift(closes[0] * (1 + (r() - 0.515) * 0.035));

  const today = startOfToday();
  return closes.map((c, i) => {
    const prev = i ? closes[i - 1] : c;
    const o = prev * (1 + (r() - 0.5) * 0.01);
    const h = Math.max(o, c) * (1 + r() * 0.012);
    const l = Math.min(o, c) * (1 - r() * 0.012);
    const v = i === DAYS - 1 ? p.arrivals : Math.round(p.arrivals * (0.5 + r()));
    return { t: today - (DAYS - 1 - i) * DAY, o, h, l, c, v };
  });
}

function candlesFor(daily, rangeId, seedText) {
  if (rangeId === "1W") return daily.slice(-7);
  if (rangeId === "1M") return daily.slice(-30);
  if (rangeId === "3M") return daily.slice(-90);

  if (rangeId === "1Y") {
    const days = daily.slice(-364);
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const w = days.slice(i, i + 7);
      weeks.push({
        t: w[0].t,
        o: w[0].o,
        h: Math.max(...w.map((x) => x.h)),
        l: Math.min(...w.map((x) => x.l)),
        c: w[w.length - 1].c,
        v: w.reduce((s, x) => s + x.v, 0),
      });
    }
    return weeks;
  }

  // 24H: hourly candles from today's open to today's close
  const today = daily[daily.length - 1];
  const r = seededRandom(seedText + "|hours");
  const steps = 24;
  const walk = [0];
  for (let i = 1; i <= steps; i++) walk.push(walk[i - 1] + (r() - 0.5) * today.c * 0.006);
  const pts = walk.map((n, k) => today.o + ((today.c - today.o) * k) / steps + n - (k / steps) * walk[steps]);
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return Array.from({ length: steps }, (_, k) => {
    const o = pts[k];
    const c = pts[k + 1];
    return {
      t: now.getTime() - (steps - 1 - k) * HOUR,
      o,
      c,
      h: Math.max(o, c) * (1 + r() * 0.003),
      l: Math.min(o, c) * (1 - r() * 0.003),
      v: Math.round((today.v / steps) * (0.4 + r() * 1.2)),
    };
  });
}

/* ---------- component ---------- */
export default function PriceChart({ city, commodities, priceFor }) {
  const [key, setKey] = useState(commodities[0].key);
  const [type, setType] = useState("candles");
  const [rangeId, setRangeId] = useState("3M");
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const commodity = commodities.find((c) => c.key === key) || commodities[0];
  const range = RANGES.find((r) => r.id === rangeId);
  const unit = range.unit;

  const daily = useMemo(() => buildDaily(city, commodity, priceFor), [city, commodity, priceFor]);
  const candles = useMemo(() => candlesFor(daily, rangeId, `${city.name}|${commodity.key}`), [daily, rangeId, city.name, commodity.key]);

  useEffect(() => setHover(null), [city.name, key, rangeId]);

  /* size */
  const boxRef = useRef(null);
  const svgRef = useRef(null);
  const [W, setW] = useState(995);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 600 ? 320 : 400;
  const gradId = "pc-wash-" + useId().replace(/:/g, "");

  /* stats */
  const n = candles.length;
  const first = candles[0];
  const last = candles[n - 1];
  const periodChange = last.c - first.o;
  const periodPct = (periodChange / first.o) * 100;
  const dir = periodChange >= 0 ? "up" : "down";
  let hiIdx = 0;
  let loIdx = 0;
  candles.forEach((k, i) => {
    if (k.h > candles[hiIdx].h) hiIdx = i;
    if (k.l < candles[loIdx].l) loIdx = i;
  });
  const greens = candles.filter((k) => k.c >= k.o).length;

  /* scales */
  const left = 10;
  const right = W - 70;
  const top = 14;
  const priceBottom = Math.round(H * 0.75);
  const volBottom = H - 26;
  const volMaxH = (volBottom - priceBottom - 12) * 0.85;
  const rawLo = candles[loIdx].l;
  const rawHi = candles[hiIdx].h;
  const pad = (rawHi - rawLo) * 0.08 || rawHi * 0.02;
  const lo = rawLo - pad;
  const hi = rawHi + pad;
  const y = (v) => top + ((hi - v) / (hi - lo)) * (priceBottom - top);
  const slot = (right - left) / n;
  const xc = (i) => left + slot * (i + 0.5);
  const bodyW = Math.max(1, slot * 0.62);
  const maxVol = Math.max(...candles.map((k) => k.v));
  const ltpY = y(last.c);

  const ticks = Array.from({ length: 7 }, (_, i) => {
    const yy = priceBottom - (i * (priceBottom - top)) / 6;
    return { y: yy, v: hi - ((yy - top) / (priceBottom - top)) * (hi - lo) };
  });
  const labelCount = Math.min(6, n);
  const dateTicks = Array.from({ length: labelCount }, (_, i) => Math.round((i * (n - 1)) / Math.max(1, labelCount - 1)));

  const linePath = candles.map((k, i) => `${i ? "L" : "M"}${xc(i).toFixed(1)} ${y(k.c).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${xc(n - 1).toFixed(1)} ${priceBottom} L${xc(0).toFixed(1)} ${priceBottom} Z`;

  /* dates */
  const fmtTick = (t) =>
    unit === "hour"
      ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
      : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const fmtLong = (t) => {
    const d = new Date(t);
    if (unit === "hour") return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${fmtTick(t)}`;
    if (unit === "week") return `Week of ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  };

  /* hover + keyboard */
  const onPointerMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * W) / rect.width;
    setHover(Math.min(n - 1, Math.max(0, Math.floor((x - left) / slot))));
  };
  const onKeyDown = (e) => {
    const cur = hover ?? n - 1;
    if (e.key === "ArrowLeft") setHover(Math.max(0, cur - 1));
    else if (e.key === "ArrowRight") setHover(Math.min(n - 1, cur + 1));
    else if (e.key === "Home") setHover(0);
    else if (e.key === "End") setHover(n - 1);
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const si = hover ?? n - 1;
  const shown = candles[si];
  const shownPct = si > 0 ? ((shown.c - candles[si - 1].c) / candles[si - 1].c) * 100 : ((shown.c - shown.o) / shown.o) * 100;
  const clampX = (x) => Math.min(right - 34, Math.max(left + 34, x));
  const summary = `${commodity.name} in ${city.name} is ${periodPct >= 0 ? "up" : "down"} ${Math.abs(periodPct).toFixed(1)}% over ${range.title}.`;

  return (
    <section className="pc">
      <div className="pc-quote">
        <div className="pc-title">
          <img alt="" src={commodity.image} />
          <div>
            <h2>
              {commodity.name} <span>· {city.name}</span>
            </h2>
            <small>
              {city.mandi} · per {commodity.pack}
            </small>
          </div>
        </div>
        <div className="pc-ltp">
          <strong>
            <span className="m"><span className="m-main">{inr(last.c)}</span></span>
          </strong>
          <span className={`chip ${dir}`}>
            {dir === "up" ? "▲" : "▼"} {signedInr(periodChange)} ({pct(periodPct)}) · {rangeId}
          </span>
        </div>
      </div>

      <div className="pc-filters">
        <div className="seg" role="group" aria-label="Product">
          {commodities.map((c) => (
            <button key={c.key} type="button" className={c.key === key ? "on" : ""} aria-pressed={c.key === key} onClick={() => setKey(c.key)}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="pc-filters-right">
          <div className="seg" role="group" aria-label="Chart type">
            <button type="button" title="Candlestick chart" className={type === "candles" ? "on" : ""} aria-pressed={type === "candles"} onClick={() => setType("candles")}>
              <svg viewBox="0 0 16 16" aria-hidden="true" className="ico">
                <path d="M4 2v12M12 3v10" />
                <rect x="2.5" y="5" width="3" height="5" rx="0.6" />
                <rect x="10.5" y="6" width="3" height="4" rx="0.6" />
              </svg>{" "}
              Candles
            </button>
            <button type="button" title="Line chart" className={type === "line" ? "on" : ""} aria-pressed={type === "line"} onClick={() => setType("line")}>
              <svg viewBox="0 0 16 16" aria-hidden="true" className="ico">
                <path d="M1.5 12l4-5 3 3 6-7" fill="none" />
              </svg>{" "}
              Line
            </button>
          </div>
          <div className="seg" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.id} type="button" title={r.title} className={r.id === rangeId ? "on" : ""} aria-pressed={r.id === rangeId} onClick={() => setRangeId(r.id)}>
                {r.id}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pc-ohlc" aria-live="polite">
        <span className="d">{fmtLong(shown.t)}</span>
        <span>O <b>{inr(shown.o)}</b></span>
        <span>H <b>{inr(shown.h)}</b></span>
        <span>L <b>{inr(shown.l)}</b></span>
        <span>C <b>{inr(shown.c)}</b></span>
        <span>
          <i className={`arrow ${shownPct >= 0 ? "up" : "down"}`}>{shownPct >= 0 ? "▲" : "▼"}</i>
          <b>{pct(shownPct)}</b>
        </span>
        <span>Vol <b>{compact(shown.v)}</b> bags</span>
      </div>

      <div className="pc-chart" ref={boxRef}>
        <svg
          ref={svgRef}
          role="img"
          tabIndex={0}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          aria-label={`${summary} Use the left and right arrow keys to read each ${unit}.`}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopOpacity="0.22" stopColor={dir === "up" ? "#089981" : "#F23645"} />
              <stop offset="1" stopOpacity="0" stopColor={dir === "up" ? "#089981" : "#F23645"} />
            </linearGradient>
          </defs>

          {ticks.map((t, i) => (
            <g key={i}>
              <line className="grid" x1={left} x2={right} y1={t.y} y2={t.y} />
              {Math.abs(t.y - ltpY) > 14 && (
                <text className="tick" dominantBaseline="middle" x={right + 8} y={t.y}>
                  {inr(t.v)}
                </text>
              )}
            </g>
          ))}
          <line className="axis" x1={right} x2={right} y1={top - 6} y2={volBottom} />
          <line className="grid" x1={left} x2={right} y1={volBottom} y2={volBottom} />
          <text className="tick vol-label" x={left + 2} y={priceBottom + 20}>Volume</text>

          {dateTicks.map((i, k) => (
            <text key={k} className="tick" x={xc(i)} y={H - 8} textAnchor={k === 0 ? "start" : k === dateTicks.length - 1 ? "end" : "middle"}>
              {fmtTick(candles[i].t)}
            </text>
          ))}

          {candles.map((k, i) => {
            const h = (k.v / maxVol) * volMaxH;
            return <rect key={`v${i}`} className={`vol ${k.c >= k.o ? "up" : "down"}`} x={xc(i) - bodyW / 2} y={volBottom - h} width={bodyW} height={h} />;
          })}

          {type === "candles" ? (
            candles.map((k, i) => (
              <g key={`c${i}`} className={`candle ${k.c >= k.o ? "up" : "down"}`}>
                <line className="wick" x1={xc(i)} x2={xc(i)} y1={y(k.h)} y2={y(k.l)} />
                <rect rx="1" className="body" x={xc(i) - bodyW / 2} y={y(Math.max(k.o, k.c))} width={bodyW} height={Math.max(1.5, Math.abs(y(k.o) - y(k.c)))} />
              </g>
            ))
          ) : (
            <g className={`line-series ${dir}`}>
              <path d={areaPath} fill={`url(#${gradId})`} />
              <path className="line" d={linePath} fill="none" />
            </g>
          )}

          <text textAnchor="middle" className="mark-label" x={clampX(xc(hiIdx))} y={y(candles[hiIdx].h) - 8}>
            H {inr(candles[hiIdx].h)}
          </text>
          <text textAnchor="middle" className="mark-label" x={clampX(xc(loIdx))} y={y(candles[loIdx].l) + 14}>
            L {inr(candles[loIdx].l)}
          </text>

          <line className={`ltp-line ${dir}`} x1={left} x2={right} y1={ltpY} y2={ltpY} />
          <g className={`tag ${dir}`}>
            <rect rx="4" x={right + 2} y={ltpY - 10} width="66" height="20" />
            <text textAnchor="middle" dominantBaseline="middle" x={right + 35} y={ltpY}>
              {inr(last.c)}
            </text>
          </g>

          {hover !== null && (
            <g className="cross">
              <line x1={xc(hover)} x2={xc(hover)} y1={top} y2={volBottom} />
              {type === "line" && <circle cx={xc(hover)} cy={y(candles[hover].c)} r="4" />}
            </g>
          )}
        </svg>
      </div>

      <p className="pc-summary">
        <i aria-hidden="true" className={`arrow ${dir}`}>{dir === "up" ? "▲" : "▼"}</i> {summary} Highest{" "}
        <strong>{inr(candles[hiIdx].h)}</strong> on {fmtLong(candles[hiIdx].t)}, lowest <strong>{inr(candles[loIdx].l)}</strong> on{" "}
        {fmtLong(candles[loIdx].t)}.
      </p>

      <div className="pc-stats">
        <div><small>Open ({rangeId})</small><strong>{inr(first.o)}</strong></div>
        <div><small>Highest</small><strong>{inr(candles[hiIdx].h)}</strong></div>
        <div><small>Lowest</small><strong>{inr(candles[loIdx].l)}</strong></div>
        <div>
          <small>Green / red {unit}s</small>
          <strong>
            <i aria-hidden="true" className="arrow up">▲</i>{greens} <span className="slash">/</span>{" "}
            <i aria-hidden="true" className="arrow down">▼</i>{n - greens}
          </strong>
        </div>
      </div>

      <div className="pc-foot">
        <div className="pc-key">
          <span><i className="sw up"></i>Green: closed higher than it opened</span>
          <span><i className="sw down"></i>Red: closed lower than it opened</span>
        </div>
        <button type="button" className="pc-table-btn" aria-expanded={showTable} onClick={() => setShowTable((s) => !s)}>
          {showTable ? "Hide table" : "View as table"}
        </button>
      </div>

      {showTable && (
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>{unit === "hour" ? "Time" : unit === "week" ? "Week" : "Date"}</th>
                <th className="num">Open</th>
                <th className="num">High</th>
                <th className="num">Low</th>
                <th className="num">Close</th>
                <th className="num">Bags</th>
              </tr>
            </thead>
            <tbody>
              {[...candles].reverse().map((k) => (
                <tr key={k.t}>
                  <td>{fmtLong(k.t)}</td>
                  <td className="num">{inr(k.o)}</td>
                  <td className="num">{inr(k.h)}</td>
                  <td className="num">{inr(k.l)}</td>
                  <td className={`num ${k.c >= k.o ? "pos" : "neg"}`}>{inr(k.c)}</td>
                  <td className="num">{k.v.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="pc-help">
        <summary>How to read a candle</summary>
        <div className="pc-help-body">
          <svg viewBox="0 0 220 120" aria-hidden="true" className="pc-help-svg">
            <line x1="50" x2="50" y1="10" y2="110" className="h-wick up" />
            <rect x="38" y="30" width="24" height="55" rx="2" className="h-body up" />
            <line x1="160" x2="160" y1="10" y2="110" className="h-wick down" />
            <rect x="148" y="30" width="24" height="55" rx="2" className="h-body down" />
            <text x="68" y="14" className="h-txt">High</text>
            <text x="68" y="34" className="h-txt">Close</text>
            <text x="68" y="88" className="h-txt">Open</text>
            <text x="68" y="112" className="h-txt">Low</text>
            <text x="178" y="34" className="h-txt">Open</text>
            <text x="178" y="88" className="h-txt">Close</text>
          </svg>
          <ul>
            <li>Each candle is one {unit} of trading at {city.mandi}.</li>
            <li>The thick part (body) runs from the opening price to the closing price.</li>
            <li>The thin line (wick) shows the highest and lowest price reached in that {unit}.</li>
            <li><b>Green</b> means the price went up during the {unit}, <b>red</b> means it went down.</li>
            <li>The bars at the bottom show how many bags were traded. Taller bars mean busier trading.</li>
          </ul>
        </div>
      </details>

      <p className="pc-note">Illustrative demo prices. Each candle is one {unit}. Not live rates or investment advice.</p>
    </section>
  );
}