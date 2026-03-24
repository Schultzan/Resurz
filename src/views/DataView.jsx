import { useState, useEffect } from "react";
import { normalizeHex, RESURZ_UI_PALETTE } from "../domain/entityColors.js";
import { theme } from "../theme.js";

const bodyFont = theme.fontSans;
const font = theme.fontMono;

const SECTION_META = {
  team: {
    title: "Team",
    blurb: "Personer, kapacitet per månad och avdelning används i planering och dashboard. Varje person får en unik färg från appens gemensamma palett (syns i spår och diagram) — tilldelas automatiskt per person.",
  },
  departments: {
    title: "Avdelningar",
    blurb: "Dynamiska taggar (Webb, Backend, …) för kapacitet per avdelning i dashboard.",
  },
  customers: {
    title: "Kunder",
    blurb:
      "Kundrader styr kolumner i planeringen; timpris och budget används för timtak. Intäkt och marginal på dashboarden summerar per aktiv kund: budget per månad + fast månadsintäkt (samma tänk som fasta månadsrader i Excel), utan att räkna timmar × pris. Beläggning och timmar påverkas bara av planeringen.",
  },
  internal: {
    title: "Interna projekt",
    blurb: "Egna satsningar — inte kundfaktura; valfria måltimmar som vägledning.",
  },
  drift: {
    title: "Intern drift",
    blurb:
      "Egna rader under ”Intern drift” i planeringen (egen kategori internalDrift, skild från kund och internt projekt). Lägg till, ta bort och välj färg per post.",
  },
  settings: {
    title: "Standardvärden",
    blurb:
      "Kapacitet för nya personer, månadskostnader för självkostnadspris, vilken driftpost som får global förtätning av timmar, m.m. Färger för kunder, interna projekt, drift och avdelningar kan justeras under respektive flik; personfärger tilldelas automatiskt.",
  },
};

