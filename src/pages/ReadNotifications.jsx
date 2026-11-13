import { ArrowLeft, Bell, CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function ReadNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api("/api/notifications")
      .then((data) => {
        setNotifications(
          (data.notifications || []).filter((n) => n.read)
        );
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Read Notifications</h1>
          <p>View your previously read notifications and activity updates.</p>
        </div>

        <button
          className="btn btn-ghost"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="card">
        <div className="card-pad">
          <h3>
            <CheckCheck size={18} style={{ verticalAlign: "middle" }} />{" "}
            Notification History ({notifications.length})
          </h3>
        </div>

        {loading ? (
          <div className="card-pad">Loading notifications...</div>
        ) : error ? (
          <div className="card-pad form-error">{error}</div>
        ) : notifications.length ? (
          notifications.map((n) => (
            <div
              key={n.id}
              className="note-item read"
              style={{ padding: "18px", cursor: n.caseId ? "pointer" : "default" }}
              onClick={() => {
                if (n.caseId) navigate(`/cases/${n.caseId}`);
              }}
            >
              <div className="note-title">
                <strong>{n.title}</strong>
                <CheckCheck size={16} />
              </div>

              <p>{n.body}</p>

              <small>
                {n.createdAt
                  ? new Date(n.createdAt).toLocaleString()
                  : ""}
              </small>
            </div>
          ))
        ) : (
          <div className="card-pad empty">
            <Bell size={28} />
            <p>No read notifications yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}