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

// ── DIAGNOSTIC BLOCK (remove once root cause confirmed) ──────────────────────
if (typeof window !== "undefined") {
  console.log("[KokoroTTS] UA:", navigator.userAgent);
  console.log("[KokoroTTS] _isMobile:", _isMobile);
  console.log("[KokoroTTS] crossOriginIsolated:", window.crossOriginIsolated);
  console.log("[KokoroTTS] SharedArrayBuffer:", typeof SharedArrayBuffer);
}
// ─────────────────────────────────────────────────────────────────────────────

async function ensureModel() {
  if (_tts) return _tts;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async function () {
    console.log("[KokoroTTS] importing kokoro-js…");
    var { KokoroTTS } = await import("kokoro-js");
    console.log("[KokoroTTS] kokoro-js imported, calling from_pretrained…");
    _tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: DTYPE });
    console.log("[KokoroTTS] model ready ✓");
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
  var [modelState, setModelState] = useState(_tts ? "ready" : "idle");
  var [speaking, setSpeaking]     = useState(false);
  var stateRef    = useRef(_tts ? "ready" : "idle");
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

    // Eagerly refresh system voices list (fallback if Kokoro fails)
    if (window.speechSynthesis) {
      voicesRef.current = window.speechSynthesis.getVoices() || voicesRef.current;
    }

    // Create + unlock AudioContext inside the user gesture.
    // iOS Safari suspends AudioContext after async work, so we play a tiny
    // silent buffer here — this permanently unlocks the audio session so
    // src.start() later (after model generation) actually produces sound.
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current) {
      var ctx = audioCtxRef.current;
      var unlock = function () {
        var buf = ctx.createBuffer(1, 1, 22050);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        src.disconnect();
      };
      var doUnlockAndTest = function () {
        unlock();
        // 440 Hz sine-wave test — if you hear a 0.3s beep, AudioContext works.
        // If silent, the problem is iOS audio routing, not Kokoro/WAV.
        try {
          var rate    = ctx.sampleRate;
          var frames  = Math.floor(rate * 0.3);
          var testBuf = ctx.createBuffer(1, frames, rate);
          var data    = testBuf.getChannelData(0);
          for (var i = 0; i < frames; i++) {
            data[i] = Math.sin(2 * Math.PI * 440 * i / rate) * 0.5;
          }
          var testSrc = ctx.createBufferSource();
          testSrc.buffer = testBuf;
          testSrc.connect(ctx.destination);
          testSrc.start(0);
          showToast("🔔 440Hz test tone — did you hear a beep?", "info", 4000);
        } catch (_) {}
      };
      if (ctx.state === "suspended") {
        ctx.resume().then(doUnlockAndTest).catch(function () {});
      } else {
        doUnlockAndTest();
      }
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
        console.error("[KokoroTTS] preload FAILED:", e);
        stateRef.current = "error";
        setModelState("error");
        showToast("Voice model failed (" + (e && e.message ? e.message.slice(0, 60) : "unknown") + ")", "error");
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

    // DIAGNOSTIC — remove once confirmed
    showToast("🎙 speak() · model:" + stateRef.current + " · len:" + clean.length, "info", 6000);

    // ── Kokoro path (all devices) ──────────────────────────────────────────
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
    console.log("[KokoroTTS] AudioContext available:", !!Ctx);
    if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx();
    if (!audioCtxRef.current) {
      console.warn("[KokoroTTS] no AudioContext — falling back to system voice");
      speakWithSystemVoice(clean, function () { setSpeaking(false); });
      return;
    }
    console.log("[KokoroTTS] AudioContext state:", audioCtxRef.current.state);

    try {
      var result = await _tts.generate(clean, { voice: VOICE, speed: 1.0 });
      var samples    = result.audio    || result;
      var sampleRate = result.sampling_rate || 24000;

      if (!(samples instanceof Float32Array)) {
        throw new Error("Unexpected audio format: " + typeof samples);
      }

      if (samples.length === 0) {
        throw new Error("Kokoro returned 0 samples");
      }

      // Amplitude check on raw Kokoro PCM
      var maxAmp = 0, sumAmp = 0;
      for (var i = 0; i < Math.min(samples.length, 4000); i++) {
        var v = Math.abs(samples[i]);
        if (v > maxAmp) maxAmp = v;
        sumAmp += v;
      }
      var avgAmp = sumAmp / Math.min(samples.length, 4000);
      showToast("🔊 PCM: " + samples.length + "smp · max=" + maxAmp.toFixed(4) + " avg=" + avgAmp.toFixed(4), "info", 10000);

      var wavBuf   = pcmToWavBuffer(samples, sampleRate);
      var audioBuf = await audioCtxRef.current.decodeAudioData(wavBuf);

      // Amplitude check on decoded AudioBuffer
      var ch = audioBuf.getChannelData(0);
      var maxDec = 0, sumDec = 0;
      for (var j = 0; j < Math.min(ch.length, 4000); j++) {
        var w = Math.abs(ch[j]);
        if (w > maxDec) maxDec = w;
        sumDec += w;
      }
      showToast("🎚 decoded: dur=" + audioBuf.duration.toFixed(2) + "s · max=" + maxDec.toFixed(4) + " ctx=" + audioCtxRef.current.state, "info", 10000);

      // Always resume before playback
      try { await audioCtxRef.current.resume(); } catch (_) {}

      var src = audioCtxRef.current.createBufferSource();
      src.buffer = audioBuf;
      src.connect(audioCtxRef.current.destination);
      src.onended = function () { sourceRef.current = null; setSpeaking(false); };
      sourceRef.current = src;
      src.start(0);
      setSpeaking(true);
    } catch (e) {
      console.error("[KokoroTTS] generate/play FAILED:", e);
      showToast("Pip voice error: " + (e && e.message ? e.message.slice(0, 80) : "unknown"), "error");
      speakWithSystemVoice(clean, function () { setSpeaking(false); });
    }
  }

  return { speak, cancel, activate, modelState, speaking };
}
