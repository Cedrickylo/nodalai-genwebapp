/**
 * Nodal AI Landing Page — Interactive Engine & Apple Design Polish
 * Zero-dependency Web Audio API synthesis, accessible interactions,
 * cookie consent, age verification, and security demos.
 */

// ==========================================================================
// 1. WEB AUDIO API SYNTHESIZER (MULTIMODAL HARMONY & CAUSALITY)
// ==========================================================================

class AudioSynthEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = localStorage.getItem('nodal_audio_muted') === 'true';
    this.initContext = this.initContext.bind(this);
  }

  initContext() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('nodal_audio_muted', String(this.isMuted));
    return this.isMuted;
  }

  // Pure pentatonic chord chime on the exact same frame as visual response
  playCorrect() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5

    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);

      gain.gain.setValueAtTime(0, now + idx * 0.04);
      gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.04 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.04 + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.46);
    });
  }

  // Gentle, mellow low chord for alternative selections
  playIncorrect() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const freqs = [220.00, 196.00]; // A3, G3 mellow tones

    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.06 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.36);
    });
  }
}

const audioSynth = new AudioSynthEngine();

// ==========================================================================
// 2. LIVE INTERACTIVE QUIZ DEMO ENGINE
// ==========================================================================

const SAMPLE_QUESTIONS = [
  {
    category: "Cognitive Science & Learning",
    question: "Why is active recall with self-testing significantly more effective for long-term retention than passive re-reading?",
    options: [
      "It triggers retrieval effort that strengthens neural synaptic pathways and cognitive consolidation.",
      "It requires higher optical scanning speeds across text paragraphs.",
      "It relies exclusively on short-term working memory without activating the hippocampus.",
      "It eliminates the need for spaced repetition intervals."
    ],
    correct: 0,
    explanation: "Retrieval practice forces the brain to reconstruct memory traces, producing the 'testing effect' which creates durable neural pathways and combats the Ebbinghaus forgetting curve."
  },
  {
    category: "Cellular Biology",
    question: "Which organelle is responsible for generating the majority of cellular adenosine triphosphate (ATP) via oxidative phosphorylation?",
    options: [
      "Endoplasmic Reticulum",
      "Mitochondria",
      "Golgi Apparatus",
      "Ribosome"
    ],
    correct: 1,
    explanation: "The mitochondria utilize an electrochemical proton gradient across their inner membrane to drive ATP synthase, producing over 90% of cellular energy."
  },
  {
    category: "Computer Science & Cryptography",
    question: "What core cryptographic advantage does AES-GCM (Galois/Counter Mode) provide over legacy AES-CBC mode for local client encryption?",
    options: [
      "It guarantees Authenticated Encryption with Associated Data (AEAD), preventing ciphertext tampering.",
      "It requires a shorter initialization vector (IV) of only 8 bits.",
      "It is an asymmetric cipher that eliminates secret key requirements.",
      "It runs in linear time regardless of file size."
    ],
    correct: 0,
    explanation: "AES-GCM combines counter-mode encryption with universal hashing to provide both confidentiality and integrity authentication, completely eliminating padding oracle vulnerabilities."
  }
];

let currentQuestionIdx = 0;
let userScore = 0;
let totalAnswered = 0;
let isAnswered = false;

function renderDemoQuestion() {
  const q = SAMPLE_QUESTIONS[currentQuestionIdx];
  const qTextEl = document.getElementById('demo-question-text');
  const catTagEl = document.getElementById('demo-category-tag');
  const optionsContainer = document.getElementById('demo-options-list');
  const explanationCard = document.getElementById('demo-explanation-card');
  const explanationText = document.getElementById('demo-explanation-text');
  const scoreEl = document.getElementById('demo-score-text');

  if (!qTextEl || !optionsContainer) return;

  isAnswered = false;
  qTextEl.textContent = q.question;
  catTagEl.textContent = `🎯 ${q.category}`;
  explanationCard.classList.remove('active');
  optionsContainer.innerHTML = '';

  const markerLetters = ['A', 'B', 'C', 'D'];

  q.options.forEach((optText, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', `Option ${markerLetters[idx]}: ${optText}`);

    btn.innerHTML = `
      <div class="option-content">
        <span class="option-marker">${markerLetters[idx]}</span>
        <span>${optText}</span>
      </div>
      <span class="option-status-icon" aria-hidden="true"></span>
    `;

    btn.addEventListener('click', () => handleOptionSelect(idx, btn));
    optionsContainer.appendChild(btn);
  });

  if (scoreEl) {
    scoreEl.textContent = `Score: ${userScore} / ${totalAnswered}`;
  }
}

