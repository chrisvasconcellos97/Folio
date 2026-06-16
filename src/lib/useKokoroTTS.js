import { useState, useRef, useEffect } from "react";
import { showToast } from "../components/Toast";

var MODEL_ID = "onnx-community/Kokoro-82M-ONNX";
var VOICE    = "bm_daniel";
var DTYPE    = "q8";

var _tts         = null;
var _loadPromise = null;

// ── Persistent, screenshot-able diagnostic trail ──────────────────────────
// Toasts vanish before the full sequence can be read on a phone. diag() also
// appends to a module-level ring buffer that the hook renders as a fixed panel.
var _diag        = [];
var _diagSetters = [];
function diag(line, type, ms) {
  var stamped = new Date().toTimeString().slice(0, 8) + "  " + line;
  _diag = _diag.concat([stamped]).slice(-16);
  _diagSetters.forEach(function (fn) { try { fn(_diag); } catch (_) {} });
  showToast(line, type || "info", ms || 4000);
}

async function ensureModel() {
  if (_tts) return _tts;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async function () {
    var { KokoroTTS } = await import("kokoro-js");
    _tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: DTYPE });
    return _tts;
  })();
  try {
    await _loadPromise;
  } catch (e) {
    _loadPromise = null;
    throw e;
  }
  return _tts;
}

