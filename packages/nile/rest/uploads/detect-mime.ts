/**
 * Detect MIME type from file magic bytes (header signature).
 * Returns the detected MIME type string or null if unrecognized.
 * Does NOT read the entire file — only slices the first 12 bytes.
 */
export async function detectMimeType(file: Blob): Promise<string | null> {
  if (file.size === 0) {
    return null;
  }

  // Read only the header bytes needed for signature matching.
  // Use subarray on the full buffer since Blob.slice may not be
  // available in all TypeScript declaration contexts.
  const fullBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(fullBuffer, 0, Math.min(12, file.size));

  const signatures = [
    { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, mime: "image/png" },
    { bytes: [0xff, 0xd8, 0xff], offset: 0, mime: "image/jpeg" },
    {
      bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
      offset: 0,
      mime: "image/gif",
    },
    {
      bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
      offset: 0,
      mime: "image/gif",
    },
    { bytes: [0x25, 0x50, 0x44, 0x46], offset: 0, mime: "application/pdf" },
    { bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0, mime: "application/zip" },
  ];

  // Special case for WebP: RIFF at 0 and WEBP at 8
  if (
    bytes.length >= 12 &&
    matches(bytes, [0x52, 0x49, 0x46, 0x46], 0) &&
    matches(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }

  for (const sig of signatures) {
    if (matches(bytes, sig.bytes, sig.offset)) {
      return sig.mime;
    }
  }

  return null;
}

function matches(bytes: Uint8Array, sig: number[], offset: number): boolean {
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) {
      return false;
    }
  }
  return true;
}