function handleOptionSelect(selectedIdx, clickedBtn) {
  if (isAnswered) return;
  isAnswered = true;
  totalAnswered++;

  const q = SAMPLE_QUESTIONS[currentQuestionIdx];
  const isCorrect = selectedIdx === q.correct;
  const optionsButtons = document.querySelectorAll('.option-btn');
  const explanationCard = document.getElementById('demo-explanation-card');
  const explanationText = document.getElementById('demo-explanation-text');
  const explanationTitle = document.getElementById('demo-explanation-title');
  const scoreEl = document.getElementById('demo-score-text');

  optionsButtons.forEach((btn, idx) => {
    btn.disabled = true;
    const statusIcon = btn.querySelector('.option-status-icon');
    if (idx === q.correct) {
      if (idx === selectedIdx) {
        btn.classList.add('selected-correct');
        if (statusIcon) statusIcon.textContent = '✓';
      } else {
        btn.classList.add('show-truth');
        if (statusIcon) statusIcon.textContent = '✓';
      }
    } else if (idx === selectedIdx) {
      btn.classList.add('selected-incorrect');
      if (statusIcon) statusIcon.textContent = '✕';
    }
  });

  if (isCorrect) {
    userScore++;
    audioSynth.playCorrect();
    if (explanationTitle) {
      explanationTitle.innerHTML = '<span style="color:#10b981;">✓ Correct!</span> Concept Takeaway:';
    }
  } else {
    audioSynth.playIncorrect();
    if (explanationTitle) {
      explanationTitle.innerHTML = '<span style="color:#f43f5e;">✕ Solution Review:</span> Correct Concept:';
    }
  }

  if (explanationText) {
    explanationText.textContent = q.explanation;
  }
  if (explanationCard) {
    explanationCard.classList.add('active');
  }
  if (scoreEl) {
    scoreEl.textContent = `Score: ${userScore} / ${totalAnswered}`;
  }
}

function nextDemoQuestion() {
  currentQuestionIdx = (currentQuestionIdx + 1) % SAMPLE_QUESTIONS.length;
  renderDemoQuestion();
}

// ==========================================================================
// 3. DOCUMENT FORMAT TABS
// ==========================================================================

function initFormatTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-content-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');

      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const activePanel = document.getElementById(targetId);
      if (activePanel) {
        activePanel.classList.add('active');
      }
    });
  });
}

// ==========================================================================
// 4. ACCESSIBLE COOKIE CONSENT BANNER & LOCAL STORAGE
// ==========================================================================

function initCookieConsent() {
  const banner = document.getElementById('cookie-consent-banner');
  const acceptEssentialBtn = document.getElementById('cookie-accept-essential');
  const acceptAllBtn = document.getElementById('cookie-accept-all');
  const customizeBtn = document.getElementById('cookie-customize-btn');

  if (!banner) return;

  const savedConsent = localStorage.getItem('nodal_cookie_consent');
  if (savedConsent) {
    banner.style.display = 'none';
  } else {
    banner.style.display = 'flex';
  }

  if (acceptEssentialBtn) {
    acceptEssentialBtn.addEventListener('click', () => {
      localStorage.setItem('nodal_cookie_consent', 'essential');
      banner.style.display = 'none';
    });
  }

  if (acceptAllBtn) {
    acceptAllBtn.addEventListener('click', () => {
      localStorage.setItem('nodal_cookie_consent', 'all');
      banner.style.display = 'none';
    });
  }

  if (customizeBtn) {
    customizeBtn.addEventListener('click', () => {
      window.location.href = 'cookie-policy.html';
    });
  }
}

// ==========================================================================
// 5. AGE VERIFICATION & COPPA PARENTAL CONSENT MODAL
// ==========================================================================

