const TOKEN_KEY = “sc-token”;

const API_BASE_URL = (
import.meta.env.VITE_API_BASE_URL || “”
).replace(//+$/, “”);

export function getToken() {
return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
if (token) localStorage.setItem(TOKEN_KEY, token);
else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = “GET”, body, form } = {}) {
const headers = {};
const token = getToken();

if (token) headers.Authorization = Bearer ${token};

let payload;

if (form) {
payload = form;
} else if (body !== undefined) {
headers[“Content-Type”] = “application/json”;
payload = JSON.stringify(body);
}

const url = ${API_BASE_URL}${path};

const res = await fetch(url, {
method,
headers,
body: payload,
});

const data = await res.json().catch(() => ({}));

if (res.status === 401) {
setToken(null);

if (!path.includes("/auth/login")) {
  window.location.assign("/login");
}

}

if (!res.ok) {
const error = new Error(data.error || “Request failed”);
error.code = data.code;
throw error;
}

return data;
}
