// pwa.js - installable app: service worker, Install button, home-screen shortcuts
// Game data stays in localStorage exactly as before; nothing here reads or writes it.

const pwa = {
  deferredPrompt: null, // Android / desktop Chrome & Edge install prompt
  registration: null
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true; // iPhone / iPad home-screen app
}

function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function updateInstallButtons() {
  const installed = isStandalone();
  document.documentElement.classList.toggle('is-standalone', installed);
  const headerBtn = document.getElementById('btnInstall');
  const menuItem = document.getElementById('menuInstallItem');
  // header button: only when the browser offers a one-tap install, or on iPhone/iPad
  if (headerBtn) headerBtn.classList.toggle('d-none', installed || !(pwa.deferredPrompt || isIOS()));
  // menu item: always available until the app is installed
  if (menuItem) menuItem.classList.toggle('d-none', installed);
}

function showInstallHelp() {
  const ios = isIOS();
  document.getElementById('installStepsIOS').classList.toggle('d-none', !ios);
  document.getElementById('installStepsOther').classList.toggle('d-none', ios);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalInstall')).show();
}

async function promptInstall() {
  if (!pwa.deferredPrompt) { showInstallHelp(); return; }
  const promptEvent = pwa.deferredPrompt;
  pwa.deferredPrompt = null; // a prompt can only be used once
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice && choice.outcome === 'accepted') showToast('Installing Points Game…');
  } catch (e) {
    showInstallHelp();
  }
  updateInstallButtons();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // show our own Install button instead of the browser's mini bar
  pwa.deferredPrompt = e;
  updateInstallButtons();
});

window.addEventListener('appinstalled', () => {
  pwa.deferredPrompt = null;
  updateInstallButtons();
  showToast('Points Game installed — open it from your home screen');
});

window.addEventListener('offline', () => {
  showToast('You are offline — the app keeps working and saves on this device');
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    pwa.registration = reg;
    const announce = (worker) => {
      worker.addEventListener('statechange', () => {
        // a newer version is ready while this one is running: reuse the existing Update bar
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          document.getElementById('updateBar').classList.remove('d-none');
        }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) document.getElementById('updateBar').classList.remove('d-none');
    reg.addEventListener('updatefound', () => { if (reg.installing) announce(reg.installing); });
    // look for a new version when the app comes back to the screen
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(err => console.warn('Service worker not registered:', err));
}

// Opening a home-screen shortcut (?tab=ranking etc.) selects that tab.
function openTabFromUrl() {
  const tab = new URLSearchParams(location.search).get('tab');
  const btn = tab && document.getElementById('tab-' + tab.replace(/[^a-z]/g, ''));
  if (btn) bootstrap.Tab.getOrCreateInstance(btn).show();
}

// Hard refresh: drop the cached app files and the service worker, then load everything
// fresh from the network. Games and backups live in localStorage and are not touched.
async function hardRefresh() {
  if (!confirm('Reload the app files fresh from the internet?\n\nYour games, players and backups stay on this device — only the app\'s cached files are cleared.')) return;
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith('points-game-')).map(k => caches.delete(k)));
    }
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) { /* reload anyway */ }
  const url = new URL(location.href);
  url.searchParams.set('v', Date.now());
  location.replace(url.toString());
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnInstall').addEventListener('click', promptInstall);
  document.getElementById('btnInstallMenu').addEventListener('click', promptInstall);
  document.getElementById('btnHardRefresh').addEventListener('click', hardRefresh);
  // Update with a new service worker waiting: switch to it first and reload once it has
  // taken over, instead of reloading while it is still activating. Capture phase so this
  // runs before the plain reload handler in main.js (used when no worker is waiting).
  document.getElementById('btnReloadApp').addEventListener('click', (ev) => {
    const waiting = pwa.registration && pwa.registration.waiting;
    if (!waiting || !navigator.serviceWorker.controller) return;
    ev.stopImmediatePropagation();
    let done = false;
    const reload = () => {
      if (done) return;
      done = true;
      const url = new URL(location.href);
      url.searchParams.set('v', Date.now());
      location.replace(url.toString());
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    setTimeout(reload, 3000); // safety net if the switch is slow
    waiting.postMessage('SKIP_WAITING');
  }, { capture: true });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', updateInstallButtons);
  updateInstallButtons();
  openTabFromUrl();
  registerServiceWorker();
});
