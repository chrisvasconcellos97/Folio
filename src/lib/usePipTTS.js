import { useState, useRef, useEffect } from "react";

function stripMarkdown(text) {
  return text
    .replace(/[*#`_~\[\]]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\n+/g, ". ")
    .trim();
}

// Shared TTS hook used by both PipView chat and HomeView brief reader.
// Uses the Web Speech API — instant, no download, works on iOS when called
// from inside a user-gesture handler. Automatically picks the best available
// English voice: downloaded Premium/Enhanced voices win, then named fallbacks.
export function usePipTTS() {
  var [speaking, setSpeaking] = useState(false);
  var voicesRef = useRef([]);

  useEffect(function () {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    function loadVoices() { voicesRef.current = window.speechSynthesis.getVoices(); }
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return function () { window.speechSynthesis.removeEventListener("voiceschanged", loadVoices); };
  }, []);

  function pickVoice() {
    var voices = voicesRef.current.length
      ? voicesRef.current
      : ((typeof window !== "undefined" && window.speechSynthesis && window.speechSynthesis.getVoices()) || []);
    var enVoices = voices.filter(function (v) { return /^en/.test(v.lang); });
    // Downloaded on-device voices (localService=true) automatically win —
    // any Premium/Enhanced voice installed in iOS Settings will be used.
    var local = enVoices.filter(function (v) { return v.localService; });
    if (local.length) return local[0];
    // Fall back to named list
    var names = ["Daniel", "Samantha", "Jamie", "Karen", "Moira", "Aaron", "Fred"];
    for (var i = 0; i < names.length; i++) {
      var match = enVoices.find(function (v) { return v.name === names[i]; });
      if (match) return match;
    }
    return enVoices[0] || null;
  }

  function speak(text, opts) {
    if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
    var clean = stripMarkdown(text);
    if (!clean) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(clean);
    var voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = (opts && opts.rate) || 0.95;
    u.onend   = function () { setSpeaking(false); if (opts && opts.onEnd)   opts.onEnd(); };
    u.onerror = function () { setSpeaking(false); if (opts && opts.onError) opts.onError(); };
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  function cancel() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  var supported = typeof window !== "undefined" && !!window.speechSynthesis;

  return { speak, cancel, speaking, supported };
}