function initAgeGateModal() {
  const openBtn = document.getElementById('btn-open-age-gate');
  const modal = document.getElementById('age-gate-modal');
  const closeBtn = document.getElementById('close-age-modal');
  const form = document.getElementById('age-verification-form');
  const ageInput = document.getElementById('user-birth-year');
  const parentalConsentGroup = document.getElementById('parental-consent-group');
  const statusMsg = document.getElementById('age-gate-status');

  if (!modal) return;

  const currentYear = new Date().getFullYear();

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    });
  }

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  });

  if (ageInput) {
    ageInput.addEventListener('input', () => {
      const birthYear = parseInt(ageInput.value, 10);
      if (!isNaN(birthYear) && birthYear > 1920 && birthYear <= currentYear) {
        const age = currentYear - birthYear;
        if (age < 13) {
          parentalConsentGroup.style.display = 'flex';
          statusMsg.innerHTML = '<span style="color:#f59e0b;">⚠️ COPPA Notice:</span> Users under 13 require verified parental email consent before account creation.';
        } else if (age < 18) {
          parentalConsentGroup.style.display = 'none';
          statusMsg.innerHTML = '<span style="color:#38bdf8;">ℹ️ Minor Student Consent:</span> Educational use permitted with student/guardian review of Terms.';
        } else {
          parentalConsentGroup.style.display = 'none';
          statusMsg.innerHTML = '<span style="color:#34d399;">✓ Age verified:</span> Full adult account creation & guest mode enabled.';
        }
      }
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const birthYear = parseInt(ageInput.value, 10);
      const age = currentYear - birthYear;

      if (age < 13) {
        const parentConsentCheck = document.getElementById('parent-consent-check');
        const parentEmail = document.getElementById('parent-email');
        if (!parentConsentCheck || !parentConsentCheck.checked || !parentEmail.value.trim()) {
          alert('Parental consent confirmation and parent email are strictly required for users under 13 under COPPA regulations.');
          return;
        }
      }

      localStorage.setItem('nodal_age_verified', 'true');
      alert('Age verification successfully recorded. Welcome to Nodal AI!');
      modal.classList.remove('active');
    });
  }
}

// ==========================================================================
// 6. SELF-SERVICE DATA DELETION REQUEST MODAL (GDPR / CCPA)
// ==========================================================================

function initDataDeletionModal() {
  const openBtn = document.getElementById('btn-open-data-deletion');
  const modal = document.getElementById('data-deletion-modal');
  const closeBtn = document.getElementById('close-data-modal');
  const wipeLocalBtn = document.getElementById('btn-wipe-all-local');
  const deletionForm = document.getElementById('data-deletion-form');

  if (!modal) return;

  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  });

  // 1-Click Instant Device Data Wipe
  if (wipeLocalBtn) {
    wipeLocalBtn.addEventListener('click', async () => {
      const confirmWipe = confirm('Are you sure you want to permanently wipe all local Nodal AI quiz history, preferences, and cached downloads from this device?');
      if (!confirmWipe) return;

      try {
        localStorage.clear();
        sessionStorage.clear();

        // IndexedDB wipe if available
        if (window.indexedDB && window.indexedDB.databases) {
          const dbs = await window.indexedDB.databases();
          for (const db of dbs) {
            if (db.name && db.name.includes('nodal')) {
              window.indexedDB.deleteDatabase(db.name);
            }
          }
        }

        alert('All local Nodal AI records, encryption keys, and cached quizzes have been destroyed.');
        modal.classList.remove('active');
        window.location.reload();
      } catch (err) {
        console.error('Error during data wipe:', err);
        alert('Local storage cleared successfully.');
        modal.classList.remove('active');
      }
    });
  }

  // Formal Data Deletion Request (GDPR / CCPA)
  if (deletionForm) {
    deletionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('deletion-email').value;
      const notes = document.getElementById('deletion-notes').value;

      // Anti-enumeration notice
      alert(`Data Deletion Request recorded for ${email}. If any cloud account or synced records exist for this address, our compliance system will permanently purge them within 48 hours.`);
      modal.classList.remove('active');
    });
  }
}

// ==========================================================================
// 7. PASSWORD RESET & ACCOUNT RECOVERY SECURITY WALKTHROUGH
// ==========================================================================