export function DataView({
  workspace,
  addPerson,
  updatePerson,
  removePerson,
  addCustomer,
  updateCustomer,
  removeCustomer,
  addInternalProject,
  updateInternalProject,
  removeInternalProject,
  addDepartment,
  updateDepartment,
  removeDepartment,
  addDriftCategory,
  updateDriftCategory,
  removeDriftCategory,
  updateSettings,
  dataJump,
}) {
  const [tab, setTab] = useState("team");
  const departments = workspace.departments || [];

  useEffect(() => {
    if (dataJump?.t == null) return;
    if (SECTION_META[dataJump.section]) {
      queueMicrotask(() => setTab(dataJump.section));
    }
  }, [dataJump?.t, dataJump?.section]);

  const tabs = [
    { id: "team", label: "Team" },
    { id: "departments", label: "Avdelningar" },
    { id: "customers", label: "Kunder" },
    { id: "internal", label: "Interna projekt" },
    { id: "drift", label: "Intern drift" },
    { id: "settings", label: "Standardvärden" },
  ];

  const meta = SECTION_META[tab] ?? SECTION_META.team;

  return (
    <div style={{ fontFamily: bodyFont, color: theme.text, maxWidth: 920 }}>
      <header
        style={{
          marginBottom: 28,
          paddingBottom: 24,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.5px" }}>
          Inställningar
        </h1>
        <p style={{ fontSize: 14, color: theme.textMuted, margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
          Team, taggar, kunder, interna projekt, intern drift och globala standardvärden.
        </p>
      </header>

      <nav
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border:
                tab === t.id ? `1px solid ${theme.borderGlow}` : `1px solid ${theme.border}`,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: bodyFont,
              background: tab === t.id ? theme.tabActive : theme.surface,
              color: tab === t.id ? theme.text : theme.textMuted,
              textAlign: "left",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div
        style={{
          padding: "16px 18px",
          background: theme.surface,
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{meta.title}</div>
        <p style={{ fontSize: 13, color: theme.textMuted, margin: "8px 0 0", lineHeight: 1.45 }}>{meta.blurb}</p>
      </div>

      {tab === "team" && (
        <TeamSection
          people={workspace.people}
          departments={departments}
          settings={workspace.settings}
          addPerson={addPerson}
          updatePerson={updatePerson}
          removePerson={removePerson}
        />
      )}
      {tab === "departments" && (
        <DepartmentsSection
          departments={departments}
          addDepartment={addDepartment}
          updateDepartment={updateDepartment}
          removeDepartment={removeDepartment}
        />
      )}
      {tab === "customers" && (
        <CustomersSection
          customers={workspace.customers}
          addCustomer={addCustomer}
          updateCustomer={updateCustomer}
          removeCustomer={removeCustomer}
        />
      )}
      {tab === "internal" && (
        <InternalSection
          projects={workspace.internalProjects}
          addInternalProject={addInternalProject}
          updateInternalProject={updateInternalProject}
          removeInternalProject={removeInternalProject}
        />
      )}
      {tab === "drift" && (
        <DriftSection
          categories={workspace.driftCategories || []}
          addDriftCategory={addDriftCategory}
          updateDriftCategory={updateDriftCategory}
          removeDriftCategory={removeDriftCategory}
        />
      )}
      {tab === "settings" && (
        <SettingsSection workspace={workspace} updateSettings={updateSettings} fontMono={font} />
      )}
    </div>
  );
}

function TeamSection({ people, departments, settings, addPerson, updatePerson, removePerson }) {
  const [name, setName] = useState("");
  const [cap, setCap] = useState(settings.standardKapacitetPerManad);
  const [mal, setMal] = useState(0);
  const [deptId, setDeptId] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const n = name.trim();
    if (!n) {
      setErr("Namn krävs.");
      return;
    }
    if (people.some((p) => p.name === n)) {
      setErr("Namnet finns redan.");
      return;
    }
    setErr("");
    addPerson({
      name: n,
      kapacitetPerManad: cap,
      malFakturerbaraTimmar: mal,
      roles: [],
      departmentId: deptId || null,
    });
    setName("");
    setDeptId("");
    setCap(settings.standardKapacitetPerManad);
    setMal(0);
  };

  return (
    <div>
      <div
        style={{
          padding: 20,
          background: "#12122a",
          borderRadius: 12,
          border: "1px solid #ffffff08",
          marginBottom: 24,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Ny person</div>
        <div style={{ display: "grid", gap: 10, maxWidth: 400 }}>
          <input
            placeholder="Namn"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inp}
          />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input type="number" min={0} value={cap} onChange={(e) => setCap(Number(e.target.value))} style={inpSm} title="Kapacitet" />
            <input type="number" min={0} value={mal} onChange={(e) => setMal(Number(e.target.value))} style={inpSm} title="Mål fakt" />
            <select
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              style={{ ...inp, maxWidth: 220, padding: "8px 10px" }}
            >
              <option value="">Avdelning (valfritt)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          {err && <div style={{ color: "#ef4444", fontSize: 13 }}>{err}</div>}
          <button type="button" onClick={submit} style={btnPrimary}>
            Lägg till
          </button>
        </div>
      </div>

      {people.map((p) => (
        <PersonRow
          key={p.id}
          person={p}
          departments={departments}
          updatePerson={updatePerson}
          removePerson={removePerson}
        />
      ))}
    </div>
  );
}

function PersonRow({ person, departments, updatePerson, removePerson }) {
  const dept = departments.find((d) => d.id === person.departmentId);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(140px,1fr) minmax(140px,180px) 14px 88px 88px auto",
        gap: 12,
        alignItems: "center",
        padding: 14,
        borderBottom: "1px solid #ffffff08",
      }}
    >
      <div style={{ fontWeight: 600 }}>{person.name}</div>
      <select
        value={person.departmentId ?? ""}
        onChange={(e) =>
          updatePerson(person.id, { departmentId: e.target.value || null })
        }
        style={{ ...inp, padding: "8px 10px", fontSize: 13 }}
      >
        <option value="">Ingen avdelning</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {dept ? (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: dept.color,
            flexShrink: 0,
          }}
          title={dept.name}
        />
      ) : (
        <span style={{ width: 10 }} />
      )}
      <input
        type="number"
        min={0}
        value={person.kapacitetPerManad}
        onChange={(e) =>
          updatePerson(person.id, { kapacitetPerManad: Number(e.target.value) })
        }
        style={inpSm}
        title="Kapacitet"
      />
      <input
        type="number"
        min={0}
        value={person.malFakturerbaraTimmar}
        onChange={(e) =>
          updatePerson(person.id, { malFakturerbaraTimmar: Number(e.target.value) })
        }
        style={inpSm}
        title="Mål fakt"
      />
      <button type="button" onClick={() => removePerson(person.id)} style={btnDanger}>
        Ta bort
      </button>
    </div>
  );
}

function DepartmentsSection({ departments, addDepartment, updateDepartment, removeDepartment }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const n = name.trim();
    if (!n) {
      setErr("Namn krävs.");
      return;
    }
    if (departments.some((d) => d.name.toLowerCase() === n.toLowerCase())) {
      setErr("Finns redan.");
      return;
    }
    setErr("");
    addDepartment({ name: n });
    setName("");
  };

  return (
    <div>
      <p style={{ fontSize: 14, color: "#888", marginBottom: 16 }}>
        Avdelningar används som tagg per person och för grafer i dashboard (kapacitet och beläggning per avdelning).
        Varje avdelning har en egen färg (ändras med färgfältet) så den inte förväxlas med personer, kunder, drift eller interna projekt.
      </p>
      <div style={{ padding: 20, background: "#12122a", borderRadius: 12, border: "1px solid #ffffff08", marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Ny avdelning</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Namn, t.ex. Webb eller Backend"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...inp, flex: "1 1 200px" }}
          />
          <button type="button" onClick={submit} style={btnPrimary}>
            Lägg till
          </button>
        </div>
        {err ? <div style={{ color: "#ef4444", marginTop: 10, fontSize: 13 }}>{err}</div> : null}
      </div>
      {departments.map((d) => (
        <DepartmentRow key={d.id} department={d} updateDepartment={updateDepartment} removeDepartment={removeDepartment} />
      ))}
      {departments.length === 0 ? (
        <div style={{ color: "#666", fontSize: 14 }}>Inga avdelningar än — lägg till en ovan.</div>
      ) : null}
    </div>
  );
}

function DepartmentRow({ department, updateDepartment, removeDepartment }) {
  const colorVal = normalizeHex(department.color) || RESURZ_UI_PALETTE[0];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderBottom: "1px solid #ffffff08",
      }}
    >
      <input
        type="color"
        value={colorVal}
        onChange={(e) => {
          const n = normalizeHex(e.target.value);
          if (n) updateDepartment(department.id, { color: n });
        }}
        style={{ width: 40, height: 32, border: "none", background: "transparent", cursor: "pointer" }}
      />
      <input
        value={department.name}
        onChange={(e) => updateDepartment(department.id, { name: e.target.value })}
        style={{ ...inp, flex: "1 1 160px", maxWidth: 280 }}
      />
      <button
        type="button"
        onClick={() => removeDepartment(department.id)}
        style={btnDanger}
      >
        Ta bort
      </button>
    </div>
  );
}

