(function () {
  "use strict";

  function _b64EncodeBytes(bytes) {
    // bytes -> base64
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function _b64DecodeToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function _toBase64Url(b64) {
    return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function _fromBase64Url(b64url) {
    let s = String(b64url || "").replaceAll("-", "+").replaceAll("_", "/");
    while (s.length % 4) s += "=";
    return s;
  }

  /**
   * @param {any} obj
   * @returns {string}
   */
  function encode(obj) {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    return _toBase64Url(_b64EncodeBytes(bytes));
  }

  /**
   * @param {string} s
   * @returns {any|null}
   */
  function decode(s) {
    try {
      const b64 = _fromBase64Url(s);
      const bytes = _b64DecodeToBytes(b64);
      const json = new TextDecoder().decode(bytes);
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  window.SprintCodec = { encode, decode };
})();