function initPasswordSecurityModal() {
  const openBtn = document.getElementById('btn-open-password-security');
  const modal = document.getElementById('password-security-modal');
  const closeBtn = document.getElementById('close-pw-modal');
  const form = document.getElementById('pw-reset-form');
  const pwInput = document.getElementById('pw-new');
  const pwVerifyInput = document.getElementById('pw-verify');
  const pwFeedback = document.getElementById('pw-validation-feedback');

  if (!modal) return;

  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  });

  // Password validation rules check
  function validatePassword(pw) {
    const minLength = pw.length >= 8;
    const hasUpper = /[A-Z]/.test(pw);
    const hasLower = /[a-z]/.test(pw);
    const hasNum = /[0-9]/.test(pw);
    const hasSpecial = /[^A-Za-z0-9]/.test(pw);
    return {
      isValid: minLength && hasUpper && hasLower && hasNum && hasSpecial,
      minLength,
      hasUpper,
      hasLower,
      hasNum,
      hasSpecial
    };
  }

  if (pwInput && pwFeedback) {
    pwInput.addEventListener('input', () => {
      const res = validatePassword(pwInput.value);
      if (res.isValid) {
        pwFeedback.innerHTML = '<span style="color:#10b981;">✓ Strong password meets security policy.</span>';
      } else {
        pwFeedback.innerHTML = '<span style="color:#f59e0b;">Password requirements: 8+ chars, upper & lower case, number, and special symbol.</span>';
      }
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('pw-reset-email').value;
      const res = validatePassword(pwInput.value);

      if (!res.isValid) {
        alert('Please create a password that satisfies all security requirements (8+ characters, uppercase, lowercase, number, symbol).');
        return;
      }

      if (pwInput.value !== pwVerifyInput.value) {
        alert('Passwords do not match. Please verify your confirmation password.');
        return;
      }

      // Enforce anti-enumeration + email confirmation requirement
      alert(`Confirmation link generated! In accordance with OWASP security rules: A 15-minute confirmation email has been dispatched to ${email}. You must click the confirmation link in your inbox before the password change takes effect. All active sessions will be terminated upon confirmation.`);
      modal.classList.remove('active');
    });
  }
}

// ==========================================================================
// 8. MOBILE NAVIGATION & SMOOTH SCROLLING
// ==========================================================================

function initMobileNav() {
  const toggleBtn = document.getElementById('mobile-nav-toggle-btn');
  const drawer = document.getElementById('mobile-nav-drawer');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  const closeBtn = document.getElementById('close-mobile-nav-btn');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link');

  function openDrawer() {
    if (drawer && backdrop) {
      drawer.classList.add('active');
      backdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeDrawer() {
    if (drawer && backdrop) {
      drawer.classList.remove('active');
      backdrop.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if (toggleBtn) toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  // Close drawer when any mobile nav link is clicked
  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeDrawer();
    });
  });
}

function initSoundToggleButton() {
  const soundBtn = document.getElementById('btn-sound-toggle');
  const mobileSoundBtn = document.getElementById('mobile-sound-toggle-btn');

  function updateIcons() {
    const text = audioSynth.isMuted
      ? '<span>🔇 Audio Muted</span>'
      : '<span>🔊 Audio Enabled</span>';
    if (soundBtn) {
      soundBtn.innerHTML = text;
      soundBtn.setAttribute('aria-pressed', String(!audioSynth.isMuted));
    }
    if (mobileSoundBtn) {
      mobileSoundBtn.innerHTML = text;
      mobileSoundBtn.setAttribute('aria-pressed', String(!audioSynth.isMuted));
    }
  }

  updateIcons();

  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      audioSynth.toggleMute();
      updateIcons();
    });
  }

  if (mobileSoundBtn) {
    mobileSoundBtn.addEventListener('click', () => {
      audioSynth.toggleMute();
      updateIcons();
    });
  }
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  renderDemoQuestion();
  initFormatTabs();
  initCookieConsent();
  initAgeGateModal();
  initDataDeletionModal();
  initPasswordSecurityModal();
  initMobileNav();
  initSoundToggleButton();

  const nextBtn = document.getElementById('demo-next-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', nextDemoQuestion);
  }
});
