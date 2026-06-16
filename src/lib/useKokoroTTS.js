import { useState, useRef, useEffect } from "react";
import { showToast } from "../components/Toast";

var MODEL_ID = "onnx-community/Kokoro-82M-ONNX";
var VOICE    = "bm_daniel";
var DTYPE    = "q8";

var _tts         = null;
var _loadPromise = null;

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
    showToast("DIAG: no speechSynthesis on this browser", "warn", 5000);
    if (onEnd) onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  var voice = pickSystemVoice();
  if (voice) u.voice = voice;
  u.rate = 0.95;
  // DIAG: confirm the fallback fired + which voice. onstart proves iOS accepted it.
  u.onstart = function () { showToast("DIAG: system voice speaking · " + (voice ? voice.name : "default"), "info", 4000); };
  u.onend   = function () { showToast("DIAG: system voice ended", "info", 2500); if (onEnd) onEnd(); };
  u.onerror = function (ev) { showToast("DIAG: system voice error · " + (ev && ev.error ? ev.error : "?"), "warn", 5000); if (onEnd) onEnd(); };
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
      showToast("DIAG: no AudioContext on this browser", "warn", 6000);
      return;
    }
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

      ctx.resume().then(function () {
        ctxUnlockedRef.current = true;
        showToast("DIAG: WebAudio unlocked ✓ · " + ctx.state, "info", 2500);
      }).catch(function (err) {
        showToast("DIAG: WebAudio resume FAILED · " + (err && err.name ? err.name : "?"), "warn", 6000);
      });
    } catch (err) {
      showToast("DIAG: WebAudio unlock threw · " + (err && err.name ? err.name : "?"), "warn", 6000);
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

    // DIAG: prove speak() is reached + the model/unlock state at entry.
    showToast("DIAG: speak() reached · model=" + stateRef.current + " · unlocked=" + ctxUnlockedRef.current, "info", 4000);

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
      var result     = await _tts.generate(clean, { voice: VOICE, speed: 1.0 });
      var samples    = result.audio    || result;
      var sampleRate = result.sampling_rate || 24000;

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
      await ctx.resume();

      if (sourceRef.current) { try { sourceRef.current.stop(); } catch (_) {} }
      var src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);
      src.onended = function () { setSpeaking(false); if (sourceRef.current === src) sourceRef.current = null; };
      sourceRef.current = src;
      src.start(0);
      setSpeaking(true);

      // DIAG: decisive. If you SEE this and HEAR nothing now, it's the device
      // volume (WebAudio ignores the Ring/Silent switch, so that's ruled out).
      showToast("DIAG: ▶ Kokoro playing (WebAudio) · ctx=" + ctx.state + " · " + samples.length + " samples", "info", 7000);
    } catch (e) {
      console.error("[KokoroTTS] speak failed:", e);
      var name = e && e.name ? e.name : "Error";
      var msg  = e && e.message ? e.message : "unknown";
      showToast("DIAG: Kokoro failed (" + name + "): " + msg + " — trying system voice", "warn", 8000);
      speakWithSystemVoice(clean, function () { setSpeaking(false); });
    }
  }

  return { speak, cancel, activate, modelState, speaking };
}
