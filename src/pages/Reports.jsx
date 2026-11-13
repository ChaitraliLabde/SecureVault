import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { hasPermission, ROLE_LABELS } from "../lib/roleAccess";

const NOT_RECORDED = "Not Recorded";

const REPORT_SECTIONS = [
  { key: "caseInformation", label: "1. Case Information" },
  { key: "incidentOverview", label: "2. Incident Overview" },
  { key: "personsInvolved", label: "3. Persons and Organisations Involved" },
  { key: "caseDescription", label: "4. Case Description" },
  { key: "findings", label: "5. Findings and Observations" },
  { key: "pendingActions", label: "6. Pending Actions and Recommendations" },
  { key: "conclusion", label: "7. Conclusion / Current Case Position" },
  { key: "attachments", label: "8. Attachments and Supporting Documents" },
  { key: "preparedBy", label: "9. Prepared By – Investigating Officer" },
  { key: "supervisorReview", label: "10. Supervisor Review and Approval" },
];

const ALL_SECTIONS = Object.fromEntries(
  REPORT_SECTIONS.map((section) => [section.key, true])
);

const REPORT_PRESETS = {
  "Complete Report": { ...ALL_SECTIONS },

  "Small Report": {
    caseInformation: true,
    incidentOverview: true,
    personsInvolved: true,
    caseDescription: false,
    findings: false,
    pendingActions: false,
    conclusion: true,
    attachments: false,
    preparedBy: true,
    supervisorReview: false,
  },

  "Descriptive Report": {
    caseInformation: true,
    incidentOverview: true,
    personsInvolved: false,
    caseDescription: true,
    findings: false,
    pendingActions: false,
    conclusion: false,
    attachments: false,
    preparedBy: true,
    supervisorReview: false,
  },
};

function value(input) {
  if (input === null || input === undefined || input === "") {
    return NOT_RECORDED;
  }

  if (typeof input === "boolean") {
    return input ? "Yes" : "No";
  }

  return String(input);
}

