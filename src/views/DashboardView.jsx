import { Fragment } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { teamMetrics } from "../domain/calculations.js";
import {
  customerPersonStackSeries,
  personCapacityBars,
  departmentUtilizationSeries,
} from "../domain/dashboardCharts.js";
import { formatHours, wholeHours } from "../domain/hours.js";
import { theme } from "../theme.js";
const font = theme.fontMono;
const bodyFont = theme.fontSans;

const AXIS_STYLE = { fill: theme.textMuted, fontSize: 11 };
const GRID_STYLE = { stroke: theme.border, strokeOpacity: 0.35 };
const BAR_RADIUS_TOP = [5, 5, 0, 0];
/** Spår i kapacitetsdonuts (upptaget) — diskret mörk */
const CAPACITY_TRACK_FILL = "rgba(38, 34, 56, 0.92)";
const DASH_SEGMENT = {
  background: "rgba(26, 22, 40, 0.72)",
  border: "1px solid rgba(110, 100, 150, 0.16)",
  borderRadius: 16,
};
const TOOLTIP_STYLE = {
  backgroundColor: theme.surface2,
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  color: theme.text,
};
const TOOLTIP_LABEL_STYLE = { color: theme.textMuted, fontWeight: 600 };
const TOOLTIP_ITEM_STYLE = { color: theme.text };
const TOOLTIP_WRAPPER_STYLE = { zIndex: 1000, outline: "none" };

function chartTooltipProps() {
  return {
    contentStyle: TOOLTIP_STYLE,
    labelStyle: TOOLTIP_LABEL_STYLE,
    itemStyle: TOOLTIP_ITEM_STYLE,
    wrapperStyle: TOOLTIP_WRAPPER_STYLE,
  };
}

/** Tooltip för stapeldiagram: visar bara personer med timmar > 0. */
function StackHoursTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && Number(p.value) > 0);
  if (!rows.length) return null;
  return (
    <div
      style={{
        ...TOOLTIP_STYLE,
        padding: "10px 12px",
        minWidth: 140,
      }}
    >
      <div style={{ ...TOOLTIP_LABEL_STYLE, marginBottom: 8 }}>{label}</div>
      {rows.map((entry) => (
        <div
          key={String(entry.dataKey)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 4,
            fontSize: 12,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: entry.color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: theme.text, flex: 1 }}>{entry.name}</span>
          <span style={{ color: theme.text, fontFamily: font, fontWeight: 600 }}>
            {formatHours(entry.value)} h
          </span>
        </div>
      ))}
    </div>
  );
}

const LEGEND_STYLE = {
  fontSize: 11,
  color: theme.textSoft,
  paddingTop: 4,
};

/** Tydligare segmentfärger enbart för pajen ”typ av arbete” (global tema billable/internal/drift ligger nära varandra). */
const PIE_WORK_MIX_COLORS = {
  Fakturerbart: "#6eb8ff",
  "Interna projekt": "#e8b84a",
  "Intern drift": "#5bd4a8",
};

/**
 * Procent inuti ringen + titel (name) vid label-linjens ände, i mörkt tema.
 * @param {object} props Recharts sector + endPoint (x,y) + textAnchor
 */
function pieWorkMixLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  x,
  y,
  textAnchor,
  name,
  payload,
}) {
  const title = name ?? payload?.name ?? "";
  const RADIAN = Math.PI / 180;
  const ir = Number(innerRadius);
  const or = Number(outerRadius);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(ir) || !Number.isFinite(or)) {
    return null;
  }
  const innerR = ir + (or - ir) * 0.52;
  const ix = cx + innerR * Math.cos(-midAngle * RADIAN);
  const iy = cy + innerR * Math.sin(-midAngle * RADIAN);
  const innerAnchor = ix > cx ? "start" : "end";
  const pct = `${Math.round(percent * 100)}%`;
  const showInner = percent >= 0.06;

  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy) || 1;
  const labelOut = 8;
  const ox = x + (dx / dist) * labelOut;
  const oy = y + (dy / dist) * labelOut;

  return (
    <g>
      {showInner ? (
        <text
          x={ix}
          y={iy}
          fill={theme.text}
          textAnchor={innerAnchor}
          dominantBaseline="central"
          fontSize={11}
          fontWeight={700}
        >
          {pct}
        </text>
      ) : null}
      {title ? (
        <text
          x={ox}
          y={oy}
          fill={theme.textMuted}
          textAnchor={textAnchor}
          dominantBaseline="central"
          fontSize={11}
          fontWeight={600}
          style={{ fontFamily: bodyFont }}
        >
          {title}
        </text>
      ) : null}
    </g>
  );
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

