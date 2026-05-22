import { useState, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { useAccounts } from "./hooks/useAccounts";
import { useMeetings } from "./hooks/useMeetings";
import { useCadences } from "./hooks/useCadences";
import { AuthView } from "./views/auth/AuthView";
import { AccountsView } from "./views/accounts/AccountsView";
import { AccountDetail } from "./views/accounts/AccountDetail";
import { AddAccountModal } from "./views/accounts/AddAccountModal";
import { MeetingsView } from "./views/meetings/MeetingsView";
import { PipelineView } from "./views/pipeline/PipelineView";
import { PipView } from "./views/pip/PipView";
import { CadenceView } from "./views/cadence/CadenceView";
import { DesktopLayout } from "./layout/DesktopLayout";
import { MobileLayout } from "./layout/MobileLayout";
import { PipMark } from "./components/PipMark";
import { C } from "./lib/colors";

function useBreakpoint() {
  var [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 900 : true
  );
  useEffect(function () {
    function handleResize() {
      setIsDesktop(window.innerWidth >= 900);
    }
    window.addEventListener("resize", handleResize);
    return function () { window.removeEventListener("resize", handleResize); };
  }, []);
  return isDesktop;
}

export default function App() {
  var { session, loading: authLoading, signIn, signUp, signOut } = useAuth();
  var userId   = session ? session.user.id : null;
  var userMeta = session ? session.user.user_metadata : null;
  var isDesktop = useBreakpoint();

  var [view, setView]                   = useState("accounts");
  var [selectedAccount, setSelected]    = useState(null);
  var [showAddAccount, setShowAddAccount] = useState(false);
  var [editingAccount, setEditingAccount] = useState(null);

  var { accounts, loading: acctLoading, addAccount, updateAccount, deleteAccount } = useAccounts(userId);
  var { meetings, loading: meetLoading } = useMeetings(userId);
  var { cadences } = useCadences(userId);

  function handleSelectAccount(a) {
    setSelected(a);
  }

  function handleBack() {
    setSelected(null);
  }

  function handleSetView(v) {
    setView(v);
    setSelected(null);
  }

  function handleAddAccount(data) {
    return addAccount(data);
  }

  function handleEditAccount(data) {
    return updateAccount(editingAccount.id, data).then(function () {
      setEditingAccount(null);
      if (selectedAccount && selectedAccount.id === editingAccount.id) {
        setSelected(Object.assign({}, selectedAccount, data));
      }
    });
  }

  function handleUpdateSelectedAccount(data) {
    if (!selectedAccount) return Promise.resolve();
    return updateAccount(selectedAccount.id, data).then(function () {
      setSelected(function (prev) { return Object.assign({}, prev, data); });
    });
  }

  function handleDeleteAccount() {
    if (!selectedAccount) return;
    deleteAccount(selectedAccount.id).then(function () {
      setSelected(null);
    });
  }

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <PipMark size={18} color={C.accent} glow pulse />
      </div>
    );
  }

  if (!session) {
    return (
      <AuthView
        onSignIn={signIn}
        onSignUp={signUp}
      />
    );
  }

  /* ---------- Content panes ---------- */

  var accountsListPane = (
    <AccountsView
      accounts={accounts}
      loading={acctLoading}
      onSelect={handleSelectAccount}
    />
  );

  var mainContent = null;

  if (view === "accounts") {
    if (selectedAccount) {
      mainContent = (
        <AccountDetail
          account={selectedAccount}
          userId={userId}
          onBack={handleBack}
          onEdit={function () { setEditingAccount(selectedAccount); }}
          onDelete={handleDeleteAccount}
          onUpdate={handleUpdateSelectedAccount}
        />
      );
    } else if (!isDesktop) {
      mainContent = accountsListPane;
    } else {
      mainContent = (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            flexDirection: "column",
            gap: 12,
            color: C.textMuted,
          }}
        >
          <PipMark size={18} color={C.accentDim} glow />
          <div style={{ fontSize: 13 }}>Select an account</div>
        </div>
      );
    }
  }

  if (view === "meetings") {
    mainContent = <MeetingsView meetings={meetings} loading={meetLoading} />;
  }

  if (view === "pipeline") {
    mainContent = <PipelineView accounts={accounts} loading={acctLoading} />;
  }

  if (view === "pip") {
    mainContent = <PipView accounts={accounts} meetings={meetings} />;
  }

  if (view === "cadence") {
    mainContent = (
      <CadenceView
        cadences={cadences}
        accounts={accounts}
        onSelectAccount={function (accountId) {
          var acct = accounts.find(function (a) { return a.id === accountId; });
          if (acct) { handleSelectAccount(acct); handleSetView("accounts"); }
        }}
      />
    );
  }

  /* ---------- Render ---------- */

  var addAccountModal = (showAddAccount || editingAccount) && (
    <AddAccountModal
      userId={userId}
      existing={editingAccount || null}
      onSave={editingAccount ? handleEditAccount : handleAddAccount}
      onClose={function () { setShowAddAccount(false); setEditingAccount(null); }}
    />
  );

  if (isDesktop) {
    return (
      <>
        <DesktopLayout
          view={view}
          setView={handleSetView}
          onAddAccount={function () { setShowAddAccount(true); }}
          onSignOut={signOut}
          userMeta={userMeta}
          accountsPane={view === "accounts" ? accountsListPane : null}
          detailPane={mainContent}
        />
        {addAccountModal}
        {/* Floating Pip (desktop) */}
        {view !== "pip" && (
          <div
            style={{
              position: "fixed",
              bottom: 28,
              right: 28,
              zIndex: 90,
            }}
          >
            <div
              className="pip-sonar"
              onClick={function () { handleSetView("pip"); }}
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: C.accentGlow,
                border: "1px solid rgba(200,136,58,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 0 20px rgba(200,136,58,0.22)",
              }}
            >
              <PipMark size={14} color={C.accent} glow pulse />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <MobileLayout
        view={view}
        setView={handleSetView}
        onAddAccount={function () { setShowAddAccount(true); }}
        onSignOut={signOut}
      >
        {mainContent}
      </MobileLayout>
      {addAccountModal}
      {/* Floating Pip (mobile) */}
      {view !== "pip" && (
        <div
          style={{
            position: "fixed",
            bottom: 90,
            right: 20,
            zIndex: 90,
          }}
        >
          <div
            className="pip-sonar"
            onClick={function () { handleSetView("pip"); }}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: C.accentGlow,
              border: "1px solid rgba(200,136,58,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 0 20px rgba(200,136,58,0.22)",
            }}
          >
            <PipMark size={14} color={C.accent} glow pulse />
          </div>
        </div>
      )}
    </>
  );
}
