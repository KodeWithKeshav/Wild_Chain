/** SHA-256 of raw bytes as a 0x-prefixed bytes32 (same as `sha256sum file`). */
export async function sha256Hex(data: ArrayBuffer | Blob): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const sha256Text = (text: string) => sha256Hex(new TextEncoder().encode(text).buffer as ArrayBuffer);
export const ZERO_HASH = "0x" + "0".repeat(64);
export const isZeroHash = (h: string) => /^0x0{64}$/.test(h);
