import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const blankSuspect = { name: "", age: "", address: "", identification: "", notes: "" };
const blankWitness = { name: "", contact: "", statement: "" };
const blankEvidence = { item: "", description: "", collectedDate: "", collectedBy: "", storedAt: "" };

const blank = {
  title: "",
  type: "Cyber Crime",
  description: "",
  firNo: "",
  fileNumber: "",
  assignedTo: "",
  priority: "Medium",
  location: "",
  incidentDate: "",
  reportedOn: "",
};

export default function CaseForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { meta, notify, user } = useApp();
  const canAssign = ["Admin", "Supervisor"].includes(user.role);
  const canPrioritize = ["Investigating Officer", "Supervisor", "Admin"].includes(user.role);
  const navigate = useNavigate();
  const [form, setForm] = useState(blank);
  const [officers, setOfficers] = useState([]);
  const [error, setError] = useState("");
  const [loadingCase, setLoadingCase] = useState(editing);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suspects, setSuspects] = useState([{ ...blankSuspect }]);
  const [witnesses, setWitnesses] = useState([{ ...blankWitness }]);
  const [evidence, setEvidence] = useState([{ ...blankEvidence }]);

  useEffect(() => {
    if (canAssign) {
      api("/api/officers")
        .then((d) => setOfficers(d.users))
        .catch((err) => setError(err.message));
    }
    if (editing) {
      api(`/api/cases/${id}`).then((d) => {
        const c = d.case;
        setForm({
          title: c.title,
          type: c.type,
          description: c.description,
          firNo: c.firNo,
          fileNumber: c.fileNumber,
          assignedTo: c.assignedTo,
          priority: c.priority,
          location: c.location,
          incidentDate: c.incidentDate || "",
          reportedOn: c.reportedOn || "",
        });
        if (c.suspects?.length) setSuspects(c.suspects);
        if (c.witnesses?.length) setWitnesses(c.witnesses);
        if (c.evidence?.length) setEvidence(c.evidence);
      }).catch((err) => {
        setError(err.message);
        setLoadFailed(true);
      }).finally(() => setLoadingCase(false));
    }
  }, [id, editing]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const { assignedTo, ...caseFields } = form;
    const payload = {
      ...caseFields,
      ...(canAssign ? { assignedTo } : {}),
      suspects: suspects.filter((s) => s.name.trim()),
      witnesses: witnesses.filter((w) => w.name.trim()),
      evidence: evidence.filter((ev) => ev.item.trim()),
    };
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/cases/${id}`, { method: "PATCH", body: payload });
        notify("Case updated");
        navigate(`/cases/${id}`);
      } else {
        const created = await api("/api/cases", { method: "POST", body: payload });
        notify(`Case ${created.case.id} created`);
        navigate(`/cases/${created.case.id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addSuspect = () => setSuspects([...suspects, { ...blankSuspect }]);
  const removeSuspect = (i) => setSuspects(suspects.filter((_, idx) => idx !== i));
  const setSuspect = (i, field, val) => setSuspects(suspects.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  const addWitness = () => setWitnesses([...witnesses, { ...blankWitness }]);
  const removeWitness = (i) => setWitnesses(witnesses.filter((_, idx) => idx !== i));
  const setWitness = (i, field, val) => setWitnesses(witnesses.map((w, idx) => idx === i ? { ...w, [field]: val } : w));

  const addEvidence = () => setEvidence([...evidence, { ...blankEvidence }]);
  const removeEvidence = (i) => setEvidence(evidence.filter((_, idx) => idx !== i));
  const setEvidenceItem = (i, field, val) => setEvidence(evidence.map((ev, idx) => idx === i ? { ...ev, [field]: val } : ev));

  if (loadingCase) return <div className="empty">Loading case…</div>;
  if (loadFailed) return <div className="card empty" role="alert">{error}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{editing ? "Edit Case" : "Create Case"}</h1>
          <p>Case access is limited to the assigned officer, authorized supervisors, and administrators.</p>
        </div>
      </div>

      <form className="case-form" onSubmit={submit} style={{ maxWidth: 820 }}>
        {/* ── SECTION 1: Case Information ── */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>📋 Case Information</div>
          <div className="form-grid">
            <div className="field">
              <label>Case title *</label>
              <input
                className="input"
                required
                placeholder="e.g. Cyber Fraud Investigation - SBI Phishing"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="form-row">
              <div className="field">
                <label>Case type</label>
                <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {(meta.caseTypes || []).map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                {canPrioritize ? (
                  <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {["Critical", "High", "Medium", "Low"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                ) : <p className="muted">{form.priority}</p>}
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>FIR / reference number</label>
                <input className="input" placeholder="e.g. MU-2341" value={form.firNo} onChange={(e) => setForm({ ...form, firNo: e.target.value })} />
              </div>
              <div className="field">
                <label>File number</label>
                <input className="input" placeholder="e.g. 124/2025" value={form.fileNumber} onChange={(e) => setForm({ ...form, fileNumber: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Date of incident</label>
                <input className="input" type="date" value={form.incidentDate} onChange={(e) => setForm({ ...form, incidentDate: e.target.value })} />
              </div>
              <div className="field">
                <label>Date reported / registered</label>
                <input className="input" type="date" value={form.reportedOn} onChange={(e) => setForm({ ...form, reportedOn: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Assigned investigating officer{!editing && canAssign ? " *" : ""}</label>
                {canAssign ? (
                  <select
                    className="select"
                    required={!editing}
                    value={form.assignedTo}
                    onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                  >
                    <option value="">Select officer</option>
                    {officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                ) : (
                  <p className="muted">New cases are assigned to your account.</p>
                )}
              </div>
              <div className="field">
                <label>Status</label>
                <p className="muted">{editing ? "Use the case workflow actions to change status." : "New cases start as Active."}</p>
              </div>
            </div>
            <div className="field">
              <label>Location of incident</label>
              <input className="input" placeholder="e.g. Mumbai, Maharashtra" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="field">
              <label>Case description / summary</label>
              <textarea
                className="textarea"
                rows={4}
                placeholder="Describe the nature of the crime, initial findings, and investigation objectives..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Suspects ── */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="card-title" style={{ margin: 0 }}>🔍 Suspects</div>
              <button type="button" className="btn btn-ghost" onClick={addSuspect} style={{ fontSize: 13 }}>
                <Plus size={14} /> Add Suspect
              </button>
            </div>
            {suspects.map((s, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "14px 16px", marginBottom: 12, position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
                  <strong style={{ fontSize: 13, color: "var(--muted)" }}>Suspect #{i + 1}</strong>
                  {suspects.length > 1 && (
                    <button type="button" className="icon-btn" onClick={() => removeSuspect(i)} title="Remove">
                      <Trash2 size={14} color="var(--red)" />
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <div className="form-row">
                    <div className="field">
                      <label>Full name</label>
                      <input className="input" placeholder="e.g. Ramesh Kumar Patil" value={s.name} onChange={(e) => setSuspect(i, "name", e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Age</label>
                      <input className="input" type="number" placeholder="e.g. 34" value={s.age} onChange={(e) => setSuspect(i, "age", e.target.value)} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Address</label>
                    <input className="input" placeholder="e.g. 12/B, Shivaji Nagar, Pune - 411005" value={s.address} onChange={(e) => setSuspect(i, "address", e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Identification (Aadhaar / PAN / Passport)</label>
                    <input className="input" placeholder="e.g. Aadhaar: 4321 8765 0987" value={s.identification} onChange={(e) => setSuspect(i, "identification", e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Remarks / notes</label>
                    <textarea className="textarea" rows={2} placeholder="e.g. Known associate of cyber fraud network. Prior offence in 2022." value={s.notes} onChange={(e) => setSuspect(i, "notes", e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
        </div>

        {/* ── SECTION 3: Witnesses ── */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="card-title" style={{ margin: 0 }}>🧑‍⚖️ Witnesses</div>
              <button type="button" className="btn btn-ghost" onClick={addWitness} style={{ fontSize: 13 }}>
                <Plus size={14} /> Add Witness
              </button>
            </div>
            {witnesses.map((w, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
                  <strong style={{ fontSize: 13, color: "var(--muted)" }}>Witness #{i + 1}</strong>
                  {witnesses.length > 1 && (
                    <button type="button" className="icon-btn" onClick={() => removeWitness(i)} title="Remove">
                      <Trash2 size={14} color="var(--red)" />
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <div className="form-row">
                    <div className="field">
                      <label>Witness name</label>
                      <input className="input" placeholder="e.g. Sunita Rao" value={w.name} onChange={(e) => setWitness(i, "name", e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Contact number</label>
                      <input className="input" placeholder="e.g. 9876543210" value={w.contact} onChange={(e) => setWitness(i, "contact", e.target.value)} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Statement summary</label>
                    <textarea className="textarea" rows={2} placeholder="e.g. Witnessed the accused accessing the victim's account from a cafe on 12-Apr-2025 at 3 PM." value={w.statement} onChange={(e) => setWitness(i, "statement", e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
        </div>

        {/* ── SECTION 4: Evidence ── */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="card-title" style={{ margin: 0 }}>🗂️ Physical / Digital Evidence</div>
              <button type="button" className="btn btn-ghost" onClick={addEvidence} style={{ fontSize: 13 }}>
                <Plus size={14} /> Add Evidence
              </button>
            </div>
            {evidence.map((ev, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
                  <strong style={{ fontSize: 13, color: "var(--muted)" }}>Evidence Item #{i + 1}</strong>
                  {evidence.length > 1 && (
                    <button type="button" className="icon-btn" onClick={() => removeEvidence(i)} title="Remove">
                      <Trash2 size={14} color="var(--red)" />
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <div className="form-row">
                    <div className="field">
                      <label>Item name / description</label>
                      <input className="input" placeholder="e.g. Suspect's mobile phone (Samsung Galaxy S22)" value={ev.item} onChange={(e) => setEvidenceItem(i, "item", e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Date collected</label>
                      <input className="input" type="date" value={ev.collectedDate} onChange={(e) => setEvidenceItem(i, "collectedDate", e.target.value)} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Details / forensic notes</label>
                    <textarea className="textarea" rows={2} placeholder="e.g. Device seized from suspect's residence. Contains WhatsApp conversations and banking apps with victim's account credentials." value={ev.description} onChange={(e) => setEvidenceItem(i, "description", e.target.value)} />
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label>Collected by (officer)</label>
                      <input className="input" placeholder="e.g. SI Chaitrali Lokde" value={ev.collectedBy} onChange={(e) => setEvidenceItem(i, "collectedBy", e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Stored at (location / locker ID)</label>
                      <input className="input" placeholder="e.g. Evidence Room B, Locker #07" value={ev.storedAt} onChange={(e) => setEvidenceItem(i, "storedAt", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        <div className="actions-row">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create Case"}
          </button>
        </div>
      </form>
    </div>
  );
}
