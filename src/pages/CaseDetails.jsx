import { Check, FileText, Pencil, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Badge from "../components/Badge";
import { AudioEvidenceRecorder, CameraEvidenceCapture } from "../components/MediaEvidenceTools";
import { useApp } from "../context/AppContext";
import { hasPermission } from "../lib/roleAccess";

const groups = [
  "FIR",
  "Witness Statement",
  "Investigation Report",
  "Forensic Report",
  "Digital Evidence",
  "Charge Sheet",
  "Court Document",
];

function InfoGrid({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginTop: 8 }}>
      {children}
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>{label}</div>
      <b style={{ fontSize: 14 }}>{value || "—"}</b>
    </div>
  );
}

export default function CaseDetails() {
  const { id } = useParams();
  const { user, notify } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Overview");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [officers, setOfficers] = useState([]);
  const [reviewers, setReviewers] = useState([]);
  const [assignedReviewers, setAssignedReviewers] = useState([]);
  const [selectedReviewer, setSelectedReviewer] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("Pending Review");
  const [submissionNote, setSubmissionNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [closureNote, setClosureNote] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [busy, setBusy] = useState(false);
  const canReview = ["Supervisor", "Admin"].includes(user.role);
  const canAssign = canReview;
  const canPrioritize = ["Investigating Officer", "Supervisor", "Admin"].includes(user.role);

  useEffect(() => {
    api(`/api/cases/${id}`)
      .then((result) => {
        setData(result);
        setAssignedTo(result.case.assignedTo);
        setPriority(result.case.priority || "Medium");
      })
      .catch((e) => setError(e.message));
    if (canAssign) {
  api("/api/officers")
    .then((result) => setOfficers(result.users))
    .catch((e) => setError(e.message));

  api("/api/reviewers")
    .then((result) => setReviewers(result.users || []))
    .catch((e) => setError(e.message));

  api(`/api/cases/${id}/reviewers`)
    .then((result) => setAssignedReviewers(result.reviewers || []))
    .catch((e) => setError(e.message));
}
  }, [id, canAssign]);

  const refreshCase = async () => {
    const result = await api(`/api/cases/${id}`);
    setData(result);
    setAssignedTo(result.case.assignedTo);
    setPriority(result.case.priority || "Medium");
  };

  const loadReviewerAssignments = async () => {
  const result = await api(`/api/cases/${id}/reviewers`);
  setAssignedReviewers(result.reviewers || []);
};

  const submitWorkflow = async (endpoint, body, successMessage) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/cases/${id}/${endpoint}`, { method: "POST", body });
      await refreshCase();

      window.dispatchEvent(
        new Event("securevault:notifications-refresh")
      );
      setReviewNote("");
      setSubmissionNote("");
      notify(successMessage);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveAssignment = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/cases/${id}/assignment`, { method: "PATCH", body: { assignedTo } });
      await refreshCase();
      notify("Case assignment updated");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const assignReviewer = async () => {
  if (!selectedReviewer) {
    setError("Please select a Reviewer");
    return;
  }

  setBusy(true);
  setError("");

  try {
    await api(`/api/cases/${id}/reviewers`, {
      method: "POST",
      body: { reviewerId: selectedReviewer },
    });

    await loadReviewerAssignments();
    setSelectedReviewer("");
    notify("Reviewer assigned successfully");
  } catch (e) {
    setError(e.message);
  } finally {
    setBusy(false);
  }
};

const removeReviewer = async (reviewerId) => {
  if (!window.confirm("Remove this Reviewer from the case?")) return;

  setBusy(true);
  setError("");

  try {
    await api(`/api/cases/${id}/reviewers/${reviewerId}`, {
      method: "DELETE",
    });

    await loadReviewerAssignments();
    notify("Reviewer removed successfully");
  } catch (e) {
    setError(e.message);
  } finally {
    setBusy(false);
  }
};

  const savePriority = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/cases/${id}/priority`, { method: "PATCH", body: { priority } });
      await refreshCase();
      notify("Case priority updated");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const updateOperationalStatus = async (action) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/cases/${id}/operational-status`, {
        method: "POST",
        body: action === "pause" ? { action, reason: pauseReason } : { action },
      });
      await refreshCase();
      window.dispatchEvent(
        new Event("securevault:notifications-refresh")
      );
      setPauseReason("");
      notify(action === "pause" ? "Case paused" : "Case resumed");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const requestClosure = async () => {
    const submitted = await submitWorkflow("request-closure", { note: closureNote }, "Case sent to supervisor for closure sign-off");
    if (submitted) setClosureNote("");
  };

  const discardEvidence = async (document) => {
    const confirmed = window.confirm("Are you sure you want to delete this recorded statement? This action cannot be undone.");
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/documents/${document.id}`, { method: "DELETE" });
      await refreshCase();
      notify("Draft evidence discarded");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <div className="card empty">{error}</div>;
  if (!data) return <div className="empty">Loading case…</div>;
  const item = data.case;
  const docs = data.documents;
  const isLocked = ["Completed", "Closed"].includes(item.status);
  const canUploadDocuments = hasPermission(user, "docs.upload") && !isLocked;
  const canReopen = canReview && item.status === "Closed";

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumb" style={{ marginBottom: 8 }}>
            <Link to="/cases">Cases</Link> / <strong>{item.id}</strong>
          </div>
          <h1>{item.id} - {item.title}</h1>
          <div className="meta-row">
            <span>Type <b>{item.type}</b></span>
            <span>Created On <b>{item.createdOnLabel}</b></span>
            <span>Assigned To <b>{item.assignedName}</b></span>
            <span>Documents <b>{item.documentCount}</b></span>
            <span>Priority <Badge status={item.priority} /></span>
          </div>
        </div>
        <div className="toolbar">
          <Badge status={item.status} />
                    {canReopen ? (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Reopen this closed case?")) {
                  submitWorkflow("reopen", {}, "Case reopened successfully");
                }
              }}
            >
              <RotateCcw size={16} /> Reopen Case
            </button>
          ) : null}
          {hasPermission(user, "cases.edit") && !isLocked ? (
            <button className="btn btn-ghost" onClick={() => navigate(`/cases/${item.id}/edit`)}>
              <Pencil size={16} /> Edit
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="form-error card card-pad" role="alert" style={{ marginBottom: 16 }}>{error}</div> : null}
      {canUploadDocuments ? (
        <section className="card card-pad case-media-capture" aria-label="Capture case evidence">
          <div className="card-title">Capture Evidence</div>
          <p className="muted">Photos and recordings are stored as new evidence documents with baseline SHA-256 hashes and custody records.</p>
          <div className="case-media-tools">
            <div className="card card-pad">
              <div className="card-title">Camera Evidence Photo / Scan</div>
              <CameraEvidenceCapture caseId={item.id} onSaved={() => refreshCase().catch((e) => setError(e.message))} />
            </div>
            <AudioEvidenceRecorder caseId={item.id} onSaved={() => refreshCase().catch((e) => setError(e.message))} />
          </div>
        </section>
      ) : null}
      {canPrioritize && (user.role !== "Investigating Officer" || item.assignedTo === user.id) ? (
        <section className="card card-pad" style={{ marginBottom: 16 }} aria-label="Case priority">
          <div className="card-title">Operational Priority</div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="case-priority">Priority</label>
              <select id="case-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {["Critical", "High", "Medium", "Low"].map((level) => <option key={level}>{level}</option>)}
              </select>
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <button className="btn btn-primary" disabled={busy || priority === (item.priority || "Medium")} onClick={savePriority}>
                Update Priority
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {user.role === "Investigating Officer" && item.assignedTo === user.id && item.status === "Active" ? (
        <section className="card card-pad" style={{ marginBottom: 16 }} aria-label="Operational case status">
          <div className="card-title">Operational Status</div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="pause-reason">Pause reason</label>
              <input
                id="pause-reason"
                className="input"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="e.g. Deprioritized for urgent case"
                maxLength={2000}
              />
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <button className="btn btn-ghost" disabled={busy || !pauseReason.trim()} onClick={() => updateOperationalStatus("pause")}>
                Pause Case / Set On Hold
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {item.status === "On Hold" && item.operationalPause?.state === "Paused" ? (
          <section className="card card-pad" style={{ marginBottom: 16 }} aria-label="Resume paused case">
            <div className="card-title">Case Paused</div>
            <p className="muted">Reason: {item.operationalPause.reason} · {item.assignedName}</p>
            {user.role === "Investigating Officer" && item.assignedTo === user.id ? (
              <button className="btn btn-primary" disabled={busy} onClick={() => updateOperationalStatus("resume")}>
                Resume Case / Set Active
              </button>
            ) : null}
          </section>
        ) : null}
      {user.role === "Investigating Officer" && item.assignedTo === user.id && item.status === "Active" ? (
        <section className="card card-pad" style={{ marginBottom: 16 }} aria-label="Request case closure">
          <div className="card-title">Case Resolution</div>
          <p className="muted">Submit this resolved case to your Supervisor for final closure sign-off.</p>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="closure-note">Closure summary (optional)</label>
            <textarea id="closure-note" className="input" rows={3} value={closureNote} onChange={(e) => setClosureNote(e.target.value)} maxLength={2000} />
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={requestClosure}>
            Mark Case Solved / Request Closure
          </button>
        </section>
      ) : null}
      
      {user.role === "Admin" ? (
  <section
    className="card card-pad"
    style={{ marginBottom: 16 }}
    aria-label="Reviewer assignment"
  >
    <div className="card-title">Reviewer Management</div>

    <p className="muted">
      Assign Reviewers to access and review this case.
    </p>

    <div className="form-row">
      <div className="field">
        <label htmlFor="case-reviewer">Select Reviewer</label>

        <select
          id="case-reviewer"
          className="select"
          value={selectedReviewer}
          onChange={(e) => setSelectedReviewer(e.target.value)}
        >
          <option value="">Select Reviewer</option>

          {reviewers
            .filter(
              (r) =>
                r.status === "Active" &&
                !assignedReviewers.some(
                  (a) => a.reviewerId === r.id
                )
            )
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.email})
              </option>
            ))}
        </select>
      </div>

      <div className="field" style={{ alignSelf: "end" }}>
        <button
          className="btn btn-primary"
          disabled={busy || !selectedReviewer}
          onClick={assignReviewer}
        >
          Assign Reviewer
        </button>
      </div>
    </div>

    <h4 style={{ marginTop: 20, marginBottom: 12 }}>
      Assigned Reviewers
    </h4>

    {assignedReviewers.length === 0 ? (
      <p className="muted">No Reviewers assigned yet.</p>
    ) : (
      assignedReviewers.map((assignment) => (
        <div
          key={assignment.id}
          className="actions-row"
          style={{
            justifyContent: "space-between",
            padding: "10px 0",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <strong>{assignment.user.name}</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              {assignment.user.email}
            </div>
          </div>

          <button
            className="btn btn-ghost"
            style={{ color: "#dc2626" }}
            disabled={busy}
            onClick={() =>
              removeReviewer(assignment.reviewerId)
            }
          >
            <Trash2 size={16} /> Remove
          </button>
        </div>
      ))
    )}
  </section>
) : null}

      {canAssign ? (
        <section className="card card-pad" style={{ marginBottom: 16 }} aria-label="Case assignment">
          <div className="card-title">Case Assignment</div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="case-assignee">Investigating Officer</label>
              <select id="case-assignee" className="select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Select officer</option>
                {item.assignedTo && !officers.some((officer) => officer.id === item.assignedTo) ? (
                  <option value={item.assignedTo}>{item.assignedName} (inactive)</option>
                ) : null}
                {officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <button className="btn btn-primary" disabled={busy || !assignedTo || assignedTo === item.assignedTo} onClick={saveAssignment}>
                Save Assignment
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {user.role === "Investigating Officer" && item.assignedTo === user.id && ["Active", "Needs Revision"].includes(item.status) ? (
        <section className="card card-pad" style={{ marginBottom: 16 }} aria-label="Submit case for review">
          <div className="card-title">Request Supervisor Action</div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="submission-status">Request type</label>
              <select id="submission-status" className="select" value={submissionStatus} onChange={(e) => setSubmissionStatus(e.target.value)}>
                <option value="Pending Review">Submit for Review</option>
                <option value="On Hold">Place On Hold</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="submission-note">Note for supervisor</label>
              <input id="submission-note" className="input" value={submissionNote} onChange={(e) => setSubmissionNote(e.target.value)} maxLength={2000} />
            </div>
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={() => submitWorkflow("submit-review", { status: submissionStatus, note: submissionNote }, "Case submitted to supervisor")}>
            Submit Request
          </button>
        </section>
      ) : null}

      {canReview && (item.status === "Pending Review" || item.status === "Pending Closure" || (item.status === "On Hold" && item.operationalPause?.state !== "Paused")) ? (
        <section className="card card-pad" style={{ marginBottom: 16 }} aria-label="Supervisor case review">
          <div className="card-title">{item.status === "Pending Closure" ? "Final Closure Sign-off" : "Supervisor Review"}</div>
          {item.submissionNote ? <p className="muted">Officer note: {item.submissionNote}</p> : null}
          {item.closureRequest?.note ? <p className="muted">Closure summary: {item.closureRequest.note}</p> : null}
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="review-note">Reason or correction feedback</label>
            <textarea id="review-note" className="input" rows={3} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} maxLength={2000} />
          </div>
          <div className="toolbar">
            <button className="btn btn-primary" disabled={busy} onClick={() => submitWorkflow("approve", {}, "Case approved")}>
              <Check size={16} /> Approve Case
            </button>
            <button className="btn btn-ghost" disabled={busy || !reviewNote.trim()} onClick={() => submitWorkflow("reject", { reason: reviewNote }, "Case rejected")}>
              <X size={16} /> Reject Case
            </button>
            <button className="btn btn-ghost" disabled={busy || !reviewNote.trim()} onClick={() => submitWorkflow("return", { feedback: reviewNote }, "Case returned for correction")}>
              <RotateCcw size={16} /> Request Correction
            </button>
          </div>
        </section>
      ) : null}

      <div className="tabs">
        {["Overview", "Suspects & Witnesses", "Evidence", "Documents", "Activity Log", "Chain of Custody"].map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "Overview" ? (
        <div className="grid-2">
          <div className="card card-pad">
            <div className="card-title">Case Information</div>

            {/* Timeline strip */}
            <div style={{ background: "var(--blue-50)", border: "1px solid var(--blue-100)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--blue)", marginBottom: 8 }}>📅 Date Timeline</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>Incident Date</div>
                  <b style={{ fontSize: 13 }}>{item.incidentDateLabel || "—"}</b>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>Date Reported</div>
                  <b style={{ fontSize: 13 }}>{item.reportedOnLabel || "—"}</b>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>Case Opened</div>
                  <b style={{ fontSize: 13 }}>{item.createdOnLabel || "—"}</b>
                </div>
              </div>
            </div>

            <p style={{ marginBottom: 16, whiteSpace: "pre-wrap", lineHeight: 1.7, color: "var(--ink)" }}>
              {item.description || "No case description has been provided."}
            </p>

            <InfoGrid>
              <InfoCell label="Location" value={item.location} />
              <InfoCell label="FIR No" value={item.firNo} />
              <InfoCell label="File Number" value={item.fileNumber} />
              <InfoCell label="Created by" value={item.createdByName} />
              <InfoCell label="Assigned Officer" value={item.assignedName} />
              <InfoCell label="Status" value={item.status} />
            </InfoGrid>
            {(item.reviewHistory || []).length ? (
              <div style={{ marginTop: 20 }}>
                <div className="card-title">Review History</div>
                {[...item.reviewHistory].reverse().map((review, index) => (
                  <div key={`${review.timestamp}-${index}`} className="doc-item">
                    <div>
                      <strong>{review.action}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Signature: {review.signature} · {new Date(review.timestamp).toLocaleString()}
                      </div>
                      {review.reason || review.feedback ? <div>{review.reason || review.feedback}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="card card-pad">
            <div className="card-title">Documents Overview</div>
            <div className="doc-list">
              {groups.map((g) => (
                <div className="doc-item" key={g}>
                  <div className="doc-left">
                    <FileText size={16} color="#2563eb" />
                    {g}
                  </div>
                  <span className="count">{docs.filter((d) => d.type === g).length}</span>
                </div>
              ))}
            </div>
            {hasPermission(user, "docs.upload") ? <button
              className="btn btn-primary"
              style={{ marginTop: 16, width: "100%" }}
              onClick={() => navigate(`/documents/upload?caseId=${item.id}`)}
            >
              <Upload size={16} /> Upload Document
            </button> : null}
          </div>
        </div>
      ) : null}

      {/* ── SUSPECTS & WITNESSES TAB ── */}
      {tab === "Suspects & Witnesses" ? (
        <div className="grid-2">
          {/* Suspects */}
          <div className="card card-pad">
            <div className="card-title">🔍 Suspects ({(item.suspects || []).length})</div>
            {(item.suspects || []).length === 0 ? (
              <p className="muted">No suspects recorded for this case.</p>
            ) : (
              (item.suspects || []).map((s, i) => (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{s.name || `Suspect #${i + 1}`}</div>
                  <InfoGrid>
                    <InfoCell label="Age" value={s.age} />
                    <InfoCell label="Identification" value={s.identification} />
                    <InfoCell label="Address" value={s.address} />
                  </InfoGrid>
                  {s.notes && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                      <em>{s.notes}</em>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {/* Witnesses */}
          <div className="card card-pad">
            <div className="card-title">🧑‍⚖️ Witnesses ({(item.witnesses || []).length})</div>
            {(item.witnesses || []).length === 0 ? (
              <p className="muted">No witnesses recorded for this case.</p>
            ) : (
              (item.witnesses || []).map((w, i) => (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{w.name || `Witness #${i + 1}`}</div>
                  <InfoGrid>
                    <InfoCell label="Contact" value={w.contact} />
                  </InfoGrid>
                  {w.statement && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "var(--ink)", borderTop: "1px solid var(--line)", paddingTop: 8, lineHeight: 1.6 }}>
                      {w.statement}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* ── EVIDENCE TAB ── */}
      {tab === "Evidence" ? (
        <div className="card">
          <div className="card-pad">
            <div className="card-title">🗂️ Physical / Digital Evidence ({(item.evidence || []).length} items)</div>
          </div>
          {(item.evidence || []).length === 0 ? (
            <p className="muted" style={{ padding: "0 20px 20px" }}>No evidence items recorded for this case.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item</th>
                    <th>Collected Date</th>
                    <th>Collected By</th>
                    <th>Stored At</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(item.evidence || []).map((ev, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td><strong>{ev.item}</strong></td>
                      <td>{ev.collectedDate || "—"}</td>
                      <td>{ev.collectedBy || "—"}</td>
                      <td>{ev.storedAt || "—"}</td>
                      <td style={{ color: "var(--muted)", fontSize: 12 }}>{ev.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* ── DOCUMENTS TAB ── */}
      {tab === "Documents" ? (
        <div className="card">
          <div className="card-pad" style={{ display: "flex", justifyContent: "flex-end" }}>
            {canUploadDocuments ? (
              <button className="btn btn-primary" onClick={() => navigate(`/documents/upload?caseId=${item.id}`)}>
                <Upload size={16} /> Upload Document
              </button>
            ) : null}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Type</th>
                  <th>Uploaded By</th>
                  <th>Uploaded On</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/documents/${d.id}`)}>
                    <td className="linkish">{d.name}{d.isDerivative ? <span className="derivative-tag">Derivative</span> : null}</td>
                    <td>{d.type}</td>
                    <td>{d.uploadedByName}</td>
                    <td>{d.uploadedOnLabel}</td>
                    <td>
                      {["Investigating Officer", "Admin"].includes(user.role) &&
                      (user.role === "Admin" || item.assignedTo === user.id) &&
                      item.status === "Active" &&
                      (["camera", "audio", "transcript"].includes(d.captureSource) || d.isDerivative || d.type === "Digital Evidence") ? (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation();
                            discardEvidence(d);
                          }}
                        >
                          <Trash2 size={15} /> Delete / Discard Draft
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!docs.length ? <tr><td colSpan="5">No documents or evidence have been added to this case.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── ACTIVITY LOG TAB ── */}
      {tab === "Activity Log" ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Document</th>
                  <th>Details</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.activity.map((a) => (
                  <tr key={a.id}>
                    <td>{a.timestampLabel}</td>
                    <td>{a.user}</td>
                    <td><Badge status={a.action} /></td>
                    <td>{a.document}</td>
                    <td>{a.note || "—"}</td>
                    <td><Badge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {tab === "Chain of Custody" ? (
        <div className="card">
          <div className="card-pad">
            <div className="card-title">Chain of Custody Timeline</div>
            <p className="muted">Append-only records of document upload, access, download, verification, custody transfer, and version updates.</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Handler</th>
                  <th>Role</th>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>IP Address</th>
                  <th>Cryptographic Hash</th>
                </tr>
              </thead>
              <tbody>
                {(data.custodyEvents || []).map((event) => (
                  <tr key={event.id}>
                    <td>{event.handlerName}</td>
                    <td>{event.role}</td>
                    <td>{new Date(event.timestamp).toLocaleString()}</td>
                    <td title={event.note || ""}>{event.action}{event.note ? ` · ${event.note}` : ""}</td>
                    <td>{event.ipAddress}</td>
                    <td><code className="hash">{event.sha256 || "—"}</code></td>
                  </tr>
                ))}
                {!(data.custodyEvents || []).length ? (
                  <tr><td colSpan="6">No chain-of-custody events have been recorded for these documents yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