function CustomersSection({ customers, addCustomer, updateCustomer, removeCustomer }) {
  const [name, setName] = useState("");
  const [timpris, setTimpris] = useState(1000);
  const [budget, setBudget] = useState(0);
  const [fastIntakt, setFastIntakt] = useState(0);
  const [err, setErr] = useState("");

  const submit = () => {
    const n = name.trim();
    if (!n) {
      setErr("Namn krävs.");
      return;
    }
    if (customers.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
      setErr("Finns redan.");
      return;
    }
    setErr("");
    addCustomer({ name: n, timpris, budgetPerManad: budget, fastManadsintaktKr: fastIntakt });
    setName("");
  };

  return (
    <div>
      <div style={{ padding: 20, background: "#12122a", borderRadius: 12, marginBottom: 24, border: "1px solid #ffffff08" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Ny kund</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 440 }}>
          <FormLabel title="Visningsnamn" hint="Det namn som syns i planeringsmatrisen och rapporter.">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="t.ex. Kund Alfa" />
          </FormLabel>
          <FormLabel
            title="Timpris"
            hint="Kronor per fakturerbar timme (exkl. moms). Används tillsammans med månadsbudget för att räkna ut max timmar per person i en kundcell."
          >
            <input type="number" min={0} value={timpris} onChange={(e) => setTimpris(Number(e.target.value))} style={inp} />
          </FormLabel>
          <FormLabel
            title="Budget per månad"
            hint="Kundens avtalade eller planerade kostnad i kronor per kalendermånad. Budget ÷ timpris = ungefärligt timtak för kolumnen (fördelat per person i planeringen)."
          >
            <input type="number" min={0} value={budget} onChange={(e) => setBudget(Number(e.target.value))} style={inp} />
          </FormLabel>
          <FormLabel
            title="Fast månadsintäkt (valfritt)"
            hint="Belopp som räknas in i teamets intäkt och marginal varje månad. Ingår inte i timpris eller budget; ingen koppling till planerade timmar."
          >
            <input
              type="number"
              min={0}
              step={100}
              value={fastIntakt}
              onChange={(e) => setFastIntakt(Number(e.target.value))}
              style={inp}
            />
          </FormLabel>
          <p style={{ fontSize: 11, color: "#888", lineHeight: 1.45, margin: 0 }}>
            Nya kunder får automatiskt en färg som inte redan används (person, avdelning, kund, internt projekt eller drift). Byt färg i listan nedan.
          </p>
          {err && <div style={{ color: "#ef4444", fontSize: 13 }}>{err}</div>}
          <button type="button" onClick={submit} style={btnPrimary}>
            Lägg till
          </button>
        </div>
      </div>
      {customers.map((c) => (
        <CustomerRow key={c.id} customer={c} updateCustomer={updateCustomer} removeCustomer={removeCustomer} />
      ))}
    </div>
  );
}

