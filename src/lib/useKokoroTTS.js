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

// Float32Array PCM → WAV ArrayBuffer (for HTMLAudioElement Blob playback)
function pcmToWavBuffer(samples, sampleRate) {
  var numChannels   = 1;
  var bitsPerSample = 16;
  var byteRate      = sampleRate * numChannels * bitsPerSample / 8;
  var blockAlign    = numChannels * bitsPerSample / 8;
  var dataSize      = samples.length * 2;
  var buffer        = new ArrayBuffer(44 + dataSize);
  var view          = new DataView(buffer);
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
  var stateRef   = useRef(_tts ? "ready" : "idle");
  var audioElRef       = useRef(null);   // HTMLAudioElement — retains iOS gesture unlock across async work
  var audioUnlockedRef = useRef(false);  // did the silent-WAV unlock play() actually resolve?
  var blobUrlRef       = useRef(null);   // current Blob URL, revoked on next play
  var voicesRef        = useRef([]);

  useEffect(function () {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    function load() { voicesRef.current = window.speechSynthesis.getVoices(); }
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return function () { window.speechSynthesis.removeEventListener("voiceschanged", load); };
  }, []);

  function activate() {
    if (typeof window === "undefined") return;

    if (window.speechSynthesis) {
      voicesRef.current = window.speechSynthesis.getVoices() || voicesRef.current;
      // Prime speechSynthesis INSIDE the user gesture. iOS commonly drops the
      // first utterance unless it was primed by a gesture-bound speak() call —
      // without this the system-voice fallback can be silently ignored later.
      try {
        window.speechSynthesis.cancel();
        var primer = new SpeechSynthesisUtterance(" ");
        primer.volume = 0;
        window.speechSynthesis.speak(primer);
      } catch (_) {}
    }

    // Create and unlock HTMLAudioElement inside the user gesture.
    // iOS Safari grants playback rights to an HTMLAudioElement unlocked this
    // way and retains them across async work — unlike AudioContext, which loses
    // audible-output rights once the gesture context expires.
    if (!audioElRef.current) {
      audioElRef.current = new Audio();
    }
    var silentWav = pcmToWavBuffer(new Float32Array(1), 22050);
    var silentUrl = URL.createObjectURL(new Blob([silentWav], { type: "audio/wav" }));
    audioElRef.current.src = silentUrl;
    audioElRef.current.play().then(function () {
      audioUnlockedRef.current = true;
      audioElRef.current.pause();
      try { audioElRef.current.currentTime = 0; } catch (_) {}
      URL.revokeObjectURL(silentUrl);
      showToast("DIAG: audio unlocked ✓", "info", 2500);
    }).catch(function (err) {
      audioUnlockedRef.current = false;
      URL.revokeObjectURL(silentUrl);
      showToast("DIAG: audio unlock FAILED · " + (err && err.name ? err.name : "?"), "warn", 6000);
    });

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
    if (audioElRef.current) {
      try { audioElRef.current.pause(); } catch (_) {}
    }
    if (blobUrlRef.current) {
      try { URL.revokeObjectURL(blobUrlRef.current); } catch (_) {}
      blobUrlRef.current = null;
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
    showToast("DIAG: speak() reached · model=" + stateRef.current + " · unlocked=" + audioUnlockedRef.current, "info", 4000);

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

    if (!audioElRef.current) {
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

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      var url = URL.createObjectURL(new Blob([pcmToWavBuffer(samples, sampleRate)], { type: "audio/wav" }));
      blobUrlRef.current = url;

      var el = audioElRef.current;
      el.onended = function () {
        setSpeaking(false);
        if (blobUrlRef.current === url) {
          URL.revokeObjectURL(url);
          blobUrlRef.current = null;
        }
      };
      el.onerror = function () {
        setSpeaking(false);
        speakWithSystemVoice(clean, function () { setSpeaking(false); });
      };
      el.src = url;
      await el.play();
      setSpeaking(true);
      // DIAG: this is the decisive test. If you SEE this toast but HEAR nothing,
      // the code path works — the silence is the iPhone Ring/Silent switch or
      // media volume (HTMLAudioElement obeys the mute switch; WebAudio did not,
      // which is why the old beep was audible). If you never see this toast,
      // playback was rejected and we fell through to the catch below.
      showToast("DIAG: ▶ Kokoro playing. Hear nothing? Check the Ring/Silent switch + volume.", "info", 7000);
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