function stripMarkdown(text) {
  return text
    .replace(/[*#`_~\[\]]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function pickSystemVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  var voices   = window.speechSynthesis.getVoices() || [];
  var enVoices = voices.filter(function (v) { return /^en/.test(v.lang); });
  var premium  = enVoices.find(function (v) { return /(premium)/i.test(v.name + " " + (v.voiceURI || "")); });
  if (premium) return premium;
  var enhanced = enVoices.find(function (v) { return /(enhanced)/i.test(v.name + " " + (v.voiceURI || "")); });
  if (enhanced) return enhanced;
  var names = ["Daniel", "Samantha", "Jamie", "Karen", "Moira", "Aaron", "Fred"];
  for (var i = 0; i < names.length; i++) {
    var match = enVoices.find(function (v) { return v.name === names[i]; });
    if (match) return match;
  }
  return enVoices[0] || null;
}

function speakWithSystemVoice(text, onEnd) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    diag("no speechSynthesis on this browser", "warn", 5000);
    if (onEnd) onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  var voice = pickSystemVoice();
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.onstart = function () { diag("system voice speaking · " + (voice ? voice.name : "default")); };
  u.onend   = function () { diag("system voice ended"); if (onEnd) onEnd(); };
  u.onerror = function (ev) { diag("system voice error · " + (ev && ev.error ? ev.error : "?"), "warn", 5000); if (onEnd) onEnd(); };
  window.speechSynthesis.speak(u);
}

export function useKokoroTTS() {
  var [modelState, setModelState] = useState(_tts ? "ready" : "idle");
  var [speaking, setSpeaking]     = useState(false);
  var stateRef     = useRef(_tts ? "ready" : "idle");
  var audioCtxRef  = useRef(null);   // WebAudio context — ignores the iOS Ring/Silent switch
  var ctxUnlockedRef = useRef(false); // did the gesture-time resume()+silent buffer take?
  var keepAliveRef = useRef(null);   // looping silent source so iOS doesn't auto-suspend
  var sourceRef    = useRef(null);   // current playing BufferSource
  var voicesRef    = useRef([]);
  var [diagLines, setDiagLines] = useState(_diag);

  useEffect(function () {
    _diagSetters.push(setDiagLines);
    setDiagLines(_diag);
    return function () { _diagSetters = _diagSetters.filter(function (f) { return f !== setDiagLines; }); };
  }, []);

  useEffect(function () {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    function load() { voicesRef.current = window.speechSynthesis.getVoices(); }
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return function () { window.speechSynthesis.removeEventListener("voiceschanged", load); };
  }, []);

  function getCtx() {
    if (audioCtxRef.current) return audioCtxRef.current;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtxRef.current = new Ctx();
    return audioCtxRef.current;
  }

  function activate() {
    if (typeof window === "undefined") return;

    if (window.speechSynthesis) {
      voicesRef.current = window.speechSynthesis.getVoices() || voicesRef.current;
      // Prime speechSynthesis INSIDE the user gesture — iOS commonly drops the
      // first utterance unless it was gesture-primed (the fallback path).
      try {
        window.speechSynthesis.cancel();
        var primer = new SpeechSynthesisUtterance(" ");
        primer.volume = 0;
        window.speechSynthesis.speak(primer);
      } catch (_) {}
    }

    // Unlock WebAudio inside the gesture. Unlike HTMLAudioElement, an AudioContext
    // ignores the iOS Ring/Silent switch — and once resumed in a gesture it keeps
    // the right to play buffers scheduled later (after async model inference).
    var ctx = getCtx();
    if (!ctx) {
      diag("no AudioContext on this browser", "warn", 6000);
      return;
    }
    diag("activate · ctx created · state=" + ctx.state);
    try {
      var buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      var unlockSrc = ctx.createBufferSource();
      unlockSrc.buffer = buf;
      unlockSrc.connect(ctx.destination);
      unlockSrc.start(0);

      // Light keep-alive: a silent looping source through a zero gain node so the
      // context never auto-suspends between responses.
      if (!keepAliveRef.current) {
        var silent = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        var ka = ctx.createBufferSource();
        ka.buffer = silent;
        ka.loop = true;
        var g = ctx.createGain();
        g.gain.value = 0;
        ka.connect(g);
        g.connect(ctx.destination);
        ka.start(0);
        keepAliveRef.current = ka;
      }

      var rp = ctx.resume();
      if (rp && rp.then) {
        rp.then(function () {
          ctxUnlockedRef.current = true;
          diag("WebAudio unlocked ✓ · state=" + ctx.state);
        }).catch(function (err) {
          diag("WebAudio resume FAILED · " + (err && err.name ? err.name : "?"), "warn", 6000);
        });
      } else {
        // Old webkit: resume() returns undefined, not a promise.
        ctxUnlockedRef.current = true;
        diag("WebAudio resume (no-promise) · state=" + ctx.state);
      }
    } catch (err) {
      diag("WebAudio unlock threw · " + (err && err.name ? err.name : "?"), "warn", 6000);
    }

    if (!_tts && stateRef.current === "idle") {
      stateRef.current = "loading";
      setModelState("loading");
      showToast("Loading Pip's voice… first time only (~80 MB)", "info", 20000);
      ensureModel().then(function () {
        stateRef.current = "ready";
        setModelState("ready");
        showToast("Pip's voice ready ✓", "success");
      }).catch(function (e) {
        console.error("[KokoroTTS] load failed:", e);
        stateRef.current = "error";
        setModelState("error");
        showToast("Voice model failed — using system voice", "warn");
      });
    }
  }

  function cancel() {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (_) {}
      sourceRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  async function speak(text) {
    if (!text) return;
    var clean = stripMarkdown(text);
    if (!clean) return;

    diag("speak() reached · model=" + stateRef.current + " · unlocked=" + ctxUnlockedRef.current);

    if (stateRef.current === "error") {
      speakWithSystemVoice(clean, function () { setSpeaking(false); });
      return;
    }

    if (stateRef.current !== "ready") {
      if (stateRef.current === "idle") {
        stateRef.current = "loading";
        setModelState("loading");
        showToast("Loading Pip's voice… first time only (~80 MB)", "info", 20000);
      }
      try {
        await ensureModel();
        stateRef.current = "ready";
        setModelState("ready");
        showToast("Pip's voice ready ✓", "success");
      } catch (e) {
        stateRef.current = "error";
        setModelState("error");
        speakWithSystemVoice(clean, function () { setSpeaking(false); });
        return;
      }
    }

    var ctx = getCtx();
    if (!ctx) {
      speakWithSystemVoice(clean, function () { setSpeaking(false); });
      return;
    }

    try {
      // Kokoro inference hangs indefinitely on iOS (82M ONNX model exhausts the
      // tab memory mid-generate — no resolve, no throw). Race it against a
      // timeout so a stall falls through to the system voice instead of going
      // silent forever.
      diag("generating… (Kokoro inference)");
      var GEN_TIMEOUT_MS = 15000;
      var result = await Promise.race([
        _tts.generate(clean, { voice: VOICE, speed: 1.0 }),
        new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error("generate timeout (" + GEN_TIMEOUT_MS + "ms)")); }, GEN_TIMEOUT_MS);
        }),
      ]);
      var samples    = result.audio    || result;
      var sampleRate = result.sampling_rate || 24000;

      diag("Kokoro generated · " + (samples && samples.length ? samples.length : 0) + " samples @ " + sampleRate);

      if (!(samples instanceof Float32Array) || samples.length === 0) {
        throw new Error("Kokoro returned no audio data");
      }

      // Build an AudioBuffer DIRECTLY from the PCM — no decodeAudioData (which
      // expects an encoded container and was the likely silent-failure in the
      // earlier WebAudio attempts). The context resamples 24k → device rate.
      var audioBuf = ctx.createBuffer(1, samples.length, sampleRate);
      if (audioBuf.copyToChannel) {
        audioBuf.copyToChannel(samples, 0, 0);
      } else {
        audioBuf.getChannelData(0).set(samples);
      }

      // Resume again right before playback — idempotent, and reactivates the
      // context if iOS auto-suspended it since the unlock gesture.
      var rp2 = ctx.resume();
      if (rp2 && rp2.then) { await rp2; }
      diag("pre-start · ctx=" + ctx.state);

      if (sourceRef.current) { try { sourceRef.current.stop(); } catch (_) {} }
      var src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);
      src.onended = function () { diag("Kokoro source ended"); setSpeaking(false); if (sourceRef.current === src) sourceRef.current = null; };
      sourceRef.current = src;
      src.start(0);
      setSpeaking(true);

      // Decisive: if you SEE this and HEAR nothing, only device VOLUME is left —
      // WebAudio ignores the Ring/Silent switch, so that's ruled out.
      diag("▶ Kokoro playing (WebAudio) · ctx=" + ctx.state + " · " + samples.length + " samples", "info", 7000);
    } catch (e) {
      console.error("[KokoroTTS] speak failed:", e);
      var name = e && e.name ? e.name : "Error";
      var msg  = e && e.message ? e.message : "unknown";
      diag("Kokoro failed (" + name + "): " + msg + " — trying system voice", "warn", 8000);
      speakWithSystemVoice(clean, function () { setSpeaking(false); });
    }
  }

  return { speak, cancel, activate, modelState, speaking, diag: diagLines };
}
