// Inscription newsletter MGC (Brevo, double opt-in).
// Le formulaire n'envoie l'adresse qu'à l'API newsletter (data-endpoint) ; aucune clé Brevo côté navigateur.
(function(){
  const form = document.getElementById('newsletterForm');
  if (!form) return;

  const endpoint = (form.getAttribute('data-endpoint') || '').trim();
  const lang = document.documentElement.lang === 'en' ? 'en' : 'fr';
  const M = {
    fr: {
      submit: "S'inscrire",
      sending: 'Inscription…',
      invalid: "Cette adresse email n'est pas valide.",
      consent: 'Merci de cocher la case pour accepter de recevoir la newsletter.',
      pending: "Merci ! Un email de confirmation vient de vous être envoyé. Cliquez sur le lien qu'il contient pour valider votre inscription.",
      already: 'Cette adresse est déjà inscrite à la newsletter MGC.',
      confirmed: 'Votre inscription est confirmée. Bienvenue dans la newsletter MGC !',
      unavailable: "L'inscription à la newsletter est momentanément indisponible. Merci de réessayer plus tard.",
      error: "L'inscription a échoué. Merci de réessayer dans quelques instants."
    },
    en: {
      submit: 'Subscribe',
      sending: 'Subscribing…',
      invalid: 'This email address is not valid.',
      consent: 'Please tick the box to agree to receive the newsletter.',
      pending: 'Thank you! A confirmation email has just been sent. Click the link inside to confirm your subscription.',
      already: 'This address is already subscribed to the MGC newsletter.',
      confirmed: 'Your subscription is confirmed. Welcome to the MGC newsletter!',
      unavailable: 'Newsletter sign-up is temporarily unavailable. Please try again later.',
      error: 'Sign-up failed. Please try again in a few moments.'
    }
  }[lang];

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const emailEl = document.getElementById('newsletterEmail');
  const consentEl = document.getElementById('newsletterConsent');
  const honeypotEl = document.getElementById('newsletterWebsite');
  const btn = document.getElementById('newsletterBtn');
  const statusEl = document.getElementById('newsletterStatus');
  const startedAt = Date.now();

  function show(message, kind){
    statusEl.textContent = message;
    statusEl.className = 'newsletter-status' + (message ? ' is-' + kind : '');
  }
  function setInvalid(el, invalid){
    el.classList.toggle('is-invalid', invalid);
    el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }

  // Retour depuis le lien de l'email de confirmation (redirection Brevo)
  const flag = new URLSearchParams(location.search).get('newsletter');
  if (flag === 'confirmee' || flag === 'confirmed') show(M.confirmed, 'success');

  emailEl.addEventListener('input', () => { if (emailEl.classList.contains('is-invalid')) setInvalid(emailEl, false); });
  consentEl.addEventListener('change', () => { if (consentEl.checked) setInvalid(consentEl, false); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailEl.value.trim();

    if (email.length > 254 || !EMAIL_PATTERN.test(email)){
      setInvalid(emailEl, true);
      show(M.invalid, 'error');
      emailEl.focus();
      return;
    }
    setInvalid(emailEl, false);
    if (!consentEl.checked){
      setInvalid(consentEl, true);
      show(M.consent, 'error');
      consentEl.focus();
      return;
    }
    if (!endpoint){
      show(M.unavailable, 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = M.sending;
    show('', '');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent: true, lang, website: honeypotEl.value, elapsed: Date.now() - startedAt })
      });
      let data = {};
      try { data = await res.json(); } catch (err) { /* réponse non JSON : traitée comme une erreur */ }
      switch (data.status){
        case 'pending': show(M.pending, 'success'); form.reset(); break;
        case 'already_subscribed': show(M.already, 'info'); break;
        case 'invalid_email': setInvalid(emailEl, true); show(M.invalid, 'error'); break;
        case 'consent_required': setInvalid(consentEl, true); show(M.consent, 'error'); break;
        default: show(M.error, 'error');
      }
    } catch (err) {
      show(M.error, 'error');
    }
    btn.disabled = false;
    btn.textContent = M.submit;
  });
})();