function CustomerRow({ customer, updateCustomer, removeCustomer }) {
  const colorVal = normalizeHex(customer.color) || RESURZ_UI_PALETTE[0];

  return (
    <div style={{ ...row }}>
      <input
        type="color"
        value={colorVal}
        title="Färg i planering och listor"
        onChange={(e) => {
          const n = normalizeHex(e.target.value);
          if (n) updateCustomer(customer.id, { color: n });
        }}
        style={{ width: 40, height: 32, border: "none", background: "transparent", cursor: "pointer" }}
      />
      <input
        value={customer.name}
        onChange={(e) => updateCustomer(customer.id, { name: e.target.value })}
        style={{ ...inp, fontWeight: 600, minWidth: 120, flex: "1 1 140px", maxWidth: 280 }}
        title="Visningsnamn"
        aria-label="Kundnamn"
      />
      <span style={{ fontSize: 11, color: "#666", width: 72 }} title="Timpris (kr/h)">
        Pris
      </span>
      <input
        type="number"
        min={0}
        value={customer.timpris}
        onChange={(e) => updateCustomer(customer.id, { timpris: Number(e.target.value) })}
        style={inpSm}
        title="Timpris kr/h"
      />
      <span style={{ fontSize: 11, color: "#666", width: 52 }} title="Budget kr/mån">
        Budget
      </span>
      <input
        type="number"
        min={0}
        value={customer.budgetPerManad}
        onChange={(e) => updateCustomer(customer.id, { budgetPerManad: Number(e.target.value) })}
        style={{ ...inpSm, width: 120 }}
        title="Budget kr/månad"
      />
      <span
        style={{ fontSize: 11, color: "#666", width: 72, flexShrink: 0 }}
        title="Fast intäkt utan timmar — räknas i intäkt/marginal"
      >
        Fast int.
      </span>
      <input
        type="number"
        min={0}
        step={100}
        value={customer.fastManadsintaktKr ?? 0}
        onChange={(e) =>
          updateCustomer(customer.id, { fastManadsintaktKr: Number(e.target.value) })
        }
        style={{ ...inpSm, width: 96 }}
        title="Kr/månad som intäkt utan planerade timmar"
      />
      <button type="button" onClick={() => removeCustomer(customer.id)} style={btnDanger}>
        Ta bort
      </button>
    </div>
  );
}

