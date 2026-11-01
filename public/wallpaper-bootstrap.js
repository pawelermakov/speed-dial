// Classic, render-blocking script: restore theme and wallpaper before the first paint.
(() => {
  const root = document.documentElement;
  try {
    const lang = localStorage.getItem('speed-dial-language');
    root.lang = ['ru', 'en', 'es'].includes(lang)
      ? lang
      : ['ru', 'en', 'es'].includes(navigator.language.split('-')[0])
        ? navigator.language.split('-')[0]
        : 'en';
  } catch {
    root.lang = 'en';
  }
  let mode = 'system';
  try {
    const saved = localStorage.getItem('speed-dial-theme');
    if (saved === 'light' || saved === 'dark') mode = saved;
  } catch {
    /* Fall back to the system preference when the mirror is unavailable. */
  }
  const theme =
    mode === 'system'
      ? matchMedia('(prefers-color-scheme:dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  root.dataset.themeMode = mode;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.minHeight = '100%';
  root.style.background =
    'var(--startup-background, none) center / cover fixed no-repeat var(--page-background, ' +
    (theme === 'dark' ? '#16191f' : '#dce2e9') +
    ')';
  try {
    const preview = localStorage.getItem('speed-dial-background-preview');
    if (
      preview &&
      preview.length <= 300000 &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(preview)
    )
      root.style.setProperty(
        '--startup-background',
        `linear-gradient(var(--wallpaper-shade, ${theme === 'dark' ? 'rgb(0 0 0 / .25)' : 'transparent'}),var(--wallpaper-shade, ${theme === 'dark' ? 'rgb(0 0 0 / .25)' : 'transparent'})),url("${preview}")`,
      );
  } catch {
    /* The page can still load the original from IndexedDB. */
  }
})();
