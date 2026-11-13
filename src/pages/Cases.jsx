import { Eye, LockKeyhole, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import FilterBar from "../components/FilterBar";
import PageHeader from "../components/PageHeader";
import { useApp } from "../context/AppContext";
import { hasPermission } from "../lib/roleAccess";

const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export default function Cases({ title, initialStatus = "" }) {
  const { meta, user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [q, setQ] = useState("");
  const query = new URLSearchParams(location.search);
  const queryStatus = initialStatus || query.get("status") || "";
  const queryOfficer = query.get("officer") || "";
  const view = query.get("view");
  const pageTitle = title || (view === "monitoring" ? "Case Monitoring" : view === "review" ? "Review Cases" : view === "pending" ? "Pending Approvals" : "Cases");
  const [status, setStatus] = useState(queryStatus);
  const [type, setType] = useState("");
  const [officer, setOfficer] = useState(queryOfficer);
  const [priorityFilter, setPriorityFilter] = useState("");
  const [prioritySort, setPrioritySort] = useState("highest");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  const load = async (filters = {}) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const selectedStatus = filters.status === undefined ? status : filters.status;
    const selectedOfficer = filters.officer === undefined ? officer : filters.officer;
    if (selectedStatus) params.set("status", selectedStatus);
    if (type) params.set("type", type);
    if (selectedOfficer) params.set("officer", selectedOfficer);
    try {
      const d = await api(`/api/cases?${params.toString()}`);
      const approvalQueue = title === "Pending Approvals" || title === "Review Cases";
      setRows(approvalQueue
        ? d.cases.filter((item) => item.operationalPause?.state !== "Paused")
        : d.cases);
      setPage(1);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    setStatus(queryStatus);
    setOfficer(queryOfficer);
    load({ status: queryStatus, officer: queryOfficer });
    if (hasPermission(user, "cases.create") || hasPermission(user, "cases.edit")) {
      api("/api/officers").then((d) => setOfficers(d.users)).catch((err) => setError(err.message));
    }
  }, [location.search, initialStatus]);

  const pageSize = 6;
  const priorityRows = rows
    .filter((item) => !priorityFilter || item.priority === priorityFilter)
    .slice()
    .sort((a, b) => {
      if (prioritySort === "none") return 0;
      const direction = prioritySort === "lowest" ? -1 : 1;
      const priorityDifference = ((PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4)) * direction;
      return priorityDifference || new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime();
    });
  const pages = Math.max(1, Math.ceil(priorityRows.length / pageSize));
  const slice = priorityRows.slice((page - 1) * pageSize, page * pageSize);
  const activeCases = rows.filter((item) => item.status === "Active").length;
  const pendingCases = rows.filter((item) => item.status === "Pending Review" || item.status === "Pending Closure" || (item.status === "On Hold" && item.operationalPause?.state !== "Paused")).length;

  return (
    <div className="cases-page">
      <PageHeader
        title={pageTitle}
        subtitle={user.role === "Supervisor"
          ? "Monitor cases assigned to active Investigating Officers and review submitted or on-hold cases."
          : "Your assigned investigations, organized in one secure workspace."}
        actions={
          hasPermission(user, "cases.create") ? (
            <button className="btn btn-primary" onClick={() => navigate("/cases/new")}>
              <Plus size={16} /> Create Case
            </button>
          ) : null
        }
      />
      <section className="case-access-panel" aria-label="Case privacy information">
        <div className="case-access-icon"><LockKeyhole size={20} /></div>
        <div className="case-access-copy">
          <strong>Private case workspace</strong>
          <span>
            {user.role === "Supervisor"
              ? "Cases assigned to active Investigating Officers, plus your own assigned cases, are shown here."
              : "Only cases assigned to your account and their linked documents are shown here."}
          </span>
        </div>
        <div className="case-access-status">
          <ShieldCheck size={16} />
          <span>Access protected</span>
        </div>
      </section>
      <section className="case-summary-grid" aria-label="Assigned case summary">
        <div className="case-summary-card">
          <span className="case-summary-label">Cases in view</span>
          <strong>{rows.length}</strong>
          <span className="case-summary-note">Matching your current filters</span>
        </div>
        <div className="case-summary-card">
          <span className="case-summary-label">Active investigations</span>
          <strong>{activeCases}</strong>
          <span className="case-summary-note">{user.role === "Supervisor" ? "Officer team and your own assigned cases" : "Assigned to your account"}</span>
        </div>
        <div className="case-summary-card">
          <span className="case-summary-label">Pending review</span>
          <strong>{pendingCases}</strong>
          <span className="case-summary-note">On Hold or Pending Review</span>
        </div>
      </section>
      <div className="card">
        {error ? <p className="form-error card-pad" role="alert">{error}</p> : null}
        <FilterBar search={q} onSearch={setQ} onSubmit={load} placeholder="Search cases by ID or title">
          <select className="select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {status === "On Hold,Pending Review,Pending Closure" ? <option value={status}>Awaiting supervisor action</option> : null}
            {["Active", "Pending Review", "Pending Closure", "On Hold", "Needs Revision", "Completed", "Closed"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="select" style={{ width: 180 }} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All Types</option>
            {(meta.caseTypes || []).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="select" style={{ width: 170 }} value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}>
            <option value="">All Priorities</option>
            {["Critical", "High", "Medium", "Low"].map((level) => <option key={level}>{level}</option>)}
          </select>
          <select className="select" style={{ width: 190 }} value={prioritySort} onChange={(e) => { setPrioritySort(e.target.value); setPage(1); }}>
            <option value="highest">Highest Priority First</option>
            <option value="lowest">Lowest Priority First</option>
            <option value="none">Unsorted</option>
          </select>
            <select
              className="select"
              style={{ width: 200 }}
              value={officer}
              onChange={(e) => setOfficer(e.target.value)}
            >
              <option value="">All Officers</option>
              {officers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
        </FilterBar>
        <DataTable
          rows={slice}
          emptyTitle="No cases found"
          emptyText="Adjust filters or create a new case."
          onRowClick={(c) => navigate(`/cases/${c.id}`)}
          columns={[
            { key: "id", label: "Case ID", render: (c) => <span className="linkish">{c.id}</span> },
            { key: "title", label: "Title" },
            { key: "type", label: "Type" },
            { key: "priority", label: "Priority", render: (c) => <Badge status={c.priority} /> },
            { key: "status", label: "Status", render: (c) => <Badge status={c.status} /> },
            { key: "assignedName", label: "Assigned To" },
            { key: "createdOnLabel", label: "Created On" },
            {
              key: "actions",
              label: "Actions",
              stopRowClick: true,
              render: (c) => (
                <>
                  <button className="icon-btn" title="View" onClick={() => navigate(`/cases/${c.id}`)}>
                    <Eye size={16} />
                  </button>
                  {hasPermission(user, "cases.edit") ? (
                    <button className="icon-btn" title="Edit" onClick={() => navigate(`/cases/${c.id}/edit`)}>
                      <Pencil size={16} />
                    </button>
                  ) : null}
                </>
              ),
            },
          ]}
          footer={Array.from({ length: pages }, (_, i) => (
            <button key={i} className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>
              {i + 1}
            </button>
          ))}
        />
      </div>
    </div>
  );
}
