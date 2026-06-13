import { useState, useRef } from "react";
import { showToast } from "../components/Toast";

var MODEL_ID = "onnx-community/Kokoro-82M-ONNX";
var VOICE    = "bm_daniel";
var DTYPE    = "q8";  // ~80 MB quantized model, cached in browser after first load

// Module-level singleton — survives component re-mounts and route changes
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

export function useKokoroTTS() {
  var [modelState, setModelState] = useState(_tts ? "ready" : "idle");
  // "idle" | "loading" | "ready" | "error"
  var stateRef   = useRef(_tts ? "ready" : "idle");  // readable inside async closures
  var audioCtxRef = useRef(null);
  var sourceRef   = useRef(null);

  function cancel() {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (_) {}
      sourceRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  async function speak(text) {
    if (!text) return;
    cancel();

    var clean = stripMarkdown(text);
    if (!clean) return;

    // Previously failed — fall back to system TTS
    if (stateRef.current === "error") {
      _fallback(clean);
      return;
    }

    // First use — download the model (cached after first load)
    if (!_tts) {
      stateRef.current = "loading";
      setModelState("loading");
      showToast("Loading Pip's voice… first time only (~80 MB)", "info", 12000);
      try {
        await ensureModel();
        stateRef.current = "ready";
        setModelState("ready");
      } catch (e) {
        console.error("[Kokoro] load failed:", e);
        stateRef.current = "error";
        setModelState("error");
        showToast("Voice model failed to load — using system voice", "warn");
        _fallback(clean);
        return;
      }
    }

    // Generate and play
    try {
      var result = await _tts.generate(clean, { voice: VOICE, speed: 1.0 });
      var samples    = result.audio;         // Float32Array
      var sampleRate = result.sampling_rate; // 24000

      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      var ctx = audioCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();

      var buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);

      var source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = function () { sourceRef.current = null; };
      sourceRef.current = source;
      source.start();
    } catch (e) {
      console.error("[Kokoro] generate error:", e);
      _fallback(clean);
    }
  }

  return { speak, cancel, modelState };
}

function _fallback(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  var u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}