function escapeHtml(input) {
  return value(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(input) {
  if (!input) return NOT_RECORDED;

  const date = new Date(input);

  return Number.isNaN(date.getTime())
    ? value(input)
    : date.toLocaleString("en-IN");
}

function table(headers, rows) {
  if (!rows?.length) {
    return `<p class="empty">No records available in SecureVault for this section.</p>`;
  }

  return `
    <table>
      <thead>
        <tr>
          ${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function fields(rows) {
  return table(
    ["Field", "Recorded Information"],
    rows.map(([label, content]) => [label, value(content)])
  );
}

function section(number, title, content) {
  if (!content) return "";

  return `
    <section class="report-section">
      <h2>${number}. ${escapeHtml(title)}</h2>
      ${content}
    </section>
  `;
}

function buildReportHtml(report) {
  const c = report.case || {};
  const officer = report.assignedOfficer || {};
  const supervisor = report.assignedSupervisor || {};
  const prepared = report.preparedBy || {};

  const documents = report.documents || [];
  const versions = report.versions || [];
  const audits = report.audit || [];
  const verifications = report.verifications || [];
  const custody = report.custodyEvents || [];
  const reviews = report.reviewHistory || [];

  const selected = (key, content) =>
    report.selectedSections?.[key] ? content : "";

  const documentRows = documents.map((doc) => [
    doc.id,
    doc.title || doc.name,
    doc.type,
    doc.uploadedByName,
    formatDate(doc.uploadedOn),
    doc.evidenceStatus,
    doc.size,
  ]);

  const versionRows = versions.map((version) => [
    version.file,
    version.version,
    version.uploadedByName,
    formatDate(version.date),
    version.sha256,
  ]);

  const timelineRows = [
    ...audits.map((entry) => [
      entry.timestampLabel || formatDate(entry.timestamp),
      entry.user,
      entry.action,
      entry.document,
      entry.status,
    ]),
    ...custody.map((event) => [
      formatDate(event.timestamp),
      event.handlerName,
      event.action,
      event.document,
      event.note,
    ]),
  ].sort((a, b) => {
    const da = new Date(a[0]).getTime();
    const db = new Date(b[0]).getTime();

    return (Number.isNaN(da) ? 0 : da) -
      (Number.isNaN(db) ? 0 : db);
  });

  const evidenceDocuments = documents.filter((doc) =>
    doc.type === "Digital Evidence" ||
    doc.captureSource ||
    doc.isDerivative
  );

  const witnessDocuments = documents.filter((doc) =>
    `${doc.type || ""} ${doc.name || ""} ${doc.title || ""}`
      .toLowerCase()
      .match(/witness|statement|interview/)
  );

  const reviewRows = reviews.map((review) => [
    review.action,
    review.actorName,
    formatDate(review.timestamp),
    review.reason || review.feedback,
    review.signature,
  ]);

  const verificationRows = verifications.map((item) => [
    item.document,
    item.version,
    item.user,
    item.algorithm || "SHA-256",
    item.recorded,
    item.calculated,
    item.match ? "MATCH" : "MISMATCH",
    formatDate(item.verifiedAt),
  ]);

  // 1. Case Information
  const caseInformation = selected(
    "caseInformation",
    fields([
      ["Case ID", c.id],
      ["Case Title", c.title],
      ["Category / Type", c.type],
      ["Case Status", c.status],
      ["Priority", c.priority],
      ["Incident Date", c.incidentDate],
      ["Reported Date", c.reportedOn],
      ["Incident Location", c.location],
      ["FIR / Reference Number", c.firNo],
      ["File Number", c.fileNumber],
      ["Assigned Investigating Officer", c.assignedName],
      ["Department / Unit", c.department],
      ["Created On", formatDate(c.createdOn)],
    ])
  );

  // 2. Incident Overview
  const incidentOverview = selected(
    "incidentOverview",
    fields([
      ["Incident Summary", c.description],
      ["Incident Date", c.incidentDate],
      ["Incident Location", c.location],
      ["Information Source", NOT_RECORDED],
      ["Initial Allegations", NOT_RECORDED],
      ["Applicable Laws / Sections", NOT_RECORDED],
    ])
  );

  // 3. Persons and Organisations Involved
  const personsInvolved = selected(
    "personsInvolved",
    table(
      ["Role", "Name", "Identifier / Designation"],
      [
        ["Prepared By", prepared.name, prepared.role],
        ["Investigating Officer", officer.name, officer.role],
        ["Assigned Supervisor", supervisor.name, supervisor.role],
      ]
    ) + `
      <p class="note">
        Other parties are included only when their details are
        recorded in authorized SecureVault records.
      </p>
    `
  );

     // 4. Case Description - Chronological Investigation Narrative

  const narrativeParagraphs = [];

  const addParagraph = (text) => {
    if (text?.trim()) {
      narrativeParagraphs.push(`<p>${escapeHtml(text)}</p>`);
    }
  };

  const hasText = (text) => {
  if (text === null || text === undefined) return false;

  const normalized = String(text).trim().toLowerCase();

  return (
    normalized !== "" &&
    normalized !== "not recorded" &&
    normalized !== "—" &&
    normalized !== "-"
  );
};

const clean = (text) =>
  hasText(text) ? String(text).trim() : "";

  // Case registration and initial context
  addParagraph(
    `The case titled "${clean(c.title) || "Untitled Case"}" was registered in SecureVault under Case ID ${clean(c.id) || "Not Recorded"}. It is categorised as ${clean(c.type) || "Not Recorded"}, with a priority of ${clean(c.priority) || "Not Recorded"}. The incident was reported on ${clean(c.reportedOn) || "Not Recorded"} and is recorded as having occurred on ${clean(c.incidentDate) || "Not Recorded"} at ${clean(c.location) || "Not Recorded"}.`
  );

  if (hasText(c.description)) {
    addParagraph(
      `The initial incident information entered during registration was: ${clean(c.description)}`
    );
  }

  if (hasText(officer.name)) {
    addParagraph(
      `Responsibility for the investigation was assigned to ${clean(officer.name)}${hasText(officer.role) ? `, serving as ${clean(officer.role)}` : ""}${hasText(supervisor.name) ? `. The case was placed under the supervision of ${clean(supervisor.name)}` : ""}.`
    );
  }

  // Select meaningful investigation events.
  // Ordinary viewing, opening, previewing and report-generation actions are excluded.
  const ignoredActions =
    /view|open|preview|login|logout|search|filter|report.?generat|print|page.?visit/i;

  const meaningfulActions =
    /creat|registr|assign|upload|submit|status|chang|updat|approv|reject|clos|verif|transfer|receiv|collect|seal|release|dispatch|return|handover|hand.?over/i;

  const eventTimeline = [
    ...audits.map((entry) => ({
      date: entry.timestamp,
      user: entry.user,
      action: entry.action,
      document: entry.document,
      details: entry.note || entry.status,
      source: "activity",
    })),

    ...custody.map((event) => ({
      date: event.timestamp,
      user: event.handlerName,
      action: event.action,
      document: event.document,
      details: event.note,
      source: "custody",
    })),
  ]
    .filter((event) => {
      const action = clean(event.action);

      if (!action || ignoredActions.test(action)) return false;

      if (event.source === "custody") {
        return /transfer|receiv|collect|seal|release|dispatch|return|handover|hand.?over/i.test(action);
      }

      return meaningfulActions.test(action);
    })
    .sort((a, b) => {
      const first = new Date(a.date).getTime();
      const second = new Date(b.date).getTime();

      return (
        (Number.isNaN(first) ? 0 : first) -
        (Number.isNaN(second) ? 0 : second)
      );
    });

  // Convert recorded events into readable investigation sentences.
  const describeEvent = (event) => {
    const actor = clean(event.user) || "The responsible personnel";
    const action = clean(event.action);
    const document = clean(event.document);
    const details = clean(event.details);
    const date = hasText(event.date) ? formatDate(event.date) : "";

    let sentence;

    if (/assign/i.test(action)) {
      sentence = `${actor} recorded the assignment of the case`;
    } else if (/upload|registr|add/i.test(action)) {
      sentence = `${actor} added or registered ${document || "material"} in the case record`;
    } else if (/submit/i.test(action)) {
      sentence = `${actor} submitted ${document || "the recorded material"}`;
    } else if (/approv/i.test(action)) {
      sentence = `${actor} approved ${document || "the submitted case material"}`;
    } else if (/reject/i.test(action)) {
      sentence = `${actor} rejected ${document || "the submitted case material"}`;
    } else if (/clos/i.test(action)) {
      sentence = `${actor} recorded the closure of the case`;
    } else if (/verif/i.test(action)) {
      sentence = `${actor} performed a verification`;
    } else if (/status|chang|updat/i.test(action)) {
      sentence = `${actor} updated the case record`;
    } else if (event.source === "custody") {
      sentence = `${actor} recorded an evidence-handling action (${action})`;
    } else {
      sentence = `${actor} performed the recorded action "${action}"`;
    }

    if (document && !sentence.includes(document)) {
      sentence += ` concerning ${document}`;
    }

    if (date) {
      sentence += ` on ${date}`;
    }

    if (details) {
      sentence += `. The recorded details state: ${details}`;
    }

    return sentence + ".";
  };

  // Keep the events in one chronological sequence rather than separating
  // activity logs from evidence-handling records.
  if (eventTimeline.length) {
    const eventSentences = eventTimeline.map(describeEvent);

    const midpoint = Math.ceil(eventSentences.length / 2);

    addParagraph(
      `The recorded investigation history shows how the case progressed over time. ${eventSentences.slice(0, midpoint).join(" ")}`
    );

    if (eventSentences.length > midpoint) {
      addParagraph(
        `As the investigation continued, the case history further records the following developments. ${eventSentences.slice(midpoint).join(" ")}`
      );
    }
  } else {
    addParagraph(
      "No meaningful investigation activities or evidence-handling events are recorded in the available case history."
    );
  }

  // Supporting documents: summarise instead of repeating every document.
  if (documents.length) {
    const documentTypes = [
      ...new Set(
        documents
          .map((doc) => clean(doc.type))
          .filter(Boolean)
      ),
    ];

    addParagraph(
      `The case file contains ${documents.length} registered document(s) supporting the investigation${documentTypes.length ? `. These are classified under the following document categories: ${documentTypes.join(", ")}` : ""}. The individual documents remain available in the case record for reference.`
    );
  } else {
    addParagraph(
      "No supporting documents are currently registered against this case."
    );
  }

  // Digital evidence
  if (evidenceDocuments.length) {
    addParagraph(
      `${evidenceDocuments.length} document(s) are identified in the case records as digital evidence or evidence-related material. These records form part of the supporting material associated with the investigation.`
    );
  }

  // Integrity verification: summarise results instead of listing every check.
  if (verifications.length) {
    const matched = verifications.filter((item) => item.match === true).length;
    const mismatched = verifications.length - matched;

    const verifiedDocuments = [
      ...new Set(
        verifications
          .map((item) => clean(item.document))
          .filter(Boolean)
      ),
    ];

    addParagraph(
      `Evidence integrity was examined through ${verifications.length} recorded verification operation(s), using the SHA-256 mechanism. Of these, ${matched} produced matching hash results and ${mismatched} produced mismatches. The verification history covers ${verifiedDocuments.length} distinct document(s)${verifiedDocuments.length ? `, including ${verifiedDocuments.join(", ")}` : ""}. These results represent the integrity checks recorded in SecureVault.`
    );
  }

  // Version history
  if (versions.length) {
    addParagraph(
      `The document history contains ${versions.length} recorded version entry/entries. This version history maintains traceability of document updates and the associated upload records.`
    );
  }

  // Supervisor decisions
  if (reviews.length) {
    const reviewSentences = reviews
      .sort((a, b) => {
        const first = new Date(a.timestamp).getTime();
        const second = new Date(b.timestamp).getTime();

        return (
          (Number.isNaN(first) ? 0 : first) -
          (Number.isNaN(second) ? 0 : second)
        );
      })
      .map((review) => {
        const actor = clean(review.actorName) || "The supervisor";
        const action = clean(review.action) || "recorded a review decision";
        const date = hasText(review.timestamp)
          ? formatDate(review.timestamp)
          : "";
        const feedback = clean(review.reason || review.feedback);

        return `${actor} recorded "${action}"${date ? ` on ${date}` : ""}${feedback ? ` with the following feedback: ${feedback}` : ""}.`;
      });

    addParagraph(
      `The investigation was also subject to supervisory review. ${reviewSentences.join(" ")}`
    );
  } else {
    addParagraph(
      "No supervisory review decisions are currently recorded in the available case history."
    );
  }

  // 8. Current investigation position
  addParagraph(
    `At the time of report generation, the case is recorded with the status "${value(c.status)}". This narrative presents the progression reflected in the available case registration details, investigation activities, supporting documents, evidence records, integrity verification history and supervisory review records.`
  );

  const caseDescription = selected(
    "caseDescription",
    `
      <div class="case-narrative">
        ${narrativeParagraphs.join("\n")}
      </div>

      <p class="note">
        This narrative is automatically compiled from records available
        in SecureVault. It does not introduce independently verified
        facts or establish legal conclusions. All information should
        be reviewed by authorised investigation personnel.
      </p>
    `
  );
  // 5. Findings and Observations
  const findings = selected(
    "findings",
    `
      <p><strong>Recorded Investigation Findings:</strong> ${NOT_RECORDED}</p>
      <p><strong>Evidence-linked Observations:</strong> Refer to the registered documents and integrity records.</p>
      <p><strong>Supporting References:</strong> Refer to the document register, audit trail and custody history.</p>
      <p><strong>Unresolved Issues:</strong> ${NOT_RECORDED}</p>
      <p class="note">
        Findings must be entered and reviewed by authorized investigation personnel.
      </p>
    `
  );

  // 6. Pending Actions and Recommendations
  const pendingActions = selected(
    "pendingActions",
    fields([
      ["Pending Investigation Actions", NOT_RECORDED],
      ["Assigned Responsibility", NOT_RECORDED],
      ["Target Completion Date", NOT_RECORDED],
      ["Action Status", NOT_RECORDED],
      ["Recommendations", NOT_RECORDED],
    ])
  );

  // 7. Conclusion / Current Case Position
  const conclusion = selected(
    "conclusion",
    fields([
      ["Current Case Status", c.status],
      ["Assigned Investigating Officer", officer.name],
      ["Latest Supervisor Review", report.lastReview?.action],
      ["Review Date", formatDate(report.lastReview?.timestamp)],
      ["Investigation Conclusion", NOT_RECORDED],
      ["Next Steps", NOT_RECORDED],
    ]) + `
      <p class="note">
        The case status reflects the current SecureVault record.
        It is not an independent legal determination.
      </p>
    `
  );

  // 8. Attachments and Supporting Documents
  const attachments = selected(
    "attachments",
    table(
      ["Attachment No.", "Document Title", "Document ID", "Type", "Notes"],
      documents.map((doc, index) => [
        index + 1,
        doc.title || doc.name,
        doc.id,
        doc.type,
        doc.description,
      ])
    )
  );

  // 9. Prepared By – Investigating Officer
  const preparedBy = selected(
    "preparedBy",
    fields([
      ["Prepared By", prepared.name],
      ["System Role", prepared.role],
      ["Investigating Officer", officer.name],
      ["Officer Designation", officer.role],
      ["Department / Unit", NOT_RECORDED],
      ["Employee / Service ID", officer.id],
      ["Report Prepared Date", report.generatedAt],
      ["Signature Reference", NOT_RECORDED],
    ]) + `
      <div class="declaration">
        <strong>Declaration</strong>
        <p>
          This report has been generated from records available
          in SecureVault at the time of generation. The preparer
          should verify its contents before formal submission.
        </p>
        <p>Signature: __________________________</p>
        <p>Date: ______________________________</p>
      </div>
    `
  );

  // 10. Supervisor Review and Approval
  const supervisorReview = selected(
    "supervisorReview",
    `
      ${fields([
        ["Assigned Supervisor", supervisor.name],
        ["Review Status", report.lastReview?.action],
        ["Review Decision Date", formatDate(report.lastReview?.timestamp)],
        ["Review Comments", report.lastReview?.reason || report.lastReview?.feedback],
        ["Approval / Signature Reference", report.lastReview?.signature],
      ])}

      <h3>Complete Review History</h3>

      ${table(
        ["Decision", "Supervisor", "Date", "Comments", "Signature"],
        reviewRows
      )}
    `
  );

  const reportSections = [
    section("1", "Case Information", caseInformation),
    section("2", "Incident Overview", incidentOverview),
    section("3", "Persons and Organisations Involved", personsInvolved),
    section("4", "Case Description", caseDescription),
    section("5", "Findings and Observations", findings),
    section("6", "Pending Actions and Recommendations", pendingActions),
    section("7", "Conclusion / Current Case Position", conclusion),
    section("8", "Attachments and Supporting Documents", attachments),
    section("9", "Prepared By – Investigating Officer", preparedBy),
    section("10", "Supervisor Review and Approval", supervisorReview),
  ];

  const cover = `
    <div class="cover">
      <div class="cover-top">
        SECUREVAULT · INVESTIGATION MANAGEMENT SYSTEM
      </div>

      <div class="cover-main">
        <div class="cover-label">CONFIDENTIAL INVESTIGATION RECORD</div>
        <h1>INVESTIGATION REPORT</h1>
        <div class="cover-line"></div>
        <h2>${escapeHtml(c.title)}</h2>
        <p>${escapeHtml(c.id)}</p>
        <p class="cover-type">${escapeHtml(report.type)}</p>
      </div>

      ${fields([
        ["Report ID", `${c.id}-${String(report.generatedAtISO || Date.now()).replace(/[^0-9]/g, "").slice(0, 14)}`],
        ["Template Version", "2.0"],
        ["FIR / Reference Number", c.firNo],
        ["Report Status", "Draft"],
        ["Date Prepared", report.generatedAt],
        ["Classification", "Confidential — subject to agency policy"],
        ["Prepared By", prepared.name],
      ])}

      <p class="draft-warning">
        DRAFT TEMPLATE — NOT AN OFFICIAL FIR OR COURT DOCUMENT
      </p>

      <p class="cover-disclaimer">
        Generated from records available in SecureVault.
        Verify contents before official use.
      </p>

      <div class="cover-footer">
        CONFIDENTIAL · HANDLE IN ACCORDANCE WITH APPLICABLE POLICY
      </div>
    </div>
  `;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(c.id)} - Investigation Report</title>

       <style>
  @page {
    size: A4;
    margin: 16mm 16mm 16mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    line-height: 1.5;
    color: #1e293b;
    margin: 0;
  }

  /* COVER PAGE */
  .cover {
    height: 252mm;
    min-height: 252mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-after: always;
    break-after: page;
  }

  .cover-top {
    text-align: center;
    font-size: 10pt;
    font-weight: bold;
    letter-spacing: 2px;
    border-bottom: 2px solid #1e3a5f;
    padding-bottom: 15px;
  }

  .cover-main {
    text-align: center;
    padding: 35px 10px;
  }

  .cover-label {
    color: #64748b;
    letter-spacing: 3px;
    font-size: 9pt;
  }

  .cover h1 {
    font-size: 29pt;
    color: #17365d;
    margin: 20px 0 10px;
  }

  .cover h2 {
    border: 0;
    font-size: 19pt;
    margin-top: 35px;
  }

  .cover-line {
    width: 100px;
    border-top: 3px solid #2563eb;
    margin: 20px auto;
  }

  .cover-type {
    font-weight: bold;
    color: #475569;
  }

  .draft-warning {
    text-align: center;
    font-weight: bold;
    color: #991b1b;
    border: 1px solid #b91c1c;
    padding: 10px;
    margin-top: 20px;
  }

  .cover-disclaimer,
  .cover-footer {
    text-align: center;
    color: #64748b;
    font-size: 8pt;
  }

  /* MAIN REPORT */
  h1 {
    color: #17365d;
    font-size: 22pt;
    margin: 0 0 15px;
  }

  h2 {
    color: #17365d;
    font-size: 14pt;
    margin: 20px 0 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid #cbd5e1;

    page-break-after: avoid;
    break-after: avoid-page;
  }

  h3 {
    font-size: 11pt;
    color: #334155;
    margin-top: 15px;

    page-break-after: avoid;
    break-after: avoid-page;
  }

  .report-section {
    margin-bottom: 16px;
    page-break-inside: auto;
    break-inside: auto;
  }

  /* TABLES */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 14px;
    table-layout: fixed;

    page-break-inside: auto;
    break-inside: auto;
  }

  thead {
    display: table-header-group;
  }

  tfoot {
    display: table-footer-group;
  }

  th,
  td {
    border: 1px solid #cbd5e1;
    padding: 6px;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    font-size: 9pt;
  }

  th {
    background: #eaf0f7;
    color: #17365d;
    font-weight: bold;
  }

  tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* TEXT */
  p {
    orphans: 3;
    widows: 3;
  }

  .case-narrative p {
    text-align: justify;
    margin: 0 0 12px;
    line-height: 1.6;
  }

  .empty {
    color: #64748b;
    font-style: italic;
    padding: 10px;
    background: #f8fafc;
  }

  .note {
    font-size: 9pt;
    color: #475569;
    background: #f1f5f9;
    border-left: 3px solid #64748b;
    padding: 10px;
    margin: 12px 0;
  }

  .declaration {
    margin-top: 18px;
    border: 1px solid #cbd5e1;
    padding: 12px;

    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* SCREEN PREVIEW */
  @media screen {
    body {
      max-width: 850px;
      margin: 30px auto;
      padding: 25px;
    }

    .cover {
      min-height: 1000px;
      height: auto;
    }
  }

  /* PRINT */
  @media print {
    body {
      margin: 0;
      padding: 0;
      max-width: none;
    }

    .cover {
      height: 252mm;
      min-height: 252mm;
      page-break-after: always;
      break-after: page;
    }
  }
</style>
      </head>

      <body>
        ${cover}

        

        <h1>Investigation Report</h1>

        <p>
          <strong>Case:</strong> ${escapeHtml(c.id)} ·
          <strong>Generated:</strong> ${escapeHtml(report.generatedAt)}
        </p>

        ${reportSections.join("")}

        <p class="note">
          END OF REPORT — CONFIDENTIAL. Verify all contents before official use.
        </p>
      </body>
    </html>
  `;
}

export default function Reports() {
  const { notify, user } = useApp();
  const canGenerate = hasPermission(user, "reports.generate");

  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState("");
  const [type, setType] = useState("Complete Report");

  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loadingCases, setLoadingCases] = useState(true);

  const selectedSections = REPORT_PRESETS[type];

  useEffect(() => {
    api("/api/cases")
      .then((data) => {
        setCases(data.cases || []);
        setCaseId(data.cases?.[0]?.id || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCases(false));
  }, []);

  const selectedCase = cases.find((c) => c.id === caseId);

  const completeReportAllowed =
    ["completed", "closed"].includes(
      String(selectedCase?.status || "").toLowerCase()
    );

  const changeReportType = (newType) => {
    setType(newType);
    setReport(null);
    setError("");
  };

  const generate = async (e) => {
    e.preventDefault();

    if (!caseId) {
      setError("Select a case before generating a report.");
      return;
    }

    if (type === "Complete Report" && !completeReportAllowed) {
      setError(
        "Complete Report is available only for Completed or Closed cases."
      );
      return;
    }

    setError("");
    setGenerating(true);

    const params = new URLSearchParams({
      type,

      caseDetails: "1",

      documentsList:
        selectedSections.caseDescription || selectedSections.attachments
          ? "1"
          : "0",

      versionHistory:
        selectedSections.caseDescription ? "1" : "0",

      auditTrail:
        selectedSections.caseDescription ? "1" : "0",
    });

    try {
      const data = await api(`/api/reports/${caseId}?${params}`);

      setReport({
        ...data,
        type,
        selectedSections: { ...selectedSections },
      });

      notify("Case report generated successfully");
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const exportPdf = () => {
    if (!report) return;

    const win = window.open("", "_blank");

    if (!win) {
      setError("Allow pop-ups to preview and print the report.");
      return;
    }

    win.document.open();
    win.document.write(buildReportHtml(report));
    win.document.close();

    win.focus();

    win.onload = () => {
      win.print();
    };
  };

  const selectedCount = Object.values(selectedSections).filter(Boolean).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{canGenerate ? "Generate Case Report" : "View Case Reports"}</h1>

          <p>
            {canGenerate
              ? "Generate structured investigation reports using authorized case records."
              : `Review reports for cases authorized to ${ROLE_LABELS[user.role] || user.role}.`}
          </p>
        </div>
      </div>

      <div className="grid-2">
        <form className="card card-pad" onSubmit={generate}>
          <div className="form-grid">

            <div className="field">
              <label>Select Case</label>

              <select
                className="select"
                value={caseId}
                onChange={(e) => {
                  setCaseId(e.target.value);
                  setReport(null);
                  setError("");
                }}
                disabled={loadingCases}
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} - {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Report Type</label>

              <select
                className="select"
                value={type}
                onChange={(e) => changeReportType(e.target.value)}
              >
                <option>Complete Report</option>
                <option>Small Report</option>
                <option>Descriptive Report</option>
              </select>
            </div>

            <div className="field">
              <label className="label-strong">
                Included Report Sections
              </label>

              <p className="muted">
                The following sections will be included automatically.
              </p>

              <p className="muted">
                {selectedCount} of 10 sections included
              </p>

              <div className="check-list">
                {REPORT_SECTIONS.map((section) => (
                  <label className="check" key={section.key}>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedSections[section.key])}
                      readOnly
                    />

                    {section.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {type === "Complete Report" && selectedCase && !completeReportAllowed && (
            <p className="form-error" role="alert">
              Complete Report is available only for Completed or Closed cases.
              Choose Small Report or Descriptive Report for this case.
            </p>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {!loadingCases && !cases.length && !error && (
            <p className="muted" role="status">
              No cases are assigned to your account yet.
            </p>
          )}

          <div className="actions-row">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={
                generating ||
                !caseId ||
                (type === "Complete Report" && !completeReportAllowed)
              }
            >
              {generating
                ? "Generating…"
                : canGenerate
                  ? "Generate Report"
                  : "View Report"}
            </button>
          </div>
        </form>

        <div className="card card-pad">
          <div className="card-title">Report Preview</div>

          {!report ? (
            <p className="muted">
              Generate a report to preview it here before export.
            </p>
          ) : (
            <>
              <p>
                <strong>{report.case.id}</strong> · {report.type}
              </p>

              <p>{report.case.title}</p>

              <p className="muted">
                Generated {report.generatedAt}
              </p>

              <div className="report-summary">
                <p>
                  {Object.values(report.selectedSections || {}).filter(Boolean).length}
                  {" "}of 10 sections included
                </p>

                <p>{(report.documents || []).length} document(s) included</p>

                <p>{(report.versions || []).length} version record(s)</p>

                <p>{(report.verifications || []).length} integrity verification(s)</p>

                <p>{(report.custodyEvents || []).length} custody event(s)</p>

                <p>{(report.audit || []).length} audit event(s)</p>

                <p>{(report.reviewHistory || []).length} supervisor review(s)</p>
              </div>

              <button
                className="btn btn-primary"
                type="button"
                onClick={exportPdf}
              >
                Export / Print PDF
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}