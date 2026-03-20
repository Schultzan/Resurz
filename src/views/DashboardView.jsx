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
import {
  teamMetrics,
  customerColumnMetrics,
  driftColumnMetrics,
  costPriceMetrics,
} from "../domain/calculations.js";
import {
  customerPersonStackSeries,
  internalProjectPersonStackSeries,
  personCapacityBars,
  departmentUtilizationSeries,
} from "../domain/dashboardCharts.js";
import { formatHours, wholeHours } from "../domain/hours.js";
import { theme } from "../theme.js";
import { MonthNavigator } from "../components/MonthNavigator.jsx";

const font = theme.fontMono;
const bodyFont = theme.fontSans;

const AXIS_STYLE = { fill: theme.textMuted, fontSize: 11 };
const GRID_STYLE = { stroke: theme.border };
const TOOLTIP_STYLE = {
  backgroundColor: theme.surface2,
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  color: theme.text,
};
/** Ljusare ”ledigt” så stapel + legend syns mot mörk bakgrund */
const LEDIG_STACK_FILL = "rgba(172, 168, 210, 0.45)";
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

const LEGEND_STYLE = {
  fontSize: 11,
  color: theme.textSoft,
  paddingTop: 4,
};

/** Etikett i mörkt tema (undviker svart SVG-text i pajer) */
function piePercentLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.06) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const RADIAN = Math.PI / 180;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const t = `${(percent * 100).toFixed(0)}%`;
  return (
    <text
      x={x}
      y={y}
      fill={theme.text}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
    >
      {t}
    </text>
  );
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

