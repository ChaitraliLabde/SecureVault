export default function ProfileAvatar({ user, className = "" }) {
  const initials = user?.initials || user?.name
    ?.split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  return user?.avatar ? (
    <img className={`avatar ${className}`} src={user.avatar} alt={`${user.name} profile`} />
  ) : (
    <div className={`avatar ${className}`} aria-label={`${user?.name || "User"} initials`}>
      {initials}
    </div>
  );
}
