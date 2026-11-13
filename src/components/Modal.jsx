export default function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {title ? <h2 style={{ marginBottom: 14 }}>{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}
