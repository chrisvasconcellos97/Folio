import { useState, useRef, useEffect } from "react";
import { showToast } from "../components/Toast";

var MODEL_ID = "onnx-community/Kokoro-82M-ONNX";
var VOICE    = "bm_daniel";
var DTYPE    = "q8";

var _tts         = null;
var _loadPromise = null;

// Kokoro's ONNX WASM runtime hangs on iOS Safari — use Web Speech API there.
var _isMobile = typeof navigator !== "undefined"
  && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

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

// Pick the best available English voice — prefers downloaded Premium/Enhanced.
function pickSystemVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  var voices    = window.speechSynthesis.getVoices() || [];
  var enVoices  = voices.filter(function (v) { return /^en/.test(v.lang); });
  var premium   = enVoices.find(function (v) {
    return /(premium)/i.test(v.name + " " + (v.voiceURI || ""));
  });
  if (premium) return premium;
  var enhanced  = enVoices.find(function (v) {
    return /(enhanced)/i.test(v.name + " " + (v.voiceURI || ""));
  });
  if (enhanced) return enhanced;
  var names = ["Daniel", "Samantha", "Jamie", "Karen", "Moira", "Aaron", "Fred"];
  for (var i = 0; i < names.length; i++) {
    var match = enVoices.find(function (v) { return v.name === names[i]; });
    if (match) return match;
  }
  return enVoices[0] || null;
}

function speakWithSystemVoice(text, onEnd) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  var voice = pickSystemVoice();
  if (voice) u.voice = voice;
  u.rate = 0.95;
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
  window.speechSynthesis.speak(u);
}

// Float32Array PCM → WAV ArrayBuffer for AudioContext.decodeAudioData()
function pcmToWavBuffer(samples, sampleRate) {
  var numChannels  = 1;
  var bitsPerSample = 16;
  var byteRate     = sampleRate * numChannels * bitsPerSample / 8;
  var blockAlign   = numChannels * bitsPerSample / 8;
  var dataSize     = samples.length * 2;
  var buffer       = new ArrayBuffer(44 + dataSize);
  var view         = new DataView(buffer);
  function writeString(offset, str) {
    for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  var offset = 44;
  for (var i = 0; i < samples.length; i++, offset += 2) {
    var s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

export function useKokoroTTS() {
  var [modelState, setModelState] = useState(
    _isMobile ? "mobile" : (_tts ? "ready" : "idle")
  );
  var [speaking, setSpeaking]     = useState(false);
  var stateRef    = useRef(_isMobile ? "mobile" : (_tts ? "ready" : "idle"));
  var audioCtxRef = useRef(null);
  var sourceRef   = useRef(null);
  var voicesRef   = useRef([]);

  // Eagerly load system voices list on mount (needed for pickSystemVoice on mobile)
  useEffect(function () {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    function load() { voicesRef.current = window.speechSynthesis.getVoices(); }
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return function () { window.speechSynthesis.removeEventListener("voiceschanged", load); };
  }, []);

  function activate() {
    if (typeof window === "undefined") return;

    // Mobile: no Kokoro — just ensure voices are loaded for system TTS
    if (_isMobile) {
      if (window.speechSynthesis) {
        voicesRef.current = window.speechSynthesis.getVoices() || voicesRef.current;
      }
      return;
    }

    // Desktop: create + resume AudioContext inside the user gesture so it
    // stays unlocked through subsequent async work (model generate, etc.)
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(function () { /* guard-ok: resume() failure is non-critical; speak() handles suspended ctx */ });
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
        console.error("[Kokoro] preload failed:", e);
        stateRef.current = "error";
        setModelState("error");
        showToast("Voice model failed — using system voice", "warn");
      });
    }
  }

  function cancel() {
    if (_isMobile) {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setSpeaking(false);
      return;
    }
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

    // ── Mobile path: Web Speech API with best available voice ──────────────
    if (_isMobile) {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(clean);
      // Prefer voices that were loaded eagerly; fall back to getVoices() now
      var voices = voicesRef.current.length
        ? voicesRef.current
        : (window.speechSynthesis.getVoices() || []);
      var enVoices = voices.filter(function (v) { return /^en/.test(v.lang); });
      var voice = enVoices.find(function (v) { return /(premium)/i.test(v.name + " " + (v.voiceURI || "")); })
        || enVoices.find(function (v) { return /(enhanced)/i.test(v.name + " " + (v.voiceURI || "")); })
        || enVoices.find(function (v) {
             var names = ["Daniel","Samantha","Jamie","Karen","Moira","Aaron","Fred"];
             return names.indexOf(v.name) !== -1;
           })
        || enVoices[0] || null;
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onstart = function () { setSpeaking(true); };
      u.onend   = function () { setSpeaking(false); };
      u.onerror = function () { setSpeaking(false); };
      window.speechSynthesis.speak(u);
      return;
    }

    // ── Desktop path: Kokoro → AudioContext ────────────────────────────────
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (_) {}
      sourceRef.current = null;
    }

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
        console.error("[Kokoro] load failed:", e);
        stateRef.current = "error";
        setModelState("error");
        showToast("Voice model failed — using system voice", "warn");
        speakWithSystemVoice(clean, function () { setSpeaking(false); });
        return;
      }
    }

    var Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx();
    if (!audioCtxRef.current) {
      speakWithSystemVoice(clean, function () { setSpeaking(false); });
      return;
    }

    try {
      var result = await _tts.generate(clean, { voice: VOICE, speed: 1.0 });
      var samples    = result.audio    || result;
      var sampleRate = result.sampling_rate || 24000;

      if (!(samples instanceof Float32Array)) {
        throw new Error("Unexpected audio format: " + typeof samples);
      }

      var wavBuf   = pcmToWavBuffer(samples, sampleRate);
      var audioBuf = await audioCtxRef.current.decodeAudioData(wavBuf);

      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }

      var src = audioCtxRef.current.createBufferSource();
      src.buffer = audioBuf;
      src.connect(audioCtxRef.current.destination);
      src.onended = function () { sourceRef.current = null; setSpeaking(false); };
      sourceRef.current = src;
      src.start(0);
      setSpeaking(true);
    } catch (e) {
      console.error("[Kokoro] generate/play error:", e);
      showToast("Pip voice error: " + (e && e.message ? e.message.slice(0, 60) : "unknown"), "warn");
      speakWithSystemVoice(clean, function () { setSpeaking(false); });
    }
  }

  return { speak, cancel, activate, modelState, speaking };
}