function DriftSection({ categories, addDriftCategory, updateDriftCategory, removeDriftCategory }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const n = name.trim();
    if (!n) {
      setErr("Namn krävs.");
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
      setErr("Finns redan.");
      return;
    }
    setErr("");
    addDriftCategory({ name: n });
    setName("");
  };

  return (
    <div>
      <div style={{ padding: 20, background: "#12122a", borderRadius: 12, marginBottom: 24, border: "1px solid #ffffff08" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Ny driftpost</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 440 }}>
          <FormLabel
            title="Namn"
            hint="T.ex. Utbildning eller Ledning — blir en egen slider under Intern drift i planeringen."
          >
            <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Driftkategori" />
          </FormLabel>
          {err && <div style={{ color: "#ef4444", fontSize: 13 }}>{err}</div>}
          <button type="button" onClick={submit} style={btnPrimary}>
            Lägg till
          </button>
        </div>
      </div>
      {categories.map((c) => (
        <DriftRow
          key={c.id}
          category={c}
          updateDriftCategory={updateDriftCategory}
          removeDriftCategory={removeDriftCategory}
        />
      ))}
      {categories.length === 0 ? (
        <div style={{ color: "#666", fontSize: 14 }}>Inga driftposter — lägg till en ovan.</div>
      ) : null}
    </div>
  );
}

function DriftRow({ category, updateDriftCategory, removeDriftCategory }) {
  const colorVal = normalizeHex(category.color) || RESURZ_UI_PALETTE[0];

  return (
    <div style={row}>
      <input
        type="color"
        value={colorVal}
        title="Färg i planeringen"
        onChange={(e) => {
          const n = normalizeHex(e.target.value);
          if (n) updateDriftCategory(category.id, { color: n });
        }}
        style={{ width: 40, height: 32, border: "none", background: "transparent", cursor: "pointer" }}
      />
      <input
        value={category.name}
        onChange={(e) => updateDriftCategory(category.id, { name: e.target.value })}
        style={{ ...inp, flex: "1 1 160px", maxWidth: 280 }}
      />
      <button type="button" onClick={() => removeDriftCategory(category.id)} style={btnDanger}>
        Ta bort
      </button>
    </div>
  );
}

