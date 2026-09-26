// A phone camera photo is 3–12 MB. The rack needs a thumbnail and Claude needs
// enough detail to tell a loafer from an oxford — 1024px on the long side does
// both, at roughly 100–200 KB as JPEG.

export async function shrink(file, maxSide = 1024, quality = 0.82) {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

async function loadBitmap(file) {
  // createImageBitmap honours EXIF rotation, so a portrait photo stays upright.
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> for formats the bitmap decoder refuses */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function base64Of(dataUrl) {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
