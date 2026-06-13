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

// Convert Float32Array PCM to a WAV Blob so we can play via <audio>
// (more reliable on iOS than Web Audio API BufferSource)
function pcmToWavBlob(samples, sampleRate) {
  var numChannels = 1;
  var bitsPerSample = 16;
  var byteRate = sampleRate * numChannels * bitsPerSample / 8;
  var blockAlign = numChannels * bitsPerSample / 8;
  var dataSize = samples.length * 2; // 16-bit = 2 bytes per sample
  var buffer = new ArrayBuffer(44 + dataSize);
  var view = new DataView(buffer);

  function writeString(offset, str) {
    for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Clamp float32 → int16
  var offset = 44;
  for (var i = 0; i < samples.length; i++, offset += 2) {
    var s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function useKokoroTTS() {
  var [modelState, setModelState] = useState(_tts ? "ready" : "idle");
  var [speaking, setSpeaking]     = useState(false);
  var stateRef    = useRef(_tts ? "ready" : "idle");
  var audioElRef  = useRef(null);   // <audio> element — iOS-safe playback
  var audioCtxRef = useRef(null);   // Web Audio — desktop fallback

  // Called synchronously inside a user-gesture handler to unlock audio on iOS.
  // Also kicks off model pre-loading.
  function activate() {
    if (typeof window === "undefined") return;

    // Create a silent <audio> element and play it — this "unlocks" the audio
    // session on iOS Safari for all subsequent programmatic playback
    if (!audioElRef.current) {
      audioElRef.current = new window.Audio();
      audioElRef.current.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==";
      audioElRef.current.volume = 0;
      audioElRef.current.play().catch(function () {});
    }

    // Also unlock Web Audio context
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(function () {});
    }

    // Kick off model pre-load
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
    if (audioElRef.current) {
      try { audioElRef.current.pause(); audioElRef.current.src = ""; } catch (_) {}
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.suspend().catch(function () {});
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  async function speak(text) {
    if (!text) return;
    // stop any current audio first
    if (audioElRef.current) {
      try { audioElRef.current.pause(); } catch (_) {}
    }

    var clean = stripMarkdown(text);
    if (!clean) return;

    if (stateRef.current === "error") {
      _fallback(clean);
      return;
    }

    if (stateRef.current !== "ready") {
      if (stateRef.current === "idle") {
        // activate() wasn't called — start loading now
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

    try {
      var result = await _tts.generate(clean, { voice: VOICE, speed: 1.0 });

      // Defensive: handle both { audio, sampling_rate } and raw RawAudio objects
      var samples    = result.audio    || result;
      var sampleRate = result.sampling_rate || 24000;

      if (!(samples instanceof Float32Array)) {
        throw new Error("Unexpected audio format from Kokoro: " + typeof samples);
      }

      // Build a WAV blob and play via <audio> element — most iOS-compatible path
      var blob = pcmToWavBlob(samples, sampleRate);
      var url  = URL.createObjectURL(blob);

      if (!audioElRef.current) {
        audioElRef.current = new window.Audio();
      }
      audioElRef.current.onended = function () { URL.revokeObjectURL(url); setSpeaking(false); };
      audioElRef.current.onerror = function () { setSpeaking(false); };
      audioElRef.current.src = url;
      audioElRef.current.volume = 1;

      // Resume AudioContext if we have one (handles Web Audio path)
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume().catch(function () {});
      }

      setSpeaking(true);
      await audioElRef.current.play();
    } catch (e) {
      console.error("[Kokoro] generate/play error:", e);
      showToast("Pip voice error: " + (e && e.message ? e.message.slice(0, 60) : "unknown"), "warn");
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
