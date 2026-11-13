import { Search } from "lucide-react";

export default function FilterBar({ search, onSearch, onSubmit, children, placeholder = "Search..." }) {
  return (
    <div className="card-pad filters">
      <div className="search">
        <Search size={16} />
        <input
          className="input"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
        />
      </div>
      {children}
      {onSubmit ? (
        <button className="btn btn-ghost" type="button" onClick={onSubmit}>
          Apply
        </button>
      ) : null}
    </div>
  );
}
