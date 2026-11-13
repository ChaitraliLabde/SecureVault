export default function FileUploader({ file, onFile, accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png", progress = 0 }) {
  return (
    <>
      <div className="file-box">
        <div>
          <strong>Choose File</strong>
          <div className="muted">{file?.name || "No file selected"}</div>
          <div className="muted">PDF, DOC, DOCX, JPG, PNG · max 50 MB</div>
        </div>
        <input
          type="file"
          accept={accept}
          onChange={(e) => onFile(e.target.files?.[0] || null)}
        />
      </div>
      {progress ? (
        <div className="progress">
          <div style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </>
  );
}