function InternalSection({ projects, addInternalProject, updateInternalProject, removeInternalProject }) {
  const [name, setName] = useState("");
  const [mal, setMal] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const n = name.trim();
    if (!n) {
      setErr("Namn krävs.");
      return;
    }
    setErr("");
    addInternalProject({ name: n, malTimmar: mal === "" ? null : Number(mal) });
    setName("");
    setMal("");
  };

  return (
    <div>
      <div style={{ padding: 20, background: "#12122a", borderRadius: 12, marginBottom: 24, border: "1px solid #ffffff08" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Nytt internt projekt</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 440 }}>
          <FormLabel title="Namn" hint="T.ex. Produkt R&amp;D — blir en rad med slider under ”Interna projekt” i planeringen.">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Projektnamn" />
          </FormLabel>
          <FormLabel
            title="Måltimmar (valfritt)"
            hint="Vägledande mål i timmar för teamet (ingen hård gräns i slidrar). Lämna tomt om det inte ska visas."
          >
            <input placeholder="t.ex. 80" value={mal} onChange={(e) => setMal(e.target.value)} style={inp} />
          </FormLabel>
          <p style={{ fontSize: 11, color: "#888", lineHeight: 1.45, margin: 0 }}>
            Nya projekt får en ledig färg som inte redan används på annan entitet; ändra den i listan med färgväljaren.
          </p>
          {err && <div style={{ color: "#ef4444", fontSize: 13 }}>{err}</div>}
          <button type="button" onClick={submit} style={btnPrimary}>
            Lägg till
          </button>
        </div>
      </div>
      {projects.map((p) => (
        <InternalRow key={p.id} project={p} updateInternalProject={updateInternalProject} removeInternalProject={removeInternalProject} />
      ))}
    </div>
  );
}

function InternalRow({ project, updateInternalProject, removeInternalProject }) {
  const colorVal = normalizeHex(project.color) || RESURZ_UI_PALETTE[0];

  return (
    <div style={row}>
      <input
        type="color"
        value={colorVal}
        title="Färg i planering och listor"
        onChange={(e) => {
          const n = normalizeHex(e.target.value);
          if (n) updateInternalProject(project.id, { color: n });
        }}
        style={{ width: 40, height: 32, border: "none", background: "transparent", cursor: "pointer" }}
      />
      <input
        value={project.name}
        onChange={(e) => updateInternalProject(project.id, { name: e.target.value })}
        style={{ ...inp, fontWeight: 600, minWidth: 140, flex: "1 1 160px", maxWidth: 280 }}
        title="Projektnamn"
      />
      <span style={{ fontSize: 11, color: "#666" }} title="Måltimmar (vägledning)">
        Mål (h)
      </span>
      <input
        placeholder="—"
        value={project.malTimmar ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          updateInternalProject(project.id, {
            malTimmar: v === "" ? null : v,
          });
        }}
        style={inpSm}
      />
      <button type="button" onClick={() => removeInternalProject(project.id)} style={btnDanger}>
        Ta bort
      </button>
    </div>
  );
}

function FormLabel({ title, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {hint ? (
        <div style={{ fontSize: 11, color: "#888", marginBottom: 8, lineHeight: 1.45 }}>{hint}</div>
      ) : null}
      {children}
    </div>
  );
}

