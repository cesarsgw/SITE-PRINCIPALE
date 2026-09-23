// Compteur « Menaces actives · FR » du header.
// Lit le JSON publié par .github/workflows/compteur-menaces.yml (source : abuse.ch URLhaus).
// N'affiche jamais de chiffre inventé : en cas d'erreur, de format inattendu ou de donnée
// trop ancienne, le compteur affiche « Données indisponibles ».
(function(){
  const el = document.querySelector('[data-threat-counter]');
  if (!el) return;

  const ENDPOINT = el.getAttribute('data-endpoint');
  const POLL_MS = 45 * 1000;              // relecture toutes les 45 s
  const STALE_MS = 2 * 60 * 60 * 1000;    // au-delà de 2 h sans mise à jour : indisponible
  const LIVE_MS = 15 * 60 * 1000;         // « en direct » seulement si la source est temps réel ET fraîche

  const lang = document.documentElement.lang === 'en' ? 'en' : 'fr';
  const T = {
    fr: { unavailable: 'Données indisponibles', updated: 'Mise à jour', added: 'ajoutées en 24 h' },
    en: { unavailable: 'Data unavailable', updated: 'Updated', added: 'added in 24 h' }
  }[lang];
  const locale = lang === 'en' ? 'en-GB' : 'fr-FR';
  const fmt = new Intl.NumberFormat(locale);

  const valueEl = el.querySelector('.tc-value');
  const liveEl = el.querySelector('.tc-live');
  const metaEl = el.querySelector('.tc-meta');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let shown = null;
  let anim = null;

  function setUnavailable(){
    if (anim) cancelAnimationFrame(anim);
    shown = null;
    el.classList.remove('is-loading', 'is-live', 'is-ok');
    el.classList.add('is-unavailable');
    valueEl.textContent = T.unavailable;
    liveEl.hidden = true;
    metaEl.textContent = '';
  }

  function animateTo(target){
    if (anim) cancelAnimationFrame(anim);
    if (shown === null || reduceMotion){
      valueEl.textContent = fmt.format(target);
      shown = target;
      return;
    }
    if (shown === target) return;
    const from = shown;
    const start = performance.now();
    const duration = 900;
    el.classList.remove('tc-bump');
    void el.offsetWidth; // relance l'animation CSS
    el.classList.add('tc-bump');
    (function step(now){
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      valueEl.textContent = fmt.format(Math.round(from + (target - from) * eased));
      if (t < 1) anim = requestAnimationFrame(step);
    })(start);
    shown = target;
  }

  function render(data){
    const updated = Date.parse(data && data.updatedAt);
    const valid = data && data.ok === true
      && Number.isInteger(data.value) && data.value >= 0
      && Number.isFinite(updated);
    if (!valid || Date.now() - updated > STALE_MS){
      setUnavailable();
      return;
    }
    el.classList.remove('is-loading', 'is-unavailable');
    el.classList.add('is-ok');
    animateTo(data.value);

    const live = data.realtime === true && Date.now() - updated < LIVE_MS;
    liveEl.hidden = !live;
    el.classList.toggle('is-live', live);

    const when = new Date(updated).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    let meta = `${T.updated} : ${when}`;
    if (Number.isInteger(data.added24h)) meta += ` · +${fmt.format(data.added24h)} ${T.added}`;
    metaEl.textContent = meta;
  }

  async function refresh(){
    if (!ENDPOINT){ setUnavailable(); return; }
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      render(await res.json());
    } catch (err) {
      setUnavailable();
    }
  }

  let timer = null;
  function start(){ if (!timer){ refresh(); timer = setInterval(refresh, POLL_MS); } }
  function stop(){ clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  start();
})();
