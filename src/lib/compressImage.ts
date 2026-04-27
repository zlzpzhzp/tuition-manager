// 영수증 사진 업로드 전 클라이언트 리사이즈+압축 → base64 dataURL 반환.
// createImageBitmap을 우선 사용 (EXIF 자동회전 + HEIC iOS17+ 대응).
// 실패 시 FileReader + Image fallback (HEIC를 못 읽는 구형 브라우저 식별 가능).
export async function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<string> {
  const bitmap = await loadBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    let w = bitmap.width
    let h = bitmap.height
    if (w > maxWidth) {
      h = Math.round((h * maxWidth) / w)
      w = maxWidth
    }
    if (w < 1) w = 1
    if (h < 1) h = 1
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas-unsupported')
    ctx.drawImage(bitmap, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    if (typeof (bitmap as ImageBitmap).close === 'function') {
      try { (bitmap as ImageBitmap).close() } catch {}
    }
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // 1순위: createImageBitmap (EXIF 자동회전 + HEIC iOS17+ Safari 디코딩)
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fallthrough
    }
  }
  // 2순위: FileReader + Image (구형 브라우저)
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`image-decode-failed: ${file.type || 'unknown'}`))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('file-read-failed'))
    reader.readAsDataURL(file)
  })
}
