import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { api } from "../api";

export default function Feedbacks() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/feedback")
      .then((result) => setFeedbacks(result.feedback || []))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Feedbacks" subtitle="Suggestions and issue reports submitted by SecureVault users." />
      {error ? <div className="form-error card card-pad" role="alert">{error}</div> : null}
      {loading ? <div className="empty">Loading feedback…</div> : null}
      {!loading && !feedbacks.length && !error ? (
        <div className="card empty">No feedback has been submitted yet.</div>
      ) : null}
      <div className="feedback-list">
        {feedbacks.map((item) => (
          <article className="card card-pad feedback-card" key={item.id}>
            <div className="feedback-card-head">
              <div>
                <h2>{item.subject}</h2>
                <p className="muted">{item.senderName} · {item.role} · {item.category}</p>
              </div>
              <span className={`badge ${item.status === "Reviewed" ? "badge-green" : "badge-blue"}`}>
                {item.status || "New"}
              </span>
            </div>
            <p className="feedback-description">{item.description}</p>
            <time className="muted" dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString()}</time>
          </article>
        ))}
      </div>
    </div>
  );
}
