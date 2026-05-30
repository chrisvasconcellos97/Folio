import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { pipBusySubscribe } from "./pipBusy";

// Global Pip state context. Drives the visual mood of every <PipOrb>:
//   speaking > thinking > alert > idle
//
// State sources:
//   - thinking: any in-flight Pip API call (via pipBusy emitter, wired in lib/pip.js)
//   - speaking: PipView streaming a response (set via setSpeaking)
//   - alert:    ambient warning, e.g. unresolved diagnostics (set via setAlert)
//   - idle:     default

var PipStateContext = createContext({
  state: "idle",
  setSpeaking: function () {},
  setAlert:    function () {},
});

export function PipStateProvider({ children }) {
  var [busy, setBusy]         = useState(0);
  var [speaking, setSpeaking] = useState(false);
  var [alert, setAlert]       = useState(false);

  useEffect(function () {
    return pipBusySubscribe(function (c) { setBusy(c); });
  }, []);

  var setSpeakingCb = useCallback(function (v) { setSpeaking(!!v); }, []);
  var setAlertCb    = useCallback(function (v) { setAlert(!!v); }, []);

  var state = speaking ? "speaking"
            : busy > 0 ? "thinking"
            : alert    ? "alert"
            : "idle";

  var value = useMemo(function () {
    return { state: state, setSpeaking: setSpeakingCb, setAlert: setAlertCb };
  }, [state, setSpeakingCb, setAlertCb]);

  return <PipStateContext.Provider value={value}>{children}</PipStateContext.Provider>;
}

export function usePipState() {
  return useContext(PipStateContext);
}
