import { getToken } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export async function downloadAuthorized(url, filename) {
  const requestUrl = /^https?:\/\//i.test(url)
    ? url
    : `${API_BASE_URL}${url}`;

  const headers = {};
  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(requestUrl, { headers });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Download not permitted");
  }

  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = href;
  a.download = filename || "download";
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
