export function PrintAccountSheet({ account, contacts, meetings, items }) {
  var openItems  = (items || []).filter(function (i) { return !i.done; });
  var lastMeeting = meetings && meetings.length > 0 ? meetings[0] : null;

  return (
    <div id="print-account-sheet" style={{ display: "none" }}>
      <style>{`
        @media print {
          body > *:not(#print-account-sheet) { display: none !important; }
          #print-account-sheet { display: block !important; font-family: sans-serif; color: #000; padding: 32px; max-width: 800px; margin: 0 auto; }
          h1 { font-size: 24px; margin-bottom: 4px; }
          h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          p, li { font-size: 13px; line-height: 1.5; margin: 0 0 4px; }
          ul { padding-left: 16px; margin: 0; }
        }
      `}</style>

      <h1>{account.name}</h1>
      <p>{[account.tier, account.status, account.region].filter(Boolean).join(" · ")}</p>
      {account.address && <p><strong>Address:</strong> {account.address}</p>}

      {contacts && contacts.length > 0 && (
        <div>
          <h2>Contacts</h2>
          <ul>
            {contacts.map(function (c) {
              var parts = [c.name];
              if (c.title)  parts[0] = parts[0] + " — " + c.title;
              if (c.is_poc) parts[0] = parts[0] + " (POC)";
              if (c.phone)  parts.push(c.phone);
              if (c.email)  parts.push(c.email);
              return <li key={c.id}>{parts.join(" · ")}</li>;
            })}
          </ul>
        </div>
      )}

      {lastMeeting && (
        <div>
          <h2>Last Meeting</h2>
          <p><strong>{lastMeeting.title || "Meeting"}</strong> — {lastMeeting.meeting_date}</p>
          {lastMeeting.pip_summary && <p>{lastMeeting.pip_summary}</p>}
          {lastMeeting.action_items && <p><strong>Action Items:</strong> {lastMeeting.action_items}</p>}
        </div>
      )}

      {openItems.length > 0 && (
        <div>
          <h2>Open Items</h2>
          <ul>
            {openItems.map(function (i) {
              return <li key={i.id}>{i.text}{i.due_date ? " (due " + i.due_date + ")" : ""}</li>;
            })}
          </ul>
        </div>
      )}

      {account.objective && (
        <div>
          <h2>Notes</h2>
          <p>{account.objective}</p>
        </div>
      )}

      {/* eslint-ok: one-off locale format (printed-on stamp, system locale) */}
      <p style={{ marginTop: 24, fontSize: 11, color: "#999" }}>Exported from Folios · {new Date().toLocaleDateString()}</p>
    </div>
  );
}
