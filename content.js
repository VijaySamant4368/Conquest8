(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const RUNTIME_ID = '__goldbeard_hunt__';
  let lastHref = location.href;
  let scheduledRender = null;

  const HINTS = {
    letter: {
      title: '2 · Letter of Marque',
      html: `
        <p><strong>Hint:</strong> “The King’s ink is dry, but the pirate’s code is written in salt. Before ye hunt for Goldbeard, ye must learn the Rules of the Coast. Break 'em, and walk the plank!”</p>
      `
    },

    pirateCode: {
      title: '3 · Pirate Code',
      html: `
        <p><strong>Hint:</strong> Tides rise and they fall:</p>
        <ul>
          <li>who makes them do this</li>
          <li>what are its <strong>phases</strong></li>
          <li>who is their <strong>tracker</strong></li>
        </ul>
        <p>Each line conceals a piece that makes a phrase worth a hunt.</p>
      `
    },

    moonPhase: {
      title: '4 · Moon Phase Tracker',
      html: `
        <p><strong>Hint:</strong> “The tide is high and the spirits are restless. Goldbeard’s navigator died at Latitude <strong>51.4212</strong>, Longitude <strong>0.7223</strong>. Search the map for the devil’s coordinates!”</p>
      `
    },

    deadmansIsland: {
      title: '5 · Deadman’s Island',
      html: `
        <p><strong>Hint:</strong> Ye found the right devil’s coordinates. Check <strong>Shepherd’s Creek</strong></p>
      `
    },

    shepherdsCreek: {
      title: '6 · Shepherds Creek',
      html: `
        <p><strong>Hint:</strong> “Ye found the creek where the bodies were buried, but the tide has washed away the marks. The local Graveyard holds the names the sea couldn't keep. Find the stone of the one-eyed quartermaster!”</p>
      `
    },

    goldbeardNextHint: {
      title: '7 · Goldbeard’s Next Hint',
      html: `
        <p><strong>Hint:</strong> “The One-Eyed Quartermaster took the secret to his grave, but he left his ‘Eye’ behind. Look closely at the stone... he isn't buried facing East. He’s staring at the Monocular on the horizon where the fires of war never go out.”</p>
      `
    },

    finale: {
      heading: '🏴‍☠️ Arrr, we be arrivin’ in the Pirate Island at last, matey!!',
      body: `
        The monocular reveals the last secret: a tropical island split by endless war,
        one side glowing red, the other blue. Goldbeard’s trail is complete.
      `
    }
  };

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function normalizeText(text = '') {
    return decodeURIComponent(String(text))
      .toLowerCase()
      .replace(/\+/g, ' ')
      .replace(/[′’]/g, "'")
      .replace(/[″“”]/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pageTextSample() {
    return normalizeText(
      [
        document.title || '',
        document.body?.innerText?.slice(0, 4000) || ''
      ].join(' ')
    );
  }

  function urlText(url = new URL(location.href)) {
    return normalizeText(
      [
        url.href,
        url.hash,
        ...Array.from(url.searchParams.entries()).flat()
      ].join(' ')
    );
  }

  function isExactDeadmanCoords(url = new URL(location.href)) {
    const text = urlText(url);
    const page = pageTextSample();
    const combined = `${text} ${page}`;

    const exactDmsPatterns = [
      /51°\s*25'\s*16\.3"\s*n[\s,]*0°\s*43'\s*20\.3"\s*e/,
      /51\s*25\s*16\.3\s*n[\s,]*0\s*43\s*20\.3\s*e/,
      /51°25'16\.3"n 0°43'20\.3"e/
    ];

    return exactDmsPatterns.some((re) => re.test(combined));
  }

  function isGoogleSearchPage(url = new URL(location.href)) {
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return host.includes('google.') && path === '/search';
  }

  async function getStage() {
    try {
      const data = await api.storage.local.get(['pirateStage']);
      return data.pirateStage || 1;
    } catch {
      return 1;
    }
  }

  async function setStage(stage) {
    try {
      await api.storage.local.set({ pirateStage: stage });
    } catch {}
  }

  async function getFlags() {
    try {
      const data = await api.storage.local.get(['letterHintShown']);
      return {
        letterHintShown: Boolean(data.letterHintShown)
      };
    } catch {
      return {
        letterHintShown: false
      };
    }
  }

  async function setFlags(patch) {
    try {
      await api.storage.local.set(patch);
    } catch {}
  }

  async function advanceIf(expectedCurrentStage, nextStage) {
    const current = await getStage();
    if (current === expectedCurrentStage) {
      await setStage(nextStage);
      return nextStage;
    }
    return current;
  }

  async function ensureStage(minStage, targetStage) {
    const current = await getStage();
    if (current < minStage) return current;
    if (current < targetStage) {
      await setStage(targetStage);
      return targetStage;
    }
    return current;
  }

  function ensureStyle() {
    if (document.getElementById(`${RUNTIME_ID}-style`)) return;

    const style = document.createElement('style');
    style.id = `${RUNTIME_ID}-style`;
    style.textContent = `
      #${RUNTIME_ID}-panel {
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: min(360px, calc(100vw - 32px));
        z-index: 2147483646;
        background: rgba(34, 24, 10, 0.94);
        color: #f6ecd3;
        border: 1px solid rgba(220, 173, 86, 0.5);
        border-radius: 18px;
        box-shadow: 0 14px 50px rgba(0,0,0,.4);
        font-family: Georgia, serif;
        overflow: hidden;
        backdrop-filter: blur(6px);
      }

      #${RUNTIME_ID}-panel .gh-head {
        padding: 10px 14px;
        background: linear-gradient(90deg, #68451a, #a7742f);
        color: #201304;
        font-weight: 700;
        font-size: 14px;
        letter-spacing: .04em;
      }

      #${RUNTIME_ID}-panel .gh-body {
        padding: 14px;
        line-height: 1.45;
        font-size: 15px;
      }

      #${RUNTIME_ID}-panel .gh-body p {
        margin: 0 0 10px;
      }

      #${RUNTIME_ID}-panel .gh-body ul {
        margin: 0 0 10px 18px;
        padding: 0;
      }

      #${RUNTIME_ID}-panel .gh-body li {
        margin-bottom: 6px;
      }

      .${RUNTIME_ID}-spotlight {
        outline: 4px solid rgba(255, 195, 85, .95) !important;
        outline-offset: 4px !important;
        border-radius: 12px !important;
        background: rgba(255, 235, 150, .12) !important;
        box-shadow: 0 0 0 4px rgba(255, 195, 85, .35), 0 0 28px rgba(255,195,85,.45) !important;
        position: relative !important;
        z-index: 2147483645 !important;
      }

      .${RUNTIME_ID}-spotlight > * {
        background: transparent !important;
      }

      .${RUNTIME_ID}-goldbeard-inline {
        box-shadow: 0 0 0 3px rgba(255, 195, 85, .25);
        background: rgba(255, 245, 210, .45);
      }

      .${RUNTIME_ID}-goldbeard-inline .pic-wrapper {
        margin: 0;
      }

      .${RUNTIME_ID}-goldbeard-button {
        display: block;
        width: 72px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
      }

      .${RUNTIME_ID}-goldbeard-button img {
        display: block;
        width: 100%;
        height: auto;
        border-radius: 8px;
        box-shadow: 0 0 0 3px rgba(255, 195, 85, .45), 0 8px 24px rgba(0,0,0,.25);
      }

      .${RUNTIME_ID}-goldbeard-button:focus {
        outline: 3px solid rgba(255, 195, 85, .75);
        outline-offset: 2px;
        border-radius: 10px;
      }

      .${RUNTIME_ID}-goldbeard-name {
        font-weight: 700;
      }

      #${RUNTIME_ID}-letter-trigger {
        display: inline-block;
        margin: 12px 0;
        padding: 10px 14px;
        border: 0;
        border-radius: 10px;
        background: #d6a74d;
        color: #241200;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,.18);
        font-family: Georgia, serif;
      }

      #${RUNTIME_ID}-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: rgba(4, 7, 10, .88);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

      #${RUNTIME_ID}-modal .gh-stage {
        width: min(980px, 100%);
        background: linear-gradient(180deg, #0d1622, #081018);
        border-radius: 28px;
        border: 1px solid rgba(255,255,255,.08);
        padding: 28px;
        color: #fff4d4;
        box-shadow: 0 20px 70px rgba(0,0,0,.55);
        text-align: center;
      }

      #${RUNTIME_ID}-modal h2 {
        margin: 0 0 10px;
        font-size: clamp(28px, 4vw, 48px);
      }

      #${RUNTIME_ID}-modal p {
        margin: 0 auto 18px;
        max-width: 700px;
        line-height: 1.5;
        color: #ecdcb1;
        font-size: 18px;
      }

      #${RUNTIME_ID}-modal .gh-lens {
        width: min(70vw, 520px);
        aspect-ratio: 1 / 1;
        border-radius: 50%;
        margin: 20px auto 24px;
        position: relative;
        overflow: hidden;
        border: 10px solid #0e0d0c;
        box-shadow: inset 0 0 0 8px rgba(255,255,255,.07), 0 18px 40px rgba(0,0,0,.5);
        background:
          linear-gradient(90deg, rgba(31,69,170,.85) 0 47%, rgba(255,95,0,.9) 53% 100%),
          linear-gradient(180deg, rgba(255,255,255,.35), transparent 30%);
      }

      #${RUNTIME_ID}-modal .gh-lens:before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 50% 12%, rgba(255,255,255,.9), transparent 18%),
          linear-gradient(180deg, rgba(6,9,22,.1), rgba(6,9,22,.6) 64%, rgba(3,4,9,.9)),
          radial-gradient(circle at 50% 72%, rgba(255,120,40,.8), transparent 16%);
      }

      #${RUNTIME_ID}-modal .gh-island {
        position: absolute;
        left: 50%;
        bottom: 17%;
        transform: translateX(-50%);
        width: 68%;
        height: 28%;
        background: #111;
        clip-path: polygon(0 90%, 5% 70%, 16% 64%, 24% 44%, 36% 34%, 44% 10%, 52% 28%, 60% 20%, 70% 42%, 83% 55%, 92% 72%, 100% 88%, 100% 100%, 0 100%);
        box-shadow: 0 -15px 36px rgba(0,0,0,.25);
      }

      #${RUNTIME_ID}-modal .gh-fire {
        position: absolute;
        left: 50%;
        bottom: 40%;
        transform: translateX(-50%);
        width: 12%;
        height: 28%;
        background: linear-gradient(180deg, rgba(255,250,180,.95), rgba(255,110,0,.92) 58%, rgba(255,30,0,.0));
        filter: blur(4px);
        clip-path: polygon(50% 0, 66% 24%, 77% 50%, 60% 100%, 50% 88%, 40% 100%, 25% 54%, 34% 24%);
      }

      #${RUNTIME_ID}-modal .gh-stars {
        position: absolute;
        inset: 0;
        background-image:
          radial-gradient(circle at 18% 22%, rgba(255,255,255,.9) 0 1px, transparent 2px),
          radial-gradient(circle at 28% 35%, rgba(255,255,255,.8) 0 1px, transparent 2px),
          radial-gradient(circle at 76% 20%, rgba(255,255,255,.9) 0 1px, transparent 2px),
          radial-gradient(circle at 83% 30%, rgba(255,255,255,.8) 0 1px, transparent 2px),
          radial-gradient(circle at 67% 12%, rgba(255,255,255,.8) 0 1px, transparent 2px);
      }

      #${RUNTIME_ID}-modal .gh-close {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        background: #d6a74d;
        color: #241200;
        font-weight: 700;
        cursor: pointer;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function clearPrevious() {
    qs(`#${RUNTIME_ID}-panel`)?.remove();
    qsa(`.${RUNTIME_ID}-spotlight`).forEach((el) => el.classList.remove(`${RUNTIME_ID}-spotlight`));
  }

  function clearSpotlights() {
    qsa(`.${RUNTIME_ID}-spotlight`).forEach((el) => el.classList.remove(`${RUNTIME_ID}-spotlight`));
  }

  function createPanel(pageLabel, html) {
    qs(`#${RUNTIME_ID}-panel`)?.remove();
    ensureStyle();

    const panel = document.createElement('div');
    panel.id = `${RUNTIME_ID}-panel`;
    panel.innerHTML = `
      <div class="gh-head">☠ ${pageLabel}</div>
      <div class="gh-body">${html}</div>
    `;
    document.body.appendChild(panel);
  }

  function showHint(key) {
    const hint = HINTS[key];
    if (!hint) return;
    createPanel(hint.title, hint.html);
  }

  function findVisibleGoogleResultContainer(link) {
    if (!link) return null;

    const candidates = [];
    let el = link;

    while (el && el !== document.body) {
      candidates.push(el);
      el = el.parentElement;
    }

    for (const node of candidates) {
      const rect = node.getBoundingClientRect?.();
      if (!rect) continue;

      const looksVisible =
        rect.width > 200 &&
        rect.height > 40 &&
        getComputedStyle(node).display !== 'inline';

      const looksLikeResult =
        node.querySelector?.('h3') ||
        node.matches?.('.g, .MjjYud, .tF2Cxc, [data-hveid], div[jscontroller], div[data-ved]');

      if (looksVisible && looksLikeResult) {
        return node;
      }
    }

    return link.closest('div') || link;
  }

  function findMatchingGoogleResult(kind) {
    const links = qsa('a[href]');

    for (const a of links) {
      const rawHref = a.getAttribute('href') || '';
      const fullHref = a.href || '';
      const text = normalizeText(a.textContent || '');

      const tshaMatch =
        kind === 'tsha' &&
        (
          /tshaonline\.org/i.test(rawHref) ||
          /tshaonline\.org/i.test(fullHref) ||
          /shepherds-creek/i.test(rawHref) ||
          /shepherds-creek/i.test(fullHref) ||
          /texas state historical association/i.test(text)
        );

      const graveMatch =
        kind === 'grave' &&
        (
          /findagrave\.com/i.test(rawHref) ||
          /findagrave\.com/i.test(fullHref) ||
          /shepherds-creek-cemetery/i.test(rawHref) ||
          /shepherds-creek-cemetery/i.test(fullHref) ||
          /find a grave/i.test(text)
        );

      if (!tshaMatch && !graveMatch) continue;

      const container = findVisibleGoogleResultContainer(a);
      if (container) return container;
    }

    return null;
  }

  function highlightGoogleResultForTSHA() {
    const target = findMatchingGoogleResult('tsha');
    if (!target) return false;
    clearSpotlights();
    target.classList.add(`${RUNTIME_ID}-spotlight`);
    return true;
  }

  function highlightFindAGraveResult() {
    const target = findMatchingGoogleResult('grave');
    if (!target) return false;
    clearSpotlights();
    target.classList.add(`${RUNTIME_ID}-spotlight`);
    return true;
  }

  function buildGoldbeardRow() {
    const row = document.createElement('div');
    row.className = `memorial-item row border-bottom align-items-start align-items-md-center py-2 ${RUNTIME_ID}-goldbeard-inline`;
    row.id = `${RUNTIME_ID}-goldbeard-inline`;
    row.innerHTML = `
      <div class="memorial-item-pic col-auto">
        <figure class="pic-wrapper">
          <button class="${RUNTIME_ID}-goldbeard-button" type="button" aria-label="Reveal next hint">
            <img src="${api.runtime.getURL('assets/goldbeard.webp')}" alt="Goldbeard">
          </button>
        </figure>
      </div>
      <div class="col ps-2">
        <div class="memorial-item---grave">
          <strong class="h5 fw-normal ${RUNTIME_ID}-goldbeard-name">Goldbeard</strong>
        </div>
      </div>
      <div class="col-6 offset-5 offset-md-0 col-md-auto text-muted text-md-end p-0 pe-md-2"></div>
    `;
    return row;
  }

  function findFindAGraveListContainer() {
    const selectors = [
      '.overview-col.nearby-cemeteries.container-fluid',
      '.overview-col.nearby-cemeteries',
      '.nearby-cemeteries.container-fluid',
      '.nearby-cemeteries',
      '[class*="nearby-cemeteries"]'
    ];

    for (const selector of selectors) {
      const el = qs(selector);
      if (el) return el;
    }

    return null;
  }

  function insertGoldbeardRow(container, onClick) {
    if (!container) return false;

    const existing = qs(`#${RUNTIME_ID}-goldbeard-inline`, container);
    if (existing) return true;

    const row = buildGoldbeardRow();
    const firstItem = qs('.memorial-item', container);

    const btn = qs(`.${RUNTIME_ID}-goldbeard-button`, row);
    btn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await setStage(9);
      onClick?.();
    });

    if (firstItem) {
      container.insertBefore(row, firstItem);
    } else {
      container.appendChild(row);
    }

    return true;
  }

  function retryAddGoldbeardInline(onClick, attempts = 24, delay = 500) {
    let tries = 0;

    const tick = () => {
      const container = findFindAGraveListContainer();
      const inserted = insertGoldbeardRow(container, onClick);

      if (inserted || tries >= attempts) return;
      tries += 1;
      setTimeout(tick, delay);
    };

    tick();
  }

  function openFinale() {
    if (qs(`#${RUNTIME_ID}-modal`)) return;

    ensureStyle();

    const modal = document.createElement('div');
    modal.id = `${RUNTIME_ID}-modal`;
    modal.innerHTML = `
      <div class="gh-stage">
        <h2>${HINTS.finale.heading}</h2>
        <p>${HINTS.finale.body}</p>
        <div class="gh-lens">
          <div class="gh-stars"></div>
          <div class="gh-fire"></div>
          <div class="gh-island"></div>
        </div>
        <button class="gh-close">Close</button>
      </div>
    `;

    qs('.gh-close', modal)?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
  }

  function setupLetterClickTarget(letterHintShown) {
    const container =
      qs('.infobox') ||
      qs('.mw-parser-output') ||
      qs('#mw-content-text') ||
      qs('#content') ||
      document.body;

    if (!container) return;

    let btn = qs(`#${RUNTIME_ID}-letter-trigger`);

    if (!btn) {
      btn = document.createElement('button');
      btn.id = `${RUNTIME_ID}-letter-trigger`;
      btn.type = 'button';
      btn.textContent = 'Open Letter';

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        showHint('letter');
        await setFlags({ letterHintShown: true });
      });

      container.prepend(btn);
    }

    if (letterHintShown) {
      showHint('letter');
    }
  }

  function setupMonocularClickTarget() {
    const img =
      qs('.infobox img') ||
      qs('.thumb img') ||
      qsa('img').find((el) => normalizeText(el.alt).includes('monocular')) ||
      qsa('img').find((el) => normalizeText(el.src).includes('monocular'));

    if (!img || img.dataset.goldbeardReady) return;

    img.dataset.goldbeardReady = '1';
    const clickable = img.closest('a') || img;
    clickable.style.cursor = 'pointer';

    clickable.addEventListener(
      'click',
      async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await setStage(10);
        openFinale();
      },
      true
    );
  }

  function matchers(url = new URL(location.href)) {
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    return {
      letter: host.includes('wikipedia.org') && path.includes('/wiki/letter_of_marque'),
      pirateCode: host.includes('wikipedia.org') && path.includes('/wiki/pirate_code'),
      moonPhase: host.includes('timeanddate.com') && path.includes('/moon'),
      googleCoordsPage:
        host.includes('google.') &&
        (path === '/search' || path.includes('/maps')) &&
        isExactDeadmanCoords(url),
      googleSearchPage:
        host.includes('google.') && path === '/search',
      tshaShepherds:
        host.includes('tshaonline.org') &&
        path.includes('/handbook/entries/shepherds-creek'),
      findagrave:
        host.includes('findagrave.com') &&
        path.includes('/cemetery/2721995/shepherds-creek-cemetery'),
      monocular:
        host.includes('wikipedia.org') &&
        path.includes('/wiki/monocular')
    };
  }

  async function render() {
    if (
      !document.body ||
      location.protocol.startsWith('moz-extension') ||
      location.protocol.startsWith('chrome-extension')
    ) {
      return;
    }

    ensureStyle();
    clearPrevious();

    const m = matchers();
    let stage = await getStage();
    const flags = await getFlags();

    if (m.letter) {
      if (stage !== 2) return;
      setupLetterClickTarget(flags.letterHintShown);
      return;
    }

    if (m.pirateCode) {
      if (stage !== 2 || !flags.letterHintShown) return;
      showHint('pirateCode');
      await setStage(3);
      await setFlags({ letterHintShown: false });
      return;
    }

    if (m.moonPhase) {
      stage = await advanceIf(3, 4);
      if (stage !== 4) return;
      showHint('moonPhase');
      return;
    }

    if (m.googleCoordsPage) {
      stage = await advanceIf(4, 5);
      if (stage !== 5) return;
      showHint('deadmansIsland');
      return;
    }

    if (m.googleSearchPage) {
      if (stage >= 7 && highlightFindAGraveResult()) return;
      if (stage >= 5 && highlightGoogleResultForTSHA()) return;
      return;
    }

    if (m.tshaShepherds) {
      stage = await ensureStage(5, 7);
      if (stage < 7) return;
      showHint('shepherdsCreek');
      return;
    }

    if (m.findagrave) {
      stage = await ensureStage(7, 9);
      if (stage < 9) return;

      retryAddGoldbeardInline(() => {
        showHint('goldbeardNextHint');
      });

      return;
    }

    if (m.monocular) {
      if (stage < 9) return;
      await ensureStage(9, 10);
      setupMonocularClickTarget();
    }
  }

  function scheduleRender(delay = 120) {
    clearTimeout(scheduledRender);
    scheduledRender = setTimeout(() => {
      render().catch(() => {});
    }, delay);
  }

  function boot() {
    scheduleRender(0);
  }

  const observer = new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      scheduleRender(250);
      return;
    }

    if (isGoogleSearchPage(new URL(location.href))) {
      scheduleRender(150);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      boot();
      return;
    }

    if (isGoogleSearchPage(new URL(location.href))) {
      scheduleRender(250);
    }
  }, 1000);
})();