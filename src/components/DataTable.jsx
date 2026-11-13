import EmptyState from "./EmptyState";

export default function DataTable({ columns, rows, onRowClick, emptyTitle, emptyText, footer }) {
  if (!rows?.length) {
    return <EmptyState title={emptyTitle || "No records"} text={emptyText || "Nothing to display yet."} />;
  }
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={onRowClick ? "clickable-row" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} onClick={col.stopRowClick ? (e) => e.stopPropagation() : undefined}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer ? <div className="pager">{footer}</div> : null}
    </>
  );
}
