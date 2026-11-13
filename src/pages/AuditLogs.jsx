import { Download, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import Badge from "../components/Badge";
import { useApp } from "../context/AppContext";

export default function AuditLogs() {
  const { notify } = useApp();
  const [rows, setRows] = useState([]);
  const [limited, setLimited] = useState(false);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    if (from && to && from > to) {
      setError("The start date must be on or before the end date.");
      return;
    }
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (action) params.set("action", action);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    try {
      const d = await api(`/api/audit?${params}`);
      setRows(d.audits);
      setLimited(d.limited);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const exportCsv = () => {
    const header = "Timestamp,User,Action,Case,Document,IP,Status\n";
    const body = rows
      .map((a) =>
        [a.timestampLabel, a.user, a.action, a.caseId, a.document, a.ip, a.status]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "securecase-audit.csv";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Audit export downloaded");
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Audit Logs</h1>
          <p>
            Protected trail of login, upload, view, download, update and integrity events.
            {limited ? " This view includes your activity and activity on cases assigned to your account." : ""}
          </p>
        </div>
        <button className="btn btn-primary" onClick={exportCsv}>
          <Download size={16} /> Export
        </button>
      </div>
      <div className="card">
        {error ? <p className="form-error card-pad" role="alert">{error}</p> : null}
        <div className="card-pad filters">
          <div className="search">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search users, cases or documents"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="select" style={{ width: 180 }} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All Actions</option>
            {[
              "Login",
              "Logout",
              "Upload",
              "Update",
              "View",
              "Download",
              "Create Case",
              "Integrity Check",
              "Generate Report",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160 }} />
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 160 }} />
          <button className="btn btn-ghost" onClick={load}>
            Apply
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Case ID</th>
                <th>Document</th>
                <th>IP Address</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.timestampLabel}</td>
                  <td>{a.user}</td>
                  <td>
                    <Badge status={a.action} />
                  </td>
                  <td>{a.caseId}</td>
                  <td>{a.document}</td>
                  <td>{a.ip}</td>
                  <td>
                    <Badge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
