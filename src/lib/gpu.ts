/* Can this machine draw the light? A browser with no graphics hardware for the page (hardware acceleration off, a
   blocked GPU, a remote desktop) still runs WebGL, but in software on the CPU, and the scenes then take the whole
   machine: every video and hover lags with them. Such a machine gets the site's lite build, the one the phone runs:
   plain loops in place of the scenes. `?lite=1` / `?lite=0` force either one (the sandbox renders in software too). */

function probe(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("lite");
    if (q === "1") return true;
    if (q === "0") return false;
    const c = document.createElement("canvas");
    // refused when the browser would have to fall back to software (Chrome: SwiftShader)
    const gl = c.getContext("webgl", { failIfMajorPerformanceCaveat: true }) as WebGLRenderingContext | null;
    if (!gl) return true;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const who = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(who);
  } catch {
    return true;
  }
}

/** true: no graphics hardware for the page, so no WebGL scenes */
export const LITE = probe();