export function DashboardView({ workspace, selectedMonthId, setSelectedMonthId, shiftMonth }) {
  const tm = teamMetrics(workspace, selectedMonthId);
  const cost = costPriceMetrics(workspace, selectedMonthId);
  const custCols = customerColumnMetrics(workspace, selectedMonthId);
  const driftCols = driftColumnMetrics(workspace, selectedMonthId);
  const sortedMonths = [...workspace.months].sort((a, b) => a.id.localeCompare(b.id));

  const custStack = customerPersonStackSeries(workspace, selectedMonthId);
  const projStack = internalProjectPersonStackSeries(workspace, selectedMonthId);
  const personBars = personCapacityBars(workspace, selectedMonthId);
  const deptBars = departmentUtilizationSeries(workspace, selectedMonthId);

  const pieMix = [
    { name: "Fakturerbart", value: tm.teamFakturerbara, color: theme.billable },
    { name: "Interna projekt", value: tm.teamInternProj, color: theme.internal },
    { name: "Intern drift", value: tm.teamInternDrift, color: theme.drift },
  ].filter((x) => x.value > 0);

  return (
    <div style={{ fontFamily: bodyFont, color: theme.text }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <MonthNavigator
          months={sortedMonths}
          selectedMonthId={selectedMonthId}
          onSelect={setSelectedMonthId}
          onShift={shiftMonth}
          compact
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <DashKpi label="Teamkapacitet" value={`${tm.teamkapacitet} h`} />
        <DashKpi label="Fakturerbart" value={`${formatHours(tm.teamFakturerbara)} h`} color={theme.billable} />
        <DashKpi label="Interna projekt" value={`${formatHours(tm.teamInternProj)} h`} color={theme.internal} />
        <DashKpi label="Intern drift" value={`${formatHours(tm.teamInternDrift)} h`} color={theme.drift} />
        <DashKpi label="Allokerat" value={`${formatHours(tm.teamTot)} h`} />
        <DashKpi
          label="Kvar"
          value={`${formatHours(tm.teamKvar)} h`}
          color={tm.teamKvar < 0 ? theme.danger : theme.ok}
        />
        <DashKpi label="Beläggning" value={pct(tm.teamAllocGrad)} />
        <DashKpi label="Fakt. grad" value={pct(tm.teamBillGrad)} />
        <DashKpi
          label="Intäkt"
          value={`${Math.round(tm.teamIntakt).toLocaleString("sv-SE")} kr`}
          color={theme.revenue}
        />
        <DashKpi
          label="Månadskostnad"
          value={`${cost.monthlyBurn.toLocaleString("sv-SE")} kr`}
          color={cost.monthlyBurn > 0 ? theme.accentSand : undefined}
        />
        <DashKpi
          label="Självkostnad"
          value={
            cost.krPerHour != null
              ? `${Math.round(cost.krPerHour).toLocaleString("sv-SE")} kr/h`
              : "—"
          }
          color={cost.krPerHour != null ? theme.accentSand : theme.textSoft}
        />
      </div>

      <p
        style={{
          fontSize: 10,
          color: theme.textSoft,
          margin: "0 0 14px",
          maxWidth: 900,
          lineHeight: 1.45,
        }}
      >
        <strong style={{ color: theme.textMuted }}>Självkostnad:</strong> månadskostnad delat med snitt fakturerbara
        timmar (vald månads kundtimmar × 11 ÷ 12).
      </p>

      <ChartCard
        title="Avdelningar — kapacitet och beläggning"
        subtitle="Ett minidiagram per avdelning: ljus del = ledig kapacitet, färgad del = utnyttjad tid inom mål, röd spets = över kapacitet. Hover visar timmar."
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
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <ChartCard
          title="Var är timmarna?"
          subtitle="Samma månads total: kund (fakturerbart), interna projekt och intern drift. Pajen visar andelar — siffror i tooltip."
          compact
        >
          {pieMix.length === 0 ? (
            <EmptyChart compact>Inga allokerade timmar.</EmptyChart>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Pie
                  data={pieMix}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  label={piePercentLabel}
                >
                  {pieMix.map((e) => (
                    <Cell key={e.name} fill={e.color} stroke={theme.bgDeep} strokeWidth={1.5} />
                  ))}
                </Pie>
                <Tooltip
                  {...chartTooltipProps()}
                  formatter={(v, name) => [`${formatHours(v)} h`, name]}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  wrapperStyle={LEGEND_STYLE}
                  formatter={(value) => <span style={{ color: theme.textSoft }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Kapacitet per person" compact>
          {personBars.length === 0 ? (
            <EmptyChart compact>Inga aktiva personer.</EmptyChart>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, personBars.length * 26)}>
              <BarChart
                layout="vertical"
                data={personBars}
                margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
              >
                <CartesianGrid {...GRID_STYLE} horizontal strokeDasharray="3 3" />
                <XAxis type="number" tick={{ ...AXIS_STYLE, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={108} tick={{ ...AXIS_STYLE, fontSize: 10 }} />
                <Tooltip
                  {...chartTooltipProps()}
                  formatter={(v, n) => [`${formatHours(v)} h`, n]}
                  labelFormatter={(_, p) => p?.[0]?.payload?.fullName}
                />
                <Legend wrapperStyle={LEGEND_STYLE} formatter={(v) => <span style={{ color: theme.text }}>{v}</span>} />
                <Bar dataKey="Ledigt" stackId="p" fill={LEDIG_STACK_FILL} name="Ledigt" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Allokerat" stackId="p" fill={theme.billable} name="Inom kap." radius={[0, 3, 3, 0]} />
                <Bar dataKey="Överkap" stackId="p" fill={theme.danger} name="Över" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Timmar per kund" subtitle="Staplar per person (färg). Tabellen under visar samma data med namn." compact>
        {custStack.rows.length === 0 ? (
          <EmptyChart compact>Ingen kund med timmar.</EmptyChart>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, custStack.rows.length * 36)}>
            <BarChart data={custStack.rows} margin={{ left: 4, right: 8, top: 4, bottom: 40 }}>
              <CartesianGrid {...GRID_STYLE} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ ...AXIS_STYLE, fontSize: 10 }}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={52}
              />
              <YAxis tick={{ ...AXIS_STYLE, fontSize: 10 }} width={36} />
              <Tooltip {...chartTooltipProps()} formatter={(v, n) => [`${formatHours(v)} h`, n]} />
              <Legend
                wrapperStyle={{ ...LEGEND_STYLE, fontSize: 10 }}
                formatter={(v) => <span style={{ color: theme.text }}>{v}</span>}
              />
              {custStack.people.map((p) => (
                <Bar key={p.id} dataKey={`h_${p.id}`} name={p.shortName} stackId="cust" fill={p.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Timmar per internt projekt" subtitle="Staplar per person. Tabellen under listar vem som lagt timmarna." compact>
        {projStack.rows.length === 0 ? (
          <EmptyChart compact>Inga timmar på interna projekt.</EmptyChart>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(190, projStack.rows.length * 34)}>
            <BarChart data={projStack.rows} margin={{ left: 4, right: 8, top: 4, bottom: 40 }}>
              <CartesianGrid {...GRID_STYLE} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ ...AXIS_STYLE, fontSize: 10 }}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={52}
              />
              <YAxis tick={{ ...AXIS_STYLE, fontSize: 10 }} width={36} />
              <Tooltip {...chartTooltipProps()} formatter={(v, n) => [`${formatHours(v)} h`, n]} />
              <Legend
                wrapperStyle={{ ...LEGEND_STYLE, fontSize: 10 }}
                formatter={(v) => <span style={{ color: theme.text }}>{v}</span>}
              />
              {projStack.people.map((p) => (
                <Bar key={p.id} dataKey={`h_${p.id}`} name={p.shortName} stackId="ip" fill={p.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: theme.textSoft,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          margin: "14px 0 8px",
        }}
      >
        Detaljer (tabell)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <MiniTable title="Per person" rows={tm.perPerson} type="person" />
        <HoursBreakdownTable title="Timmar per kund" subtitle="Totalt och fördelning per person" stack={custStack} budgetByCustomerId={Object.fromEntries(custCols.map((c) => [c.customer.id, c.budgetTimmar]))} showBudget />
        <HoursBreakdownTable title="Timmar per internt projekt" subtitle="Totalt och fördelning per person" stack={projStack} />
        <MiniTable title="Drift" driftCols={driftCols} />
      </div>
    </div>
  );
}

function DepartmentDonutRow({ deptBars }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-start",
        justifyContent: "flex-start",
      }}
    >
      {deptBars.map((d) => {
        if (wholeHours(d.capacity) <= 0) {
          return (
            <div key={d.fullName} style={{ width: 128, flexShrink: 0, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.text, marginBottom: 4 }}>{d.name}</div>
              <div style={{ fontSize: 10, color: theme.textSoft }}>Ingen kapacitet</div>
            </div>
          );
        }
        const slices = [
          { name: "Ledigt", value: d.Ledigt, color: LEDIG_STACK_FILL },
          { name: "Allokerat", value: d.Allokerat, color: d.deptColor || theme.billable },
          { name: "Över kap.", value: d.Överkap, color: theme.danger },
        ].filter((s) => s.value > 0);
        return (
          <div
            key={d.fullName}
            style={{
              width: 128,
              flexShrink: 0,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: theme.text,
                marginBottom: 4,
                lineHeight: 1.2,
                minHeight: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {d.name}
            </div>
            <ResponsiveContainer width="100%" height={112}>
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={34}
                  outerRadius={50}
                  paddingAngle={slices.length > 1 ? 1.5 : 0}
                  label={false}
                  stroke={theme.bgDeep}
                  strokeWidth={1}
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
            <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 2, fontFamily: font }}>
              {pct(d.rate)} beläggning
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HoursBreakdownTable({ title, subtitle, stack, budgetByCustomerId, showBudget }) {
  const rows = stack?.rows ?? [];
  const people = stack?.people ?? [];
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: theme.bgDeep,
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${theme.border}`,
          fontWeight: 700,
          fontSize: 13,
          color: theme.text,
        }}
      >
        {title}
        {subtitle ? (
          <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 4, fontWeight: 500, lineHeight: 1.35 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto" }}>
        {rows.length === 0 ? (
          <div style={{ padding: 14, color: theme.textMuted, fontSize: 12 }}>Ingen data för vald månad.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={mth}>{showBudget ? "Kund" : "Projekt"}</th>
                <th style={{ ...mth, textAlign: "right" }}>Tot</th>
                <th style={mth}>Fördelning</th>
                {showBudget ? <th style={{ ...mth, textAlign: "right" }}>Budget</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const parts = people
                  .map((p) => ({ p, h: Number(row[`h_${p.id}`]) || 0 }))
                  .filter((x) => x.h > 0)
                  .sort((a, b) => b.h - a.h)
                  .map((x) => `${x.p.shortName}: ${formatHours(x.h)} h`);
                const total = people.reduce((s, p) => s + (Number(row[`h_${p.id}`]) || 0), 0);
                const budget =
                  showBudget && budgetByCustomerId && row.refId != null
                    ? budgetByCustomerId[row.refId]
                    : null;
                return (
                  <tr key={row.refId ?? row.label}>
                    <td style={mtd}>{row.label}</td>
                    <td style={mtdNum}>{formatHours(total)}</td>
                    <td style={{ ...mtd, fontSize: 10, color: theme.textMuted, lineHeight: 1.35 }}>
                      {parts.length ? parts.join(" · ") : "—"}
                    </td>
                    {showBudget ? (
                      <td style={mtdNum}>{budget != null && budget > 0 ? formatHours(budget) : "—"}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MiniTable({ title, rows, type, driftCols }) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: theme.bgDeep,
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${theme.border}`,
          fontWeight: 700,
          fontSize: 13,
          color: theme.text,
        }}
      >
        {title}
      </div>
      <div style={{ overflowX: "auto", maxHeight: 220, overflowY: "auto" }}>
        {type === "person" && rows ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Namn", "Kap", "Tot", "%"].map((h) => (
                  <th key={h} style={mth}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.person.id}>
                  <td style={mtd}>{r.person.name}</td>
                  <td style={mtdNum}>{r.kapacitet}</td>
                  <td style={mtdNum}>{formatHours(r.total)}</td>
                  <td style={mtdNum}>{pct(r.allocationRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {driftCols ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Kategori", "Plan"].map((h) => (
                  <th key={h} style={mth}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {driftCols.map((c) => (
                <tr key={c.drift.id}>
                  <td style={mtd}>{c.drift.name}</td>
                  <td style={mtdNum}>{formatHours(c.planerade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

const mth = {
  textAlign: "left",
  padding: "6px 8px",
  color: theme.textSoft,
  fontSize: 8,
  textTransform: "uppercase",
};
const mtd = { padding: "6px 8px", borderTop: `1px solid ${theme.border}`, color: theme.text, fontSize: 11 };
const mtdNum = { ...mtd, textAlign: "right", fontFamily: font, fontSize: 11 };

function ChartCard({ title, subtitle, children, compact }) {
  const pad = compact ? "10px 12px 6px" : "16px 16px 8px";
  const titleSize = compact ? 13 : 14;
  const subMb = compact ? 6 : 12;
  const titleMb = subtitle ? (compact ? 3 : 4) : compact ? 6 : 12;
  return (
    <div
      style={{
        background: theme.surface,
        borderRadius: compact ? 12 : 14,
        border: `1px solid ${theme.border}`,
        padding: pad,
        marginBottom: compact ? 8 : 0,
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
      {children}
    </div>
  );
}

function EmptyChart({ children, compact }) {
  return (
    <div
      style={{
        height: compact ? 100 : 220,
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

function DashKpi({ label, value, color }) {
  return (
    <div
      style={{
        background: theme.surface2,
        borderRadius: 10,
        padding: "8px 10px",
        border: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ fontSize: 9, color: theme.textSoft, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: font, color: color ?? theme.text }}>{value}</div>
    </div>
  );
}
