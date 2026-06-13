import { useState, useRef } from "react";
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

// Float32Array PCM → ArrayBuffer containing a valid WAV file.
// AudioContext.decodeAudioData() accepts WAV, which avoids the iOS
// autoplay restriction that blocks <audio>.play() after async work.
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
  var audioCtxRef = useRef(null);  // unlocked once in user gesture, stays unlocked
  var sourceRef   = useRef(null);  // current AudioBufferSourceNode

  // Must be called synchronously inside a user-gesture handler (button onClick).
  // Creates and resumes the AudioContext — once resumed from a gesture, iOS
  // keeps it running even during subsequent async work, so playback can fire
  // seconds later without another gesture. Also kicks off model preload.
  function activate() {
    if (typeof window === "undefined") return;

    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    // resume() must be in the gesture — after this the context stays "running"
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(function () {});
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

    // Stop any current playback
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (_) {}
      sourceRef.current = null;
    }

    if (stateRef.current === "error") {
      _fallback(clean);
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
        _fallback(clean);
        return;
      }
    }

    // Ensure we have an AudioContext — activate() should have created one,
    // but speak() can be called standalone (e.g. from PipView chat).
    var Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (Ctx && !audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }

    if (!audioCtxRef.current) {
      // No AudioContext support — fall back to system voice
      _fallback(clean);
      return;
    }

    try {
      showToast("Kokoro: generating…", "info", 15000);
      var result = await _tts.generate(clean, { voice: VOICE, speed: 1.0 });

      var samples    = result.audio    || result;
      var sampleRate = result.sampling_rate || 24000;

      if (!(samples instanceof Float32Array)) {
        throw new Error("Unexpected audio format from Kokoro: " + typeof samples);
      }

      showToast("Kokoro: decoding audio…", "info", 5000);
      var wavBuf   = pcmToWavBuffer(samples, sampleRate);
      var audioBuf = await audioCtxRef.current.decodeAudioData(wavBuf);

      if (audioCtxRef.current.state === "suspended") {
        showToast("Kokoro: resuming AudioContext…", "info", 3000);
        await audioCtxRef.current.resume();
      }

      showToast("Kokoro: ctx state = " + audioCtxRef.current.state, "info", 5000);

      var src = audioCtxRef.current.createBufferSource();
      src.buffer = audioBuf;
      src.connect(audioCtxRef.current.destination);
      src.onended = function () {
        sourceRef.current = null;
        setSpeaking(false);
      };
      sourceRef.current = src;
      src.start(0);
      setSpeaking(true);
      showToast("Kokoro: playing ✓", "success", 3000);
    } catch (e) {
      console.error("[Kokoro] generate/play error:", e);
      showToast("Pip voice error: " + (e && e.message ? e.message.slice(0, 80) : "unknown"), "warn", 10000);
      _fallback(clean);
    }
  }

  return { speak, cancel, activate, modelState, speaking };
}

function _fallback(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}
