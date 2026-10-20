// Classic, render-blocking script: restore the local preview before the first paint.
(() => {
  const root=document.documentElement;
  root.style.minHeight='100%';
  root.style.background='#808590 var(--startup-background, none) center / cover fixed no-repeat';
  try {
    const preview=localStorage.getItem('speed-dial-background-preview');
    if(preview && preview.length<=300000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(preview))
      root.style.setProperty('--startup-background',`url("${preview}")`);
  } catch { /* The page can still load the original from IndexedDB. */ }
})();