function SettingsSection({ workspace, updateSettings, fontMono }) {
  const { settings } = workspace;
  const driftCats = workspace.driftCategories || [];
  const cap = settings.standardKapacitetPerManad ?? 160;
  const annat = Math.max(0, Number(settings.standardTimmarInternAnnat) || 0);
  const belaggGrad =
    cap > 0 ? Math.max(0, Math.min(1, 1 - annat / cap)) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 460 }}>
      <SettingsField
        label="Månadskostnad — löner (totalt)"
        hint="Summa alla lönekostnader per månad (före avdrag). Används tillsammans med övriga kostnader för självkostnadspriset på dashboarden."
        value={settings.manadskostnadLoner ?? 0}
        onChange={(v) => updateSettings({ manadskostnadLoner: v })}
        step={1000}
      />
      <SettingsField
        label="Månadskostnad — övrigt"
        hint="Lokal, verktyg, admin, konsulter, etc. — övriga fasta månadskostnader utöver löner."
        value={settings.manadskostnadOvrigt ?? 0}
        onChange={(v) => updateSettings({ manadskostnadOvrigt: v })}
        step={1000}
      />
      <div
        style={{
          padding: 14,
          background: "#0f1629",
          borderRadius: 10,
          border: "1px solid #2563eb35",
          fontSize: 11,
          color: "#94a3b8",
          lineHeight: 1.5,
          maxWidth: 440,
        }}
      >
        <strong style={{ color: "#cbd5e1" }}>Självkostnadspris (kr/h)</strong> beräknas som{" "}
        <strong style={{ color: "#cbd5e1" }}>(löner + övrigt per månad)</strong> delat med{" "}
        <strong style={{ color: "#cbd5e1" }}>summan av planerade timmar på aktiva kundkolumner</strong> för vald månad
        (samma underlag som ”Fakturerbart” i teamraden). Interna projekt och intern drift räknas inte som
        fakturerbart underlag.
      </div>
      {driftCats.length > 0 ? (
        <label style={{ display: "block" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Driftpost för globala standardtimmar</div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 8, lineHeight: 1.45 }}>
            Den rad under Intern drift som fylls när du sätter antal timmar nedan (skriver över bara den radens värden för alla personer och månader).
          </div>
          <select
            value={settings.internAnnatDriftCategoryId ?? ""}
            onChange={(e) =>
              updateSettings({
                internAnnatDriftCategoryId: e.target.value || null,
              })
            }
            style={{
              width: "100%",
              maxWidth: 320,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#1a1a2e",
              border: "1px solid #ffffff15",
              color: "#f0f0f5",
              fontSize: 14,
              fontFamily: bodyFont,
            }}
          >
            {driftCats.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <SettingsField
        label="Standard kapacitet per månad"
        hint="Antal arbetstimmar som räknas som full sysselsättning för en månad (t.ex. 160). Används som förifyllt värde för nya personer och som tak i planeringsslidrar."
        value={settings.standardKapacitetPerManad}
        onChange={(v) => updateSettings({ standardKapacitetPerManad: Math.max(0, v) })}
      />
      <SettingsField
        label="Globala timmar (vald driftpost)"
        hint="Samma heltal sätts för alla personer och månader på driftposten du valt ovan. 0 rensar. Ändring här skriver över manuella värden på just den raden."
        value={annat}
        onChange={(v) => updateSettings({ standardTimmarInternAnnat: Math.max(0, v) })}
        step={1}
      />
      <div
        style={{
          padding: 16,
          background: "#12122a",
          borderRadius: 10,
          border: "1px solid #ffffff08",
        }}
      >
        <div style={{ fontSize: 11, color: "#888" }}>Beläggningsgrad</div>
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, lineHeight: 1.45 }}>
          Andel av standardkapacitet som återstår när globala drift-timmar är borträknade (100% minus
          andelen globala timmar).
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: fontMono, marginTop: 8 }}>
          {Math.round(belaggGrad * 100)}%
        </div>
      </div>
    </div>
  );
}

function SettingsField({ label, hint, value, onChange, step = 1 }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {hint ? (
        <div style={{ fontSize: 11, color: "#888", marginBottom: 8, lineHeight: 1.45 }}>{hint}</div>
      ) : null}
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "10px 12px",
          borderRadius: 8,
          background: "#1a1a2e",
          border: "1px solid #ffffff15",
          color: "#f0f0f5",
          fontSize: 14,
          fontFamily: bodyFont,
        }}
      />
    </label>
  );
}

const inp = {
  padding: "10px 12px",
  borderRadius: 8,
  background: theme.surface2,
  border: `1px solid ${theme.border}`,
  color: theme.text,
  fontSize: 14,
  fontFamily: bodyFont,
};

const inpSm = { ...inp, width: 100 };

const btnPrimary = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: `linear-gradient(135deg, ${theme.accentBlue}, ${theme.accentViolet})`,
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  alignSelf: "flex-start",
};

const btnGhost = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "transparent",
  color: theme.textMuted,
  cursor: "pointer",
  fontSize: 12,
};

const btnDanger = {
  ...btnGhost,
  borderColor: "rgba(232, 168, 184, 0.45)",
  color: theme.danger,
};

const row = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 12,
  padding: 14,
  borderBottom: "1px solid #ffffff08",
};
