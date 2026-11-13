import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "../api";
import LoginTransition from "../components/LoginTransition";

const AppContext = createContext(null);
const THEME_KEY = "securevault-theme";
const USER_KEY = "securevault-user";

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [entranceTransition, setEntranceTransition] = useState(false);
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [bootstrapping, setBootstrapping] = useState(!!getToken());
  const [toast, setToast] = useState("");
  const [meta, setMeta] = useState({
    roles: [],
    permissions: [],
    roleMatrix: {},
    caseTypes: [],
    docTypes: [],
  });

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const setTheme = (nextTheme) => {
    const value = nextTheme === "dark" ? "dark" : "light";
    setThemeState(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      notify("Theme preference could not be saved in this browser");
    }
  };

  const beginEntranceTransition = () => setEntranceTransition(true);
  const updateUser = (nextUser) => {
    setUser(nextUser);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    } catch {
      notify("Profile updated for this session, but could not be cached in this browser");
    }
    return nextUser;
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const hydrate = async (nextUser) => {
    updateUser(nextUser);
    try {
      const data = await api("/api/meta");
      setMeta(data);
    } catch {
      /* ignore until authenticated */
    }
  };

  useEffect(() => {
    if (!getToken()) {
      setBootstrapping(false);
      return;
    }
    api("/api/auth/me")
      .then((data) => hydrate(data.user))
      .catch(() => setToken(null))
      .finally(() => setBootstrapping(false));
  }, []);

  const refreshUser = async () => {
    const session = await api("/api/auth/me");
    return updateUser(session.user);
  };

  const login = async (username, password, mfaCode) => {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: { username, password, ...(mfaCode ? { mfaCode } : {}) },
    });
    setToken(data.token);
    try {
      const session = await api("/api/auth/me");
      await hydrate(session.user);
      return session.user;
    } catch (error) {
      setToken(null);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
    } catch {
      /* still clear local session */
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem(USER_KEY);
  };

  const value = useMemo(
    () => ({ user, bootstrapping, login, logout, refreshUser, updateUser, meta, notify, toast, theme, setTheme, beginEntranceTransition }),
    [user, bootstrapping, meta, toast, theme]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      {entranceTransition ? <LoginTransition user={user} onComplete={() => setEntranceTransition(false)} /> : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
