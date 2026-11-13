import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import PageHeader from "../components/PageHeader";

export default function SupervisorTeam() {
  const [officers, setOfficers] = useState([]);
  const [cases, setCases] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api("/api/officers"), api("/api/cases")])
      .then(([officerData, caseData]) => {
        setOfficers(officerData.users.filter((user) => user.role === "Investigating Officer"));
        setCases(caseData.cases);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Team / Officers"
        subtitle="Active Investigating Officers and their assigned-case workload."
      />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="card">
        {loading ? (
          <div className="card-pad muted">Loading officer workload…</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Officer</th>
                  <th>Assigned Cases</th>
                  <th>Active</th>
                  <th>Pending Review / Closure</th>
                  <th>Cases</th>
                </tr>
              </thead>
              <tbody>
                {officers.map((officer) => {
                  const assigned = cases.filter((item) => item.assignedTo === officer.id);
                  return (
                    <tr key={officer.id}>
                      <td><strong>{officer.name}</strong></td>
                      <td>{assigned.length}</td>
                      <td>{assigned.filter((item) => item.status === "Active").length}</td>
                      <td>{assigned.filter((item) => item.status === "Pending Review" || item.status === "Pending Closure" || (item.status === "On Hold" && item.operationalPause?.state !== "Paused")).length}</td>
                      <td>
                        <Link to={`/cases?officer=${encodeURIComponent(officer.id)}&view=monitoring`}>
                          View cases
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!officers.length ? (
                  <tr><td colSpan="5">No active Investigating Officers found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