export function DashboardView({ workspace, selectedMonthId }) {
  const tm = teamMetrics(workspace, selectedMonthId);

  const custStack = customerPersonStackSeries(workspace, selectedMonthId);
  const personBars = personCapacityBars(workspace, selectedMonthId);
  const deptBars = departmentUtilizationSeries(workspace, selectedMonthId);

  const pieMix = [
    {
      name: "Fakturerbart",
      value: tm.teamFakturerbara,
      color: PIE_WORK_MIX_COLORS.Fakturerbart,
    },
    {
      name: "Interna projekt",
      value: tm.teamInternProj,
      color: PIE_WORK_MIX_COLORS["Interna projekt"],
    },
    {
      name: "Intern drift",
      value: tm.teamInternDrift,
      color: PIE_WORK_MIX_COLORS["Intern drift"],
    },
  ].filter((x) => x.value > 0);

  /** Gemensam höjd för paj + kundstapel så korten i raden blir lika höga. */
  const distributionPlotHeight = Math.max(300, Math.max(200, custStack.rows.length * 36 + 96));

  return (
    <div style={{ fontFamily: bodyFont, color: theme.text }}>
      <ChartCard
        title="Kapacitet per person"
        subtitle="Endast personer med ledig tid. Längst till vänster: lediga timmar i personfärg, därefter planerat (mörkt), ev. över kapacitet (rött). Siffran efter stapeln = timmar ledigt."
        compact
      >
        {personBars.length === 0 ? (
          <EmptyChart compact>Ingen med ledig tid — alla med kapacitet är fullt belagda (eller saknar kapacitet).</EmptyChart>
        ) : (
          <PersonFreeCapacityBarChart personBars={personBars} />
        )}
      </ChartCard>

      <ChartCard
        title="Kapacitet per avdelning"
        subtitle="Varje avdelning i eget kort. Färgad båge = utnyttjad kapacitet, mörk = ledigt, röd = över kapacitet. Hover visar timmar."
        compact
      >
        {deptBars.length === 0 ? (
          <EmptyChart compact>Skapa avdelningar under Inställningar och tilldela personer.</EmptyChart>
        ) : (
          <DepartmentDonutRow deptBars={deptBars} />
        )}
      </ChartCard>

      <div
        style={{
          marginBottom: 10,
          padding: "14px 14px 0",
          background: "rgba(22, 18, 36, 0.45)",
          borderRadius: 14,
          border: "1px solid rgba(110, 100, 150, 0.12)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 6, letterSpacing: "-0.02em" }}>
          Fördelning av allokerade timmar
        </div>
        <div
          style={{
            fontSize: 10,
            color: theme.textMuted,
            marginBottom: 12,
            lineHeight: 1.45,
            maxWidth: 820,
          }}
        >
          Vänster: andel allokerade timmar mellan fakturerbart, interna projekt och drift. Höger: timmar per kund med
          staplar per person.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
            gap: 10,
            alignItems: "stretch",
            paddingBottom: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
            <ChartCard
              title="Timmar: typ av arbete"
              subtitle="Fakturerbart, interna projekt och intern drift. Hover för timmar."
              compact
              fillHeight
            >
              {pieMix.length === 0 ? (
                <EmptyChart compact fillMinHeight={distributionPlotHeight}>
                  Inga allokerade timmar.
                </EmptyChart>
              ) : (
                <div style={{ width: "100%", height: distributionPlotHeight, padding: "4px 0 0" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 10, right: 28, left: 28, bottom: 10 }}>
                      <Pie
                        data={pieMix}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="46%"
                        innerRadius="40%"
                        outerRadius="68%"
                        paddingAngle={1.5}
                        label={pieWorkMixLabel}
                        labelLine={{ stroke: "rgba(200, 190, 235, 0.45)", strokeWidth: 1 }}
                      >
                        {pieMix.map((e) => (
                          <Cell key={e.name} fill={e.color} stroke="rgba(18, 14, 28, 0.85)" strokeWidth={1.5} />
                        ))}
                      </Pie>
                      <Tooltip
                        {...chartTooltipProps()}
                        formatter={(v, name) => [`${formatHours(v)} h`, name]}
                      />
                      <Legend
                        layout="horizontal"
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ ...LEGEND_STYLE, width: "100%", paddingTop: 8 }}
                        formatter={(value) => <span style={{ color: theme.textSoft }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
            <ChartCard
              title="Timmar per kund"
              subtitle="Staplar per person (färger). Hover för timmar."
              compact
              fillHeight
            >
              {custStack.rows.length === 0 ? (
                <EmptyChart compact fillMinHeight={distributionPlotHeight}>
                  Ingen kund med timmar.
                </EmptyChart>
              ) : (
                <div style={{ width: "100%", height: distributionPlotHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={custStack.rows}
                      margin={{ left: 4, right: 8, top: 8, bottom: 44 }}
                      barCategoryGap="14%"
                      barGap={2}
                    >
                      <CartesianGrid {...GRID_STYLE} strokeDasharray="4 6" />
                      <XAxis
                        dataKey="label"
                        tick={{ ...AXIS_STYLE, fontSize: 10 }}
                        interval={0}
                        angle={-18}
                        textAnchor="end"
                        height={52}
                      />
                      <YAxis tick={{ ...AXIS_STYLE, fontSize: 10 }} width={36} />
                      <Tooltip content={StackHoursTooltip} wrapperStyle={TOOLTIP_WRAPPER_STYLE} />
                      <Legend
                        wrapperStyle={{ ...LEGEND_STYLE, fontSize: 10 }}
                        formatter={(v) => <span style={{ color: theme.text }}>{v}</span>}
                      />
                      {custStack.people.map((p, idx) => (
                        <Bar
                          key={p.id}
                          dataKey={`h_${p.id}`}
                          name={p.shortName}
                          stackId="cust"
                          fill={p.color}
                          radius={idx === custStack.people.length - 1 ? BAR_RADIUS_TOP : [0, 0, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardDonutSegment({ title, children, footer }) {
  return (
    <div
      style={{
        ...DASH_SEGMENT,
        padding: "14px 12px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: theme.text,
          marginBottom: 10,
          lineHeight: 1.25,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </div>
      {children}
      {footer}
    </div>
  );
}

function DepartmentDonutRow({ deptBars }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))",
        gap: 12,
        alignItems: "stretch",
      }}
    >
      {deptBars.map((d) => {
        if (wholeHours(d.capacity) <= 0) {
          return (
            <DashboardDonutSegment
              key={d.fullName}
              title={d.name}
              footer={
                <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 10 }}>Ingen kapacitet</div>
              }
            >
              <div style={{ height: 120, display: "flex", alignItems: "center", color: theme.textSoft, fontSize: 11 }}>
                —
              </div>
            </DashboardDonutSegment>
          );
        }
        const slices = [
          { name: "Ledigt", value: d.Ledigt, color: CAPACITY_TRACK_FILL },
          { name: "Belagt", value: d.Allokerat, color: d.deptColor || theme.billable },
          { name: "Över kap.", value: d.Överkap, color: theme.danger },
        ].filter((s) => s.value > 0);
        return (
          <DashboardDonutSegment
            key={d.fullName}
            title={d.name}
            footer={
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 10, fontFamily: font, fontWeight: 600 }}>
                {pct(d.rate)} beläggning
              </div>
            }
          >
            <div style={{ width: "100%", maxWidth: 132, height: 124 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={54}
                    paddingAngle={slices.length > 1 ? 1.2 : 0}
                    label={false}
                    stroke="rgba(20, 16, 32, 0.9)"
                    strokeWidth={1.5}
                  >
                    {slices.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...chartTooltipProps()}
                    formatter={(v, n) => [`${formatHours(v)} h`, n]}
                    labelFormatter={() =>
                      `${d.fullName} · Kap ${formatHours(d.capacity)} h · Allok ${formatHours(d.allocated)} h`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </DashboardDonutSegment>
        );
      })}
    </div>
  );
}

/** Ledig tid till vänster (personfärg), därefter planerat och över kap. Skala = största radens timmar. */
function PersonFreeCapacityBarChart({ personBars }) {
  const rows = [...personBars].sort((a, b) => b.Ledigt - a.Ledigt || a.name.localeCompare(b.name));
  const maxSpan = Math.max(1, ...rows.map((d) => d.Ledigt + d.Allokerat + d.Överkap));

  return (
    <div style={{ padding: "6px 0 4px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(96px, 118px) minmax(0, 1fr) auto",
          columnGap: 10,
          rowGap: 14,
          alignItems: "center",
        }}
      >
        {rows.map((row) => {
          const span = row.Ledigt + row.Allokerat + row.Överkap;
          const trackFrac = span / maxSpan;
          const tip = `${row.fullName} — Kap ${formatHours(row.cap)} h, planerat ${formatHours(row.alloc)} h, ledigt ${formatHours(row.Ledigt)} h`;
          return (
            <Fragment key={row.fullName}>
              <div
                title={tip}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.name}
              </div>
              <div
                title={tip}
                style={{
                  minWidth: 0,
                  height: 24,
                  borderRadius: 8,
                  background: DASH_SEGMENT.background,
                  border: DASH_SEGMENT.border,
                  display: "flex",
                  alignItems: "stretch",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${trackFrac * 100}%`,
                    minWidth: span > 0 ? 2 : 0,
                    display: "flex",
                    height: "100%",
                    overflow: "hidden",
                    borderRadius: 6,
                  }}
                >
                  {row.Ledigt > 0 ? (
                    <div
                      style={{
                        flexGrow: row.Ledigt,
                        flexShrink: 0,
                        flexBasis: 0,
                        minWidth: 0,
                        background: row.color,
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
                      }}
                    />
                  ) : null}
                  {row.Allokerat > 0 ? (
                    <div
                      style={{
                        flexGrow: row.Allokerat,
                        flexShrink: 0,
                        flexBasis: 0,
                        minWidth: 0,
                        background: CAPACITY_TRACK_FILL,
                      }}
                    />
                  ) : null}
                  {row.Överkap > 0 ? (
                    <div
                      style={{
                        flexGrow: row.Överkap,
                        flexShrink: 0,
                        flexBasis: 0,
                        minWidth: 0,
                        background: theme.danger,
                      }}
                    />
                  ) : null}
                </div>
              </div>
              <div
                title={tip}
                style={{
                  fontFamily: font,
                  fontSize: 11,
                  fontWeight: 700,
                  color: row.Ledigt > 0 ? row.color : theme.textSoft,
                  whiteSpace: "nowrap",
                }}
              >
                {formatHours(row.Ledigt)} h
              </div>
            </Fragment>
          );
        })}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(96px, 118px) minmax(0, 1fr) auto",
          columnGap: 10,
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <div />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: theme.textMuted,
            fontFamily: font,
          }}
        >
          <span>0 h</span>
          <span>{formatHours(maxSpan)} h</span>
        </div>
        <div />
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 16px",
          fontSize: 10,
          color: theme.textSoft,
          marginTop: 10,
          lineHeight: 1.4,
        }}
      >
        <span>
          <span style={{ color: theme.accentMint }}>■</span> Ledigt (personfärg)
        </span>
        <span>
          <span style={{ color: CAPACITY_TRACK_FILL }}>■</span> Planerat
        </span>
        <span>
          <span style={{ color: theme.danger }}>■</span> Över kap.
        </span>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, compact, fillHeight }) {
  const pad = compact ? "12px 14px 10px" : "16px 16px 8px";
  const titleSize = compact ? 14 : 15;
  const subMb = compact ? 8 : 12;
  const titleMb = subtitle ? (compact ? 4 : 4) : compact ? 8 : 12;
  return (
    <div
      style={{
        background: "rgba(30, 26, 46, 0.55)",
        borderRadius: compact ? 14 : 16,
        border: "1px solid rgba(110, 100, 150, 0.14)",
        padding: pad,
        marginBottom: compact && !fillHeight ? 10 : 0,
        ...(fillHeight
          ? {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              height: "100%",
            }
          : {}),
      }}
    >
      <div
        style={{ fontSize: titleSize, fontWeight: 800, marginBottom: titleMb, color: theme.text }}
      >
        {title}
      </div>
      {subtitle ? (
        <div style={{ fontSize: compact ? 10 : 11, color: theme.textMuted, marginBottom: subMb, lineHeight: 1.35 }}>
          {subtitle}
        </div>
      ) : null}
      {fillHeight ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function EmptyChart({ children, compact, fillMinHeight }) {
  return (
    <div
      style={{
        height: fillMinHeight != null ? fillMinHeight : compact ? 100 : 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme.textMuted,
        fontSize: compact ? 12 : 14,
        padding: compact ? "8px 12px" : 0,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}
