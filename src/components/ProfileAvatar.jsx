const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export default function ProfileAvatar({ user, className = "" }) {
  const displayName = user?.name?.trim() || "User";

  const initials =
    user?.initials ||
    user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    "?";

  const avatarUrl = user?.avatar
    ? /^https?:\/\//i.test(user.avatar)
      ? user.avatar
      : `${API_BASE_URL}${user.avatar.startsWith("/") ? "" : "/"}${user.avatar}`
    : "";

  return avatarUrl ? (
    <img
      className={`avatar ${className}`}
      src={avatarUrl}
      alt={`${displayName}'s profile`}
      onError={(event) => {
        event.currentTarget.hidden = true;
        event.currentTarget.nextElementSibling?.removeAttribute("hidden");
      }}
    />
  ) : (
    <div
      className={`avatar ${className}`}
      role="img"
      aria-label={`${displayName}'s initials`}
    >
      {initials}
    </div>
  );
}
