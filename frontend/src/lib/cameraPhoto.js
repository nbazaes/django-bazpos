// Keep native camera images out of the preview until they have been downsized.
// Chrome on Android can suspend a memory-heavy tab while the camera is open.
export async function prepareCameraPhoto(file) {
  if (!file || typeof createImageBitmap !== "function") return file;
  const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  let width = 0;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2) break;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        break;
      }
      offset += length;
    }
  } else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.length >= 24) {
    width = new DataView(bytes.buffer).getUint32(16);
  }
  // Small images need no conversion. Unknown formats are left to server validation.
  if (!width || width <= 1600) return file;
  const bitmap = await createImageBitmap(file, { resizeWidth: 1600, resizeQuality: "high", imageOrientation: "from-image" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la foto. Intenta subirla desde tus archivos.");
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new Error("No se pudo preparar la foto. Intenta subirla desde tus archivos.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "factura"}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
