const key='speed-dial-background-preview';

/** Small, local first-paint image; the original stays in IndexedDB. */
export function cacheBackgroundPreview(image:HTMLImageElement) {
  try {
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');
    if(!context)return;
    // Match the wallpaper base for transparent uploads.
    context.fillStyle='#808590';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    let preview=canvas.toDataURL('image/jpeg',.65);
    if(preview.length>300000) {
      const small=document.createElement('canvas');small.width=Math.max(1,Math.round(canvas.width/2));small.height=Math.max(1,Math.round(canvas.height/2));
      small.getContext('2d')!.drawImage(canvas,0,0,small.width,small.height);
      preview=small.toDataURL('image/jpeg',.6);
    }
    if(preview.length>300000)return;
    localStorage.setItem(key,preview);
    document.documentElement.style.setProperty('--startup-background',`linear-gradient(var(--wallpaper-shade),var(--wallpaper-shade)),url("${preview}")`);
  } catch { /* A full or disabled preview cache must not block the original. */ }
}

export function clearBackgroundPreview() {
  try {localStorage.removeItem(key);} catch { /* Storage may be disabled. */ }
  document.documentElement.style.removeProperty('--startup-background');
}
