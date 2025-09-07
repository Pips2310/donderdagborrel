// v1.13 2025-08-30 — Host-paneel verwijderd; links-swipe toont kroon binnen main (zonder 3e paneel)
// v1.12 2025-08-30 — Visuele swipe-links animaties: calendar schuift weg, teksten naar links, crown schuift in met 'flikker'
// v1.10 2025-08-30 — Swipe naar host-paneel alleen als host 'Niet bekend' is; live-drag naar rechts geblokkeerd indien host bekend
// v1.9 2025-08-28 — Live drag AAN in beide richtingen (symmetrisch), consistente snap-logica (attendees↔main↔host)
// v1.7 2025-08-28 — Swipe links/rechts symmetrisch (snap); (v1.8 met no-drag is teruggedraaid)
// v1.6 2025-08-27 — overflow-hidden fix host-panel
// v1.5 2025-08-27 — compact host-paneel (voorstel B)
// v1.4 2025-08-27 — voorstel B (accent-ring + puls)
// v1.3 2025-02-25 — geschiedenis: transparante panel-bg
// v1.2 2025-02-25 — kroon in geschiedenis
const API_URL = '/api';
let gebruikersnaam = localStorage.getItem('gebruikersnaam') || '';
let userRole = localStorage.getItem('userRole') || '';
let resolveModalPromise; / Used for showConfirm modal

//** Inline attendees with "+X meer" and modal for full list */
function renderAttendeesInline(containerEl, names, opts = {}) {
  const MAX_INLINE = opts.maxInline ?? 6; / show up to 6 inline
  if (!containerEl) return;
  containerEl.innerHTML = ''; / reset

  if (!names || names.length === 0) {
    containerEl.textContent = 'Aanwezigen: Geen';
    return;
  }

  const shown = names.slice(0, MAX_INLINE);
  const rest = names.length - shown.length;

  // Base text "Aanwezigen: A, B, C"
  const base = document.createElement('span');
  base.textContent = 'Aanwezigen: ' + shown.join(', ');
  containerEl.appendChild(base);

  // “+X meer” button (if needed)
  if (rest > 0) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ml-1 underline text-blue-600 hover:text-blue-700';
    btn.textContent = `+${rest} meer`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showAttendeesModal(names);
    });
    btn.addEventListener('mousedown', (e) => e.stopPropagation());

    containerEl.appendChild(btn);
  }
}

//** Render names-only for attendee panel with a single “+X meer” button (no duplicate) */
function renderAttendeePanelNames(targetEl, names, opts = {}) {
  if (!targetEl) return;
  targetEl.innerHTML = '';

  const allNames = Array.isArray(names) ? names.slice() : [];
  const isMobile = (opts.forceMobile === true) || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 639px)').matches);

  if (isMobile) {
    // ===== MOBILE: 3 rijen × 3 kolommen, laatste cel = +X meer =====
    const rows = opts.rows ?? 3;
    const cols = opts.cols ?? 3;
    const MAX_CELLS = opts.maxCells ?? (rows * cols); / standaard 9

    const list = document.createElement('ul');
    list.className = 'attendee-grid';

    if (allNames.length === 0) {
      // Plaats de boodschap in de eerste cel en vul aan tot MAX_CELLS voor vaste hoogte
      const li = document.createElement('li');
      li.textContent = 'Geen aanwezigen.';
      list.appendChild(li);
      for (let i = 1; i < MAX_CELLS; i++) {
        const filler = document.createElement('li');
        filler.className = 'attendee-filler';
        list.appendChild(filler);
      }
      targetEl.appendChild(list);
      return;
    }

    const needsMore = allNames.length > MAX_CELLS;
    const visibleCount = needsMore ? (MAX_CELLS - 1) : Math.min(allNames.length, MAX_CELLS);

    for (let i = 0; i < visibleCount; i++) {
      const li = document.createElement('li');
      li.textContent = allNames[i];
      list.appendChild(li);
    }

    if (needsMore) {
      const rest = allNames.length - visibleCount;
      const moreLi = document.createElement('li');
      moreLi.className = 'attendee-more';
      moreLi.textContent = `+${rest} meer`;
      moreLi.setAttribute('role', 'button');
      moreLi.setAttribute('tabindex', '0');
      moreLi.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showAttendeesModal(allNames);
      });
      moreLi.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showAttendeesModal(allNames);
        }
      });
      list.appendChild(moreLi);
    }

    // Vul tot exact MAX_CELLS voor vaste paneelhoogte
    let current = list.children.length;
    while (current < MAX_CELLS) {
      const filler = document.createElement('li');
      filler.className = 'attendee-filler';
      list.appendChild(filler);
      current++;
    }

    targetEl.appendChild(list);
    return;
  }

  // ===== DESKTOP (fallback): behoud bestaande inline-weergave met clamping =====
  const MAX_INLINE = opts.maxInline ?? 12;
  const shown = allNames.slice(0, MAX_INLINE);
  const rest = allNames.length - shown.length;

  const row = document.createElement('div');
  row.className = 'attendees-inline-row';

  const namesSpan = document.createElement('span');
  namesSpan.className = 'attendee-names-three-lines';
  namesSpan.textContent = shown.join(', ');
  row.appendChild(namesSpan);

  if (rest > 0) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ml-1 underline text-blue-600 hover:text-blue-700';
    btn.textContent = `+${rest} meer`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showAttendeesModal(allNames);
    });
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    row.appendChild(btn);
  }

  targetEl.appendChild(row);
}


//** Dedicated modal to show full attendee list with proper HTML layout */
function showAttendeesModal(names) {
  const modal = document.getElementById('customModal');
  const titleEl = document.getElementById('modalTitle');
  const msgEl = document.getElementById('modalMessage');
  const btns = document.getElementById('modalButtons');
  if (!modal || !titleEl || !msgEl || !btns) return;

  titleEl.textContent = 'Alle aanwezigen';
  const listHtml = `
    <ul class="attendees-grid">
      ${names.map(n => `<li>${n}</li>`).join('')}
    </ul>
  `;
  msgEl.innerHTML = listHtml;

  btns.innerHTML = '';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700';
  okBtn.textContent = 'Sluiten';
  okBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    modal.classList.add('hidden');
  });
  btns.appendChild(okBtn);

  modal.classList.remove('hidden');
}


function togglePasswordVisibility(passwordInput, toggleIcon) {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    if (type === 'password') {
        toggleIcon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>`;
    } else {
        toggleIcon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.988 5.89L10.5 12.396M16.5 17.5L20.012 21.012M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M21.012 21.012L3 3M12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            </svg>`;
    }
}


function login() {
    const usernameInput = document.getElementById('usernameInput').value.trim();
    const passwordInput = document.getElementById('passwordInput').value;
    if (!usernameInput) { showModal('Fout', 'Vul een gebruikersnaam in!'); return; }
    if (!passwordInput) { showModal('Fout', 'Vul een wachtwoord in!'); return; }

    const loader = document.getElementById('loginLoader');
    loader.classList.remove('hidden');

    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }),
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().catch(() => ({ message: 'Onbekende fout.' })).then(err => {
                throw new Error(err.message || 'Controleer gebruikersnaam en wachtwoord.');
            });
        }
        return response.json();
    })
    .then(data => {
        gebruikersnaam = data.gebruikersnaam;
        userRole = data.role;
        localStorage.setItem('gebruikersnaam', gebruikersnaam);
        localStorage.setItem('userRole', userRole);
        if (userRole === 'admin') {
            window.location.href = 'admin.html';
        } else {
            toonApp();
        }
    })
    .catch(e => {
        console.error(e);
        showModal('Fout', `Inloggen mislukt: ${e.message || 'Netwerkfout bij inloggen.'}`);
    })
    .finally(() => {
        loader.classList.add('hidden');
    });
}



//** Register */
function registerUser() {
    const username = document.getElementById("regUsername").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    if (!username || !email || !password) { showModal('Waarschuwing', 'Vul alle velden in.'); return; }
    fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
        credentials: 'include'
    })
    .then(res => {
        if (!res.ok) return res.json().catch(()=>({message:'Onbekende fout'})).then(err=>{throw new Error(err.message||'Registratie mislukt');});
        return res.json();
    })
    .then(() => {
        showModal('Succes', 'Registratie gelukt! Je kunt nu inloggen.');
    })
    .catch(err => {
        showModal('Fout', err.message || 'Er ging iets mis bij registreren.');
    });
}


//** Logout */
function logout() {
    localStorage.removeItem('gebruikersnaam');
    localStorage.removeItem('userRole');
    gebruikersnaam = ''; userRole = '';
    document.getElementById('appContainer').classList.add('hidden');
    document.getElementById('loginContainer').classList.remove('hidden');
    window.location.href = 'index.html';
}

//** App tonen */
async function toonApp() {
    document.getElementById('loginContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    const appMainTitle = document.getElementById('appMainTitle');
    if (appMainTitle) appMainTitle.textContent = gebruikersnaam;

    await toonDagen();
    setupUserMenu();

    const pendingUnsubscribe = localStorage.getItem('pendingGuestUnsubscribe');
    const actionDate = localStorage.getItem('actionDate');
    if (pendingUnsubscribe === 'true' && actionDate) {
        localStorage.removeItem('pendingGuestUnsubscribe');
        localStorage.removeItem('actionDate');
        const confirmUnAttend = await showConfirm('Afmelden als Gast', `Wil je ook afmelden als gast voor de borrel?`, 'Ja', 'Nee');
        if (confirmUnAttend) await verwijderAanwezigheid(actionDate);
        await toonDagen();
    }
}

//** Donderdagen 2025 */
function alleDonderdagen() {
    const data = [];
    let datum = new Date(Date.UTC(2025, 0, 2));
    const eindDatum = new Date(Date.UTC(2025, 11, 31));
    while (datum <= eindDatum) {
        data.push(datum.toISOString().split('T')[0]);
        datum.setUTCDate(datum.getUTCDate() + 7);
    }
    return data;
}

//** API helpers */
async function fetchHost(datum) {
    try {
        const res = await fetch(`${API_URL}/host/${datum}`, { credentials: 'include' });
        if (!res.ok) return 'Niet bekend';
        const data = await res.json();
        return data.host || 'Niet bekend';
    } catch { return 'Niet bekend'; }
}

async function fetchAanwezigheid(datum) {
    try {
        const res = await fetch(`${API_URL}/aanwezigheid/datum/${datum}`, { credentials: 'include' });
        if (!res.ok) return [];
        return await res.json();
    } catch { return []; }
}

async function voegAanwezigheidToe(datum) {
    try {
        const res = await fetch(`${API_URL}/aanwezigheid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gebruikersnaam, datum, aanwezig: true }),
            credentials: 'include'
        });
        if (!res.ok) {
            const err = await res.json().catch(()=>({message:'Onbekende fout.'}));
            showModal('Fout', `Kon aanwezigheid niet toevoegen: ${err.message}`);
            return false;
        }
        return true;
    } catch { showModal('Fout','Algemene fout bij toevoegen.'); return false; }
}

async function verwijderAanwezigheid(datum) {
    try {
        const res = await fetch(`${API_URL}/aanwezigheid`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gebruikersnaam, datum }),
            credentials: 'include'
        });
        if (!res.ok) {
            const err = await res.json().catch(()=>({message:'Onbekende fout.'}));
            showModal('Fout', `Kon aanwezigheid niet verwijderd: ${err.message}`);
            return false;
        }
        return true;
    } catch { showModal('Fout','Algemene fout bij verwijderen.'); return false; }
}

async function setHost(datum) {
    try {
        const res = await fetch(`${API_URL}/host`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ datum }),
            credentials: 'include'
        });
        if (!res.ok) {
            const err = await res.json().catch(()=>({message:'Onbekende fout.'}));
            showModal('Fout', `Kon hoststatus niet toevoegen: ${err.message}`);
            return false;
        }
        return true;
    } catch { showModal('Fout','Algemene fout bij host instellen.'); return false; }
}

async function removeHost(datum) {
    try {
        const res = await fetch(`${API_URL}/host/${datum}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host: gebruikersnaam }),
            credentials: 'include'
        });
        if (!res.ok) {
            try { const err = await res.json(); showModal('Fout', `Kon hoststatus niet verwijderen: ${err.message}`); }
            catch { showModal('Fout', `Serverfout (status ${res.status}).`); }
            return false;
        }
        return true;
    } catch { showModal('Fout','Algemene fout bij host verwijderen.'); return false; }
}

//** Accordeon-item */
async function createAccordionItem(datum, isVerleden) {
    const acc = document.createElement('div');
    acc.dataset.datum = datum;
const aanwezigen = await fetchAanwezigheid(datum);
    const isGebruikerAanwezig = aanwezigen.includes(gebruikersnaam);
    const currentHost = await fetchHost(datum);

    const borderClass = isGebruikerAanwezig ? 'border-green-500 border-2' : 'border-gray-200';
    const cursorClass = !isVerleden ? 'cursor-pointer' : 'cursor-not-allowed';

    acc.className = `bg-white py-2 px-4 rounded-lg shadow-md flex flex-col gap-4 ${borderClass} ${isVerleden ? 'opacity-75' : ''} ${cursorClass} relative overflow-hidden transition-colors duration-300 ease-in-out`;
if (isVerleden) acc.classList.add('panel-verleden');

    const greenStrip = document.createElement('div');
    greenStrip.className = 'green-strip';
    if (isGebruikerAanwezig) greenStrip.classList.add('active');
    acc.appendChild(greenStrip);

    if (!isVerleden) {
        // ===== TOEKOMST: 3 panelen =====
        const swipeContainer = document.createElement('div');
        swipeContainer.className = 'swipe-container relative w-full';
        swipeContainer.innerHTML = `
            <div class="flex" data-panel-container>
                <!-- Attendees (0) -->
                <div class="w-full flex-shrink-0 bg-transparent p-2 rounded-lg flex flex-col" data-attendee-panel>
                    <p class="text-base font-semibold text-gray-800 mb-1">Aanwezigen:</p>
                    <p class="text-sm text-gray-700 flex-grow overflow-y-auto" data-attendee-names-display></p>
                </div>
                <!-- Main (1) -->
                <div class="w-full flex-shrink-0 bg-transparent" data-main-panel>
                    <div class="flex items-center w-full py-2">
                        <div class="w-16 text-center flex-shrink-0 transition-all duration-300 transform" data-cal-icon>
                            <div class="bg-red-500 text-white py-1 text-xs font-bold uppercase rounded-t-lg">${new Date(datum + 'T00:00:00Z').toLocaleDateString('nl-NL', { month: 'short' }).toUpperCase()}</div>
                            <div class="bg-white text-gray-800 py-1 text-2xl font-bold rounded-b-lg border border-gray-200" data-cal-day>${new Date(datum + 'T00:00:00Z').getUTCDate()}</div>
                        </div>
                        <div class="flex-grow text-left mr-auto ml-7 transition-all duration-300 transform" data-main-text>
                            <p class="text-lg font-semibold text-gray-800 hidden sm:block" data-date-display></p>
                            <p class="text-lg font-semibold text-gray-800 block sm:hidden" data-day-name></p>
                            <p class="text-sm text-gray-600" data-host-info>
                                Host: <span class="font-bold host-name-display">Laden...</span>
                            </p>
                            <p class="text-sm text-gray-600 block sm:hidden" data-mobile-attendee-count></p>
                            <p class="text-sm text-gray-600 hidden sm:block" data-desktop-attendee-list></p>
                        </div>
                        <div id="hostCrownWrapper" class="flex-shrink-0 w-16 h-16 mr-4 relative z-10 rounded-full">
                            <span id="hostCrownIcon" class="w-full h-full cursor-pointer transition-all duration-300 transform flex items-center justify-center">
                                <img src="thumbnail-crown.png" alt="Host Crown" class="w-full h-full object-contain">
                            </span>
                        </div>
                    </div>
                </div>
            </div>`;
        acc.appendChild(swipeContainer);

        const panelContainer = swipeContainer.querySelector('[data-panel-container]');
        const mainPanel = swipeContainer.querySelector('[data-main-panel]');
        const attendeePanel = swipeContainer.querySelector('[data-attendee-panel]');
        const hostPanel = swipeContainer.querySelector('[data-host-panel]');
        const hostNameDisplay = mainPanel.querySelector('.host-name-display');
        const hostCrownWrapper = mainPanel.querySelector('#hostCrownWrapper');
        const hostCrownIcon = mainPanel.querySelector('#hostCrownIcon');
        
        // --- [PATCH] Klik op kroon om host te worden (of jezelf afmelden) ---
        try {
            if (hostCrownIcon) {
                hostCrownIcon.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!gebruikersnaam) {
                        showModal('Inloggen vereist', 'Log in om jezelf als host aan te melden.');
                        return;
                    }

                    // Altijd even de meest recente host ophalen
                    let updatedHostNow = currentHostCached;
                    try { updatedHostNow = await fetchHost(datum); } catch (e) {}

                    // 1) Jij bent host -> afmelden
                    if (updatedHostNow === gebruikersnaam) {
                        const confirmUnHost = await showConfirm('Afmelden als Host', 'Weet je zeker dat je je wilt afmelden als host?');
                        if (confirmUnHost) {
                            const ok = await removeHost(datum);
                            if (ok) {
                                // zelfde flow als op de mainPanel klik
                                localStorage.setItem('pendingGuestUnsubscribe', 'true');
                                localStorage.setItem('actionDate', datum);
                                await toonDagen();
                            }
                        }
                        return;
                    }

                    // 2) Host onbekend -> jij host worden
                    if (!updatedHostNow || updatedHostNow === 'Niet bekend') {
                        const dateObj = new Date(datum + 'T00:00:00Z');
const day = dateObj.getUTCDate();
const monthName = dateObj.toLocaleDateString('nl-NL', { month: 'long' });

const confirmHost = await showConfirm(
    'Host worden?',
    `Wil je jezelf aanmelden als host voor donderdag ${day} ${monthName}?`
);
                        if (confirmHost) {
                            const ok = await setHost(datum);
                            if (ok) {
                                try {
                                    const aanwezigen = await fetchAanwezigheid(datum);
                                    if (!aanwezigen.includes(gebruikersnaam)) {
                                        await voegAanwezigheidToe(datum);
                                    }
                                } catch (e) { /* ignore */ }
                                await toonDagen();
                            }
                        }
                        return;
                    }

                    // 3) Iemand anders is al host -> niets doen
                    return;
                }, { passive: true });
            }
        } catch (e) { /* noop */ }
        // --- [/PATCH] ---
    const mobileAttendeeCountDisplay = mainPanel.querySelector('[data-mobile-attendee-count]');
        const desktopAttendeeListDisplay = mainPanel.querySelector('[data-desktop-attendee-list]');
        const dateDisplay = mainPanel.querySelector('[data-date-display]');
        const dayNameDisplay = mainPanel.querySelector('[data-day-name]');
        const attendeeNamesDisplay = attendeePanel.querySelector('[data-attendee-names-display]');
        const setHostButton = hostPanel ? hostPanel.querySelector('#setHostButton') : null;

        
        let currentHostCached = null; / wordt gezet in _updateAccordionItemUI()
// start op main (index 1)
        let panelIndex = 1; / 0 attendees, 1 main, 2 host
        const hasHostPanel = false;

        function setTransformByIndex(i, withTransition = true) {
            if (withTransition) panelContainer.style.transition = 'transform 0.38s ease-out';
            else panelContainer.style.transition = 'none';
            panelContainer.style.transform = `translateX(${-100 * i}%)`;
        }

        function thresholdPx() { return 50; }
        
        function applySwipeLeftEnterEffects(acc) {
            const cal = acc.querySelector('[data-cal-icon]');
            const mainText = acc.querySelector('[data-main-text]');
            const crownWrapper = acc.querySelector('#hostCrownWrapper');
            const calDay = acc.querySelector('[data-cal-day]');

            // Kalender verdwijnt + breedte vrijgeven
            if (cal) {
                cal.classList.add('-translate-x-full', 'opacity-0', 'w-0');
                cal.classList.remove('w-16');
            }
            if (calDay) {
                calDay.style.opacity = '0';
            }

            // Tekst schuift mee
            if (mainText) {
                mainText.classList.remove('ml-7');
                mainText.classList.add('ml-3');
            }

            // Crown: van rechts inschuiven met fade-in + pulserende ring
            if (typeof currentHostCached !== 'undefined' && (!currentHostCached || currentHostCached === 'Niet bekend') && crownWrapper) {
                crownWrapper.classList.remove('hidden');
                // Startpositie buiten beeld rechts
                crownWrapper.classList.add('translate-x-12', 'opacity-0');
                crownWrapper.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
                // Reflow forceren zodat transition pakt
                void crownWrapper.offsetWidth;
                // Eindpositie: in beeld
                crownWrapper.classList.remove('translate-x-12', 'opacity-0');
                crownWrapper.classList.add('translate-x-0', 'opacity-100', 'ring-animated');
            }
        }

        function resetSwipeLeftEffects(acc) {
            const cal = acc.querySelector('[data-cal-icon]');
            const mainText = acc.querySelector('[data-main-text]');
            const crownWrapper = acc.querySelector('#hostCrownWrapper');
            const calDay = acc.querySelector('[data-cal-day]');

            if (cal) {
                cal.classList.remove('-translate-x-full', 'opacity-0', 'w-0');
                cal.classList.add('w-16');
                cal.style.transform = '';
                cal.style.opacity = '';
            }
            if(calDay) {
                calDay.style.opacity = '';
            }

            if (mainText) {
                mainText.classList.remove('ml-3');
                mainText.classList.add('ml-7');
                mainText.style.transform = '';
                mainText.style.opacity = '';
            }

            if (crownWrapper) {
                // Als gebruiker host is: kroon altijd zichtbaar
                if (typeof currentHostCached !== 'undefined' && currentHostCached === gebruikersnaam) {
                    crownWrapper.classList.remove('hidden', 'translate-x-12', 'opacity-0', 'ring-animated');
                    crownWrapper.classList.add('translate-x-0', 'opacity-100');
                } else if (typeof currentHostCached !== 'undefined' && (!currentHostCached || currentHostCached === 'Niet bekend')) {
                    // Host onbekend: kroon klaarzetten buiten beeld rechts
                    crownWrapper.classList.remove('hidden');
                    crownWrapper.classList.remove('translate-x-0', 'opacity-100');
                    crownWrapper.classList.add('translate-x-12', 'opacity-0', 'ring-animated');
                } else {
                    // Andere host bekend: verbergen
                    crownWrapper.classList.add('hidden');
                    crownWrapper.classList.remove('translate-x-0', 'opacity-100', 'ring-animated');
                    crownWrapper.classList.add('translate-x-12', 'opacity-0');
                }
                crownWrapper.style.transform = '';
                crownWrapper.style.opacity = '';
            }
        }

        setTransformByIndex(panelIndex, false);

        async function _updateAccordionItemUI() {
            const aanwezigen = await fetchAanwezigheid(datum);
            const aanwezig = aanwezigen.includes(gebruikersnaam);
            const currentHostNow = await fetchHost(datum);
            currentHostCached = currentHostNow;
            try {
                const crownWrapper = acc.querySelector('#hostCrownWrapper');
                if (crownWrapper) {
                    if (currentHostCached === gebruikersnaam) {
                        // Gebruiker is host: kroon altijd zichtbaar op main
                        crownWrapper.classList.remove('hidden', 'translate-x-12', 'opacity-0', 'ring-animated');
                        crownWrapper.classList.add('translate-x-0', 'opacity-100');
                    } else if (!currentHostCached || currentHostCached === 'Niet bekend') {
                        // Host onbekend
                        crownWrapper.classList.remove('hidden');
                        if (window.innerWidth >= 640) {
                            // Desktop: toon direct met puls om aan te melden
                            crownWrapper.classList.remove('translate-x-12', 'opacity-0');
                            crownWrapper.classList.add('translate-x-0', 'opacity-100', 'ring-animated');
                        } else {
                            // Mobile: buiten beeld houden tot swipe-animatie
                            crownWrapper.classList.remove('translate-x-0', 'opacity-100');
                            crownWrapper.classList.add('translate-x-12', 'opacity-0', 'ring-animated');
                        }
    
                    } else {
                        // Andere host: verbergen
                        crownWrapper.classList.add('hidden');
                        crownWrapper.classList.remove('translate-x-0', 'opacity-100', 'ring-animated');
                        crownWrapper.classList.add('translate-x-12', 'opacity-0');
                    }
                }
            } catch(e) { /* noop */ }
            
            
            // Als host bekend wordt, herstel UI-effecten
            try {
                if (currentHostCached && currentHostCached !== 'Niet bekend') {
                    resetSwipeLeftEffects(acc);
                }
            } catch(e) {}
            // Als host nu bekend is en we staan op host-paneel, ga terug naar main
            try {
                if (currentHostCached && currentHostCached !== 'Niet bekend' && typeof panelIndex !== 'undefined' && panelIndex === 2) {
                    panelIndex = 1;
                    setTransformByIndex(panelIndex, true);
                }
            } catch (e) { /* ignore */ }

            const dateObj = new Date(datum + 'T00:00:00Z');
            const formattedWeekday = dateObj.toLocaleDateString('nl-NL', { weekday: 'long' });
            const capitalizedWeekday = formattedWeekday.charAt(0).toUpperCase() + formattedWeekday.slice(1);
            const formattedDateText = `${capitalizedWeekday} ${dateObj.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`;
            if (window.innerWidth < 640) {
                dateDisplay.classList.add('hidden');
                dayNameDisplay.textContent = capitalizedWeekday;
                dayNameDisplay.classList.remove('hidden');
            } else {
                dateDisplay.textContent = formattedDateText;
                dateDisplay.classList.remove('hidden');
                dayNameDisplay.classList.add('hidden');
            }

            hostNameDisplay.textContent = currentHostNow;
            if (hostCrownIcon) {
                // Cursor pointer bij eigen host óf wanneer nog geen host bekend is
                if (currentHostNow === gebruikersnaam || !currentHostNow || currentHostNow === 'Niet bekend') {
                    hostCrownIcon.classList.add('cursor-pointer');
                } else {
                    hostCrownIcon.classList.remove('cursor-pointer');
                }
            }
            if (hostCrownWrapper) {
                 if (!currentHostNow || currentHostNow === 'Niet bekend') {
                    hostCrownWrapper.classList.add('ring-animated');
                 } else {
                    hostCrownWrapper.classList.remove('ring-animated');
                 }
                 if (currentHostNow === gebruikersnaam) {
                     hostCrownWrapper.classList.add('cursor-pointer');
                 } else {
                     hostCrownWrapper.classList.remove('cursor-pointer');
                 }
            }

            mobileAttendeeCountDisplay.textContent = `Aanwezigen: ${aanwezigen.length === 0 ? 'Geen' : aanwezigen.length}`;
            // Desktop: inline + “+X meer”
renderAttendeesInline(desktopAttendeeListDisplay, aanwezigen);
            // Aanwezigen-paneel (zonder dubbel label)
renderAttendeePanelNames(attendeeNamesDisplay, aanwezigen);

            const newBorderClass = aanwezig ? 'border-green-500 border-2' : 'border-gray-200';
            acc.classList.remove('border-green-500', 'border-gray-200', 'border-2');
            acc.classList.add(...newBorderClass.split(' '));
            const greenStrip = acc.querySelector('.green-strip');
            if (greenStrip) { if (aanwezig) greenStrip.classList.add('active'); else greenStrip.classList.remove('active'); }
        }
        window.addEventListener('resize', _updateAccordionItemUI);
        _updateAccordionItemUI();

        // klik: aanwezig toggle of unhost
        mainPanel.addEventListener('click', async () => {
            if (!gebruikersnaam) return showModal('Inloggen vereist', 'Log in om je aanwezigheid te wijzigen.');
            const updatedHost = await fetchHost(datum);
            if (updatedHost === gebruikersnaam) {
                const confirmUnHost = await showConfirm('Afmelden als Host', 'Weet je zeker dat je je wilt afmelden als host?');
                if (confirmUnHost) {
                    const ok = await removeHost(datum);
                    if (ok) {
                        localStorage.setItem('pendingGuestUnsubscribe', 'true');
                        localStorage.setItem('actionDate', datum);
                        toonDagen();
                    }
                }
            } else {
                const aanwezigen = await fetchAanwezigheid(datum);
                const aanwezig = aanwezigen.includes(gebruikersnaam);
                const ok = aanwezig ? await verwijderAanwezigheid(datum) : await voegAanwezigheidToe(datum);
                if (ok) _updateAccordionItemUI();
            }
        });

        // Host worden
        if (setHostButton) {
            setHostButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmHost = await showConfirm('Host worden?', `Wil je host worden voor ${new Date(datum).toLocaleDateString('nl-NL')}?`);
                if (confirmHost) {
                    const ok = await setHost(datum);
                    if (ok) {
                        const aanwezigen = await fetchAanwezigheid(datum);
                        if (!aanwezigen.includes(gebruikersnaam)) await voegAanwezigheidToe(datum);
                        await toonDagen();
                    }
                }
            });
        }

        // ===== SWIPE: live drag symmetrisch =====
        if (window.innerWidth < 640) {
            let startX = 0, startY = 0, currentX = 0, isSwiping = false, startOffset = -100 * panelIndex;

            // Als host bekend is, blokkeren we schuiven naar het host-paneel (rechts van main)
            const minOffset = (hasHostPanel && (currentHostCached === null || currentHostCached === 'Niet bekend')) ? -200 : -100;
            const maxOffset = 0;
            
            acc.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                currentX = startX;
                isSwiping = true;
                startOffset = -100 * panelIndex;
                panelContainer.style.transition = 'none';
            }, { passive: true });

            acc.addEventListener('touchmove', (e) => {
                if (!isSwiping) return;
                currentX = e.touches[0].clientX;
                const diffX = currentX - startX;
                const diffY = e.touches[0].clientY - startY;
                if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) e.preventDefault();

                // Live drag: offset = startOffset + delta
                let newOffset = startOffset + (diffX / acc.offsetWidth) * 100;
                if (newOffset > maxOffset) newOffset = maxOffset;
                if (newOffset < minOffset) newOffset = minOffset;
                panelContainer.style.transform = `translateX(${newOffset}%)`;
                
                // --- Live preview fix ---
                try {
                    const crownWrapper = acc.querySelector('#hostCrownWrapper');
                    const cal = acc.querySelector('[data-cal-icon]');
                    const mainText = acc.querySelector('[data-main-text]');
                    const calDay = acc.querySelector('[data-cal-day]');
                    let progress = 0;
                    if (panelIndex === 1 && diffX < 0) {
                        const denom = Math.max(60, acc.offsetWidth * 0.4);
                        progress = Math.min(1, Math.max(0, (-diffX) / denom));
                    }
                    if (cal) {
                        cal.style.opacity = String(1 - progress);
                    }
                    if (calDay) {
                        calDay.style.opacity = String(1 - progress);
                    }
                    if (mainText) {
                        mainText.style.transform = `translateX(${-progress * 0.6}rem)`;
                    }
                    if (crownWrapper) {
                        if (currentHostCached === null || currentHostCached === 'Niet bekend') {
                            crownWrapper.style.opacity = String(progress);
                        }
                    }
                } catch (e) { /* noop */ }
    
            }, { passive: false });

            acc.addEventListener('touchend', async () => {
                if (!isSwiping) return;
                isSwiping = false;
                const deltaX = currentX - startX;
                const goLeft  = deltaX > thresholdPx();   / vinger naar rechts -> naar attendees
                const goRight = deltaX < -thresholdPx();  / vinger naar links  -> terug naar main of host-animatie

                if (panelIndex === 1 && goLeft) {
                    // Main -> Attendees
                    resetSwipeLeftEffects(acc);
                    panelIndex = 0;
                } else if (panelIndex === 0 && goRight) {
                    // Attendees -> Main
                    resetSwipeLeftEffects(acc);
                    panelIndex = 1;
                } else if (panelIndex === 1 && goRight) {
                    // Binnen main: alleen host-animatie als host onbekend
                    if (currentHostCached === null || currentHostCached === 'Niet bekend') {
                        applySwipeLeftEnterEffects(acc);
                        panelIndex = 1; / blijf op main
                    } else {
                        resetSwipeLeftEffects(acc);
                        panelIndex = 1;
                    }
                }
                setTransformByIndex(panelIndex, true);
                
                // Deze regel is verwijderd omdat hij de kroon onmiddellijk weer verbergt
                // _updateAccordionItemUI();
            });
        } else {
            setTransformByIndex(panelIndex, false);
        }
    } else {
        // ===== GESCHIEDENIS: 2 panelen =====
        const swipeContainer = document.createElement('div');
        acc.className = 'bg-white py-2 px-4 rounded-lg shadow-md flex flex-col gap-4 border-gray-200 panel-verleden cursor-not-allowed relative overflow-hidden';
        swipeContainer.className = 'swipe-container relative w-full';
        swipeContainer.innerHTML = `
            <div class="flex" data-panel-container>
                <!-- Attendees (0) -->
                <div class="w-full flex-shrink-0 bg-transparent p-2 rounded-lg flex flex-col" data-attendee-panel>
                    <p class="text-base font-semibold text-gray-800 mb-1">Aanwezigen:</p>
                    <p class="text-sm text-gray-700 flex-grow overflow-y-auto" data-attendee-names-display></p>
                </div>
                <!-- Main (1) -->
                <div class="w-full flex-shrink-0 bg-transparent" data-main-panel>
                    <div class="flex items-center w-full py-2">
                        <div class="w-16 text-center flex-shrink-0">
                            <div class="bg-red-500 text-white py-1 text-xs font-bold uppercase rounded-t-lg">${new Date(datum + 'T00:00:00Z').toLocaleDateString('nl-NL', { month: 'short' }).toUpperCase()}</div>
                            <div class="bg-white text-gray-800 py-1 text-2xl font-bold rounded-b-lg border border-gray-200">${new Date(datum + 'T00:00:00Z').getUTCDate()}</div>
                        </div>
                        <div class="flex-grow text-left mr-auto ml-4">
                            <p class="text-lg font-semibold text-gray-800 hidden sm:block" data-date-display></p>
                            <p class="text-lg font-semibold text-gray-800 block sm:hidden" data-day-name></p>
                            <p class="text-sm text-gray-600" data-host-info>
                                Host: <span class="font-bold host-name-display">Laden...</span>
                            </p>
                            <p class="text-sm text-gray-600 block sm:hidden" data-mobile-attendee-count></p>
                            <p class="text-sm text-gray-600 hidden sm:block" data-desktop-attendee-list></p>
                        </div>
                        <span class="flex-shrink-0 w-16 h-16 mr-4 hidden" data-history-crown-wrap>
                            <img src="thumbnail-crown.png" alt="Host Crown" class="w-full h-full object-contain crown-muted">
                        </span>
                    </div>
                </div>
            </div>`;
        acc.appendChild(swipeContainer);

        const panelContainer = swipeContainer.querySelector('[data-panel-container]');
        const mainPanel = swipeContainer.querySelector('[data-main-panel]');
        const attendeePanel = swipeContainer.querySelector('[data-attendee-panel]');
        const hostNameDisplay = mainPanel.querySelector('.host-name-display');
        const mobileAttendeeCountDisplay = mainPanel.querySelector('[data-mobile-attendee-count]');
        const desktopAttendeeListDisplay = mainPanel.querySelector('[data-desktop-attendee-list]');
        const dateDisplay = mainPanel.querySelector('[data-date-display]');
        const dayNameDisplay = mainPanel.querySelector('[data-day-name]');
        const attendeeNamesDisplay = attendeePanel.querySelector('[data-attendee-names-display]');

        let panelIndex = 1; / 0 attendees, 1 main
        function setTransformByIndex(i, withTransition = true) {
            if (withTransition) panelContainer.style.transition = 'transform 0.38s ease-out';
            else panelContainer.style.transition = 'none';
            panelContainer.style.transform = `translateX(${-100 * i}%)`;
        }
        setTransformByIndex(panelIndex, false);

        async function _updateHistoryItemUI() {
            const aanwezigen = await fetchAanwezigheid(datum);
            const currentHostNow = await fetchHost(datum);

            const dateObj = new Date(datum + 'T00:00:00Z');
            const formattedWeekday = dateObj.toLocaleDateString('nl-NL', { weekday: 'long' });
            const capitalizedWeekday = formattedWeekday.charAt(0).toUpperCase() + formattedWeekday.slice(1);
            const formattedDateText = `${capitalizedWeekday} ${dateObj.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`;

            if (window.innerWidth < 640) {
                dateDisplay.classList.add('hidden');
                dayNameDisplay.textContent = capitalizedWeekday;
                dayNameDisplay.classList.remove('hidden');
            } else {
                dateDisplay.textContent = formattedDateText;
                dateDisplay.classList.remove('hidden');
                dayNameDisplay.classList.add('hidden');
            }

            if (hostNameDisplay) hostNameDisplay.textContent = currentHostNow || 'Niet bekend';
            if (mobileAttendeeCountDisplay) mobileAttendeeCountDisplay.textContent = `Aanwezigen: ${aanwezigen.length === 0 ? 'Geen' : aanwezigen.length}`;
            if (desktopAttendeeListDisplay) / Desktop: inline + “+X meer”
renderAttendeesInline(desktopAttendeeListDisplay, aanwezigen);
            if (attendeeNamesDisplay) / Aanwezigen-paneel (zonder dubbel label)
renderAttendeePanelNames(attendeeNamesDisplay, aanwezigen);
        
            // Toon gedempte kroon in geschiedenis wanneer de ingelogde gebruiker host was
            try {
                const crownWrap = mainPanel.querySelector('[data-history-crown-wrap]');
                if (crownWrap) {
                    if (currentHostNow === gebruikersnaam) {
                        crownWrap.classList.remove('hidden');
                    } else {
                        crownWrap.classList.add('hidden');
                    }
                }
            } catch (e) { /* noop */ }
}
        _updateHistoryItemUI();
        window.addEventListener('resize', _updateHistoryItemUI);

        if (window.innerWidth < 640) {
            let startX = 0, startY = 0, currentX = 0, isSwiping = false, startOffset = -100 * panelIndex;
            const minOffset = -100, maxOffset = 0;
            const thresholdPx = () => acc.offsetWidth * 0.20;

            acc.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                currentX = startX;
                isSwiping = true;
                startOffset = -100 * panelIndex;
                panelContainer.style.transition = 'none';
            }, { passive: true });

            acc.addEventListener('touchmove', (e) => {
                if (!isSwiping) return;
                currentX = e.touches[0].clientX;
                const diffX = currentX - startX;
                const diffY = e.touches[0].clientY - startY;
                if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) e.preventDefault();

                let newOffset = startOffset + (diffX / acc.offsetWidth) * 100;
                if (newOffset > maxOffset) newOffset = maxOffset;
                if (newOffset < minOffset) newOffset = minOffset;
                panelContainer.style.transform = `translateX(${newOffset}%)`;
                
                // --- Live preview fix ---
                try {
                    const crownWrapper = acc.querySelector('#hostCrownWrapper');
                    const cal = acc.querySelector('[data-cal-icon]');
                    const mainText = acc.querySelector('[data-main-text]');
                    // progressLeft: only when dragging left (diffX < 0) from main panel
                    let progressLeft = 0;
                    if (panelIndex === 1 && diffX < 0) {
                        const denom = Math.max(60, acc.offsetWidth * 0.4);
                        progressLeft = Math.min(1, Math.max(0, (-diffX) / denom));
                    }
                    if (cal) {
                        cal.style.opacity = String(1 - progressLeft);
                    }
                    if (mainText) {
                        mainText.style.transform = `translateX(${-progressLeft * 0.6}rem)`;
                    }
                    if (crownWrapper) {
                        if (currentHostCached === null || currentHostCached === 'Niet bekend') {
                            crownWrapper.style.opacity = String(progressLeft);
                        }
                    }
                } catch (e) { /* noop */ }
    
            }, { passive: false });

            acc.addEventListener('touchend', () => {
                if (!isSwiping) return;
                isSwiping = false;
                const deltaX = currentX - startX;
                const goLeft = deltaX > thresholdPx();
                const goRight = deltaX < -thresholdPx();

                if (goLeft && panelIndex > 0) panelIndex -= 1;
                else if (goRight && panelIndex < 1) panelIndex += 1;

                setTransformByIndex(panelIndex, true);
            });
        } else {
            setTransformByIndex(panelIndex, false);
        }
    }
    return acc;
}

//** Dagen laden */
async function toonDagen() {
    const lijst = document.getElementById('dagenLijst');
    lijst.innerHTML = '<div class="text-center text-gray-500 py-4"><div class="loader mx-auto"></div> Laden donderdagen...</div>';

    const allThursdays = alleDonderdagen();
    const vandaag = new Date(); vandaag.setHours(0,0,0,0);
    const vandaagStr = vandaag.toISOString().split('T')[0];

    const geschiedenis = allThursdays.filter(d => d < vandaagStr);
    const toekomst = allThursdays.filter(d => d >= vandaagStr);

    const tempDiv = document.createElement('div');
    tempDiv.className = 'space-y-4';


        if (geschiedenis.length) {
            const historyButton = document.createElement('div');
            historyButton.className = `bg-white p-4 rounded-lg shadow-md flex items-center justify-between cursor-pointer mb-4`;
            historyButton.innerHTML = `
                <div class="flex items-center gap-4 w-full justify-between">
                    <span id="historyChevronLeading" class="text-gray-500 text-2xl">▼</span>
                    <span class="text-lg font-semibold text-gray-800">Geschiedenis</span>
                    <span id="historyChevronTrailing" class="text-gray-500 text-2xl">▼</span>
                </div>`;
            tempDiv.appendChild(historyButton);

            const historyContentContainer = document.createElement('div');
            historyContentContainer.id = 'historyContent';
            historyContentContainer.className = 'hidden space-y-4';
            tempDiv.appendChild(historyContentContainer);

            
let _histActief = false;
let _histReachedStart = false;
let _histIndex = 0; / (legacy; unused for history batches) / next index into reversed history
const _histBatch = 4;
const _histChrono = [...geschiedenis].sort((a, b) => new Date(a) - new Date(b)); let _histNextEnd = _histChrono.length; / exclusive end index for next batch (start with latest)
// recent -> oud

historyButton.addEventListener('click', async () => {
    const historyContent = document.getElementById('historyContent');
    const chevronL = document.getElementById('historyChevronLeading');
    const chevronR = document.getElementById('historyChevronTrailing');
    const titleSpan = historyButton.querySelector('.text-lg');

    // Als we volledig geladen hebben en gebruiker klikt: inklappen & reset
    if (_histActief && _histReachedStart) {
        // Inklappen/reset
        historyContent.innerHTML = '';
        historyContent.classList.add('hidden');
        chevronL.textContent = '▼'; chevronR.textContent = '▼';
        if (titleSpan) titleSpan.textContent = 'Geschiedenis';
        _histActief = false;
        _histReachedStart = false;
        _histIndex = 0;
        return;
    }

    // Eerste klik of vervolgklikken tijdens laden
    if (historyContent.classList.contains('hidden')) {
        historyContent.classList.remove('hidden');
        chevronL.textContent = '▲'; chevronR.textContent = '▲';
        if (titleSpan) titleSpan.textContent = 'Meer';
        _histActief = true;
    }

    // Batch laden
    const end = _histNextEnd;
const start = Math.max(0, end - _histBatch);
    // Toon loader als er nog niets staat
    if (_histIndex === 0 && !historyContent.children.length) {
        historyContent.innerHTML = '<div class="text-center text-gray-500 py-4"><div class="loader mx-auto"></div> Laden geschiedenis...</div>';
    }
    const frag = document.createDocumentFragment();

    for (let i = start; i < end; i++) {
        const d = _histChrono[i];
        const accItem = await createAccordionItem(d, true);
        frag.appendChild(accItem);
    }

    // Verwijder loader en append
    const maybeLoader = historyContent.querySelector('.loader');
if (maybeLoader && historyContent.children.length === 1) {
  historyContent.innerHTML = '';
}
// Voeg batches steeds vóór bestaande inhoud toe, zodat de volgorde chronologisch blijft
if (historyContent.firstChild) {
  historyContent.insertBefore(frag, historyContent.firstChild);
} else {
  historyContent.appendChild(frag);
}

    _histNextEnd = start;
_histReachedStart = _histNextEnd <= 0;

    // Als we klaar zijn, zet titel op Inklappen
    if (_histReachedStart && titleSpan) {
        titleSpan.textContent = 'Inklappen';
    }
});
} else {
                    historyContent.classList.add('hidden');
                    chevronL.textContent = '▼'; chevronR.textContent = '▼';
                    historyContent.innerHTML = '';
                }



        for (const d of toekomst) {
            const acc = await createAccordionItem(d, false);
            tempDiv.appendChild(acc);
        }

        lijst.innerHTML = '';
        lijst.appendChild(tempDiv);

        if (allThursdays.length === 0) {
            lijst.innerHTML = '<div class="text-center text-gray-500 py-4">Geen donderdagen gevonden voor 2025.</div>';
        }




}

//** User menu */
function setupUserMenu() {
    const userIcon = document.getElementById('userIcon');
    const dropdown = document.getElementById('dropdownMenu');
    const menuGebruikersnaam = document.getElementById('menuGebruikersnaam');

    if (menuGebruikersnaam) {
        menuGebruikersnaam.textContent = gebruikersnaam;
        menuGebruikersnaam.style.cursor = 'pointer';
        menuGebruikersnaam.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = 'settings.html';
        });
    }

    if (userIcon && dropdown) {
        userIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });
    }

    document.addEventListener('click', (e) => {
        if (dropdown && userIcon && !dropdown.contains(e.target) && !userIcon.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

//** Modals */
const registrationModal = document.getElementById("registrationModal");
const forgotPasswordModal = document.getElementById("forgotPasswordModal");

document.getElementById("openRegisterLink").onclick = (e) => {
    e.preventDefault();
    registrationModal.classList.remove('hidden');
};
document.getElementById("closeRegisterModal").onclick = () => { closeRegisterModal(); };
function closeRegisterModal() {
    registrationModal.classList.add('hidden');
    document.getElementById("registerForm").reset();
}

function showModal(title, messageContent, buttons = []) {
    const modalOverlay = document.getElementById('customModal');
    document.getElementById('modalTitle').textContent = title;
    const modalMessageDiv = document.getElementById('modalMessage');
    modalMessageDiv.innerHTML = '';

    if (typeof messageContent === 'string') modalMessageDiv.textContent = messageContent;
    else if (messageContent instanceof HTMLElement) modalMessageDiv.appendChild(messageContent);

    const modalButtons = document.getElementById('modalButtons');
    modalButtons.innerHTML = '';

    if (buttons.length > 0) {
        buttons.forEach(btn => {
            const buttonElement = document.createElement('button');
            buttonElement.textContent = btn.text;
            buttonElement.className = btn.className;
            buttonElement.onclick = btn.onclick;
            modalButtons.appendChild(buttonElement);
        });
    } else {
        const okButton = document.createElement('button');
        okButton.textContent = 'OK';
        okButton.className = 'bg-green-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-700 transition duration-300 ease-in-out';
        okButton.onclick = () => { modalOverlay.classList.add('hidden'); };
        modalButtons.appendChild(okButton);
    }
    modalOverlay.classList.remove('hidden');
}

function showConfirm(title, message, confirmText = 'Ja', cancelText = 'Nee') {
    return new Promise(resolve => {
        resolveModalPromise = resolve;
        const modalOverlay = document.getElementById('customModal');
        document.getElementById('modalTitle').textContent = title;
        const modalMessageDiv = document.getElementById('modalMessage');
        modalMessageDiv.innerHTML = '';
        modalMessageDiv.textContent = message;

        const modalButtons = document.getElementById('modalButtons');
        modalButtons.innerHTML = '';

        const confirmButton = document.createElement('button');
        confirmButton.textContent = confirmText;
        confirmButton.className = 'bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition duration-300 ease-in-out';
        confirmButton.onclick = () => { modalOverlay.classList.add('hidden'); resolveModalPromise(true); };

        const cancelButton = document.createElement('button');
        cancelButton.textContent = cancelText;
        cancelButton.className = 'bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition duration-300 ease-in-out';
        cancelButton.onclick = () => { modalOverlay.classList.add('hidden'); resolveModalPromise(false); };

        modalButtons.appendChild(confirmButton);
        modalButtons.appendChild(cancelButton);
        modalOverlay.classList.remove('hidden');
    });
}

async function requestPasswordReset() {
    const email = document.getElementById('forgotEmail').value.trim();
    const loader = document.getElementById('forgotPasswordLoader');
    
    if (!email) {
        showModal('Fout', 'Vul uw e-mailadres in.');
        return;
    }
    
    loader.classList.remove('hidden');

    try {
        const response = await fetch(`${API_URL}/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        
        const data = await response.json();

        // De API geeft altijd een succesvol bericht terug, ongeacht of het e-mailadres bestaat, // om gebruikersnamen niet te lekken. We tonen altijd hetzelfde succesbericht.
        showModal('Succes', data.message || 'Als het e-mailadres bekend is, is er een link voor het opnieuw instellen van het wachtwoord verzonden.');
        forgotPasswordModal.classList.add('hidden');
        document.getElementById('forgotPasswordForm').reset();
    } catch (e) {
        console.error('Fout bij het versturen van het wachtwoord reset-verzoek:', e);
        showModal('Fout', 'Er is een netwerkfout opgetreden. Probeer het later opnieuw.');
    } finally {
        loader.classList.add('hidden');
    }
}


//** Initial load */
window.onload = () => {
    gebruikersnaam = localStorage.getItem('gebruikersnaam');
    userRole = localStorage.getItem('userRole');

    document.getElementById('appContainer').classList.add('hidden');

    if (gebruikersnaam && userRole) {
        if (userRole === 'admin') {
            window.location.href = 'admin.html';
            return;
        }
        document.getElementById('usernameInput').value = gebruikersnaam;
        document.getElementById('usernameInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') login();
        });
        toonApp();
    } else {
        document.getElementById('loginContainer').classList.remove('hidden');
    }

    const passwordInput = document.getElementById('passwordInput');
    const togglePassword = document.getElementById('togglePassword');
    if (passwordInput && togglePassword) {
        togglePassword.addEventListener('click', () => {
            togglePasswordVisibility(passwordInput, togglePassword);
        });
    }

    const regPasswordInput = document.getElementById('regPassword');
    const toggleRegPassword = document.getElementById('toggleRegPassword');
    if (regPasswordInput && toggleRegPassword) {
        toggleRegPassword.addEventListener('click', () => {
            togglePasswordVisibility(regPasswordInput, toggleRegPassword);
        });
    }

    // Nieuwe functionaliteit voor wachtwoord vergeten
    document.getElementById("wachtwoordVergetenLink").onclick = (e) => {
        e.preventDefault();
        forgotPasswordModal.classList.remove('hidden');
    };
    
    document.getElementById("closeForgotPasswordModal").onclick = () => {
        forgotPasswordModal.classList.add('hidden');
    };
};


//* === Geschiedenis-accordeon v1.0 === */
(() => {
  const BTN_ID = 'geschiedenisKnop';
  const BATCH = 4;

  let actief = false;
  let reachedStart = false;
  let volgendeIndex = null;
  const geladenSet = new Set();

  function alleDonderdagenSafe() {
    try { return alleDonderdagen(); } catch(e) { return []; }
  }

  const $btn = document.getElementById(BTN_ID);
  if ($btn) {
    $btn.addEventListener('click', async () => {
      if (actief && reachedStart) {
        inklapAlles();
        return;
      }
      if (!actief) {
        initStartIndex();
        actief = true;
      }
      await laadVolgendeBatch();
      if (reachedStart) $btn.textContent = 'Inklappen';
      else $btn.textContent = 'Meer geschiedenis';
    });
  }

  function initStartIndex() {
    const alle = alleDonderdagenSafe(); / oud -> nieuw
    const $dagenLijst = document.getElementById('dagenLijst');
    const futureNodes = $dagenLijst ? [...$dagenLijst.children].filter(n => !n.classList.contains('panel-verleden')) : [];
    let eersteFutureDatum = null;
    for (const n of futureNodes) {
      if (n.dataset && n.dataset.datum) { eersteFutureDatum = n.dataset.datum; break; }
    }
    if (!eersteFutureDatum) {
      const alleIdx = alle.length; / alles verleden
      volgendeIndex = alleIdx - 1;
      reachedStart = volgendeIndex < 0;
      return;
    }
    const alleIdx = alle.indexOf(eersteFutureDatum);
    volgendeIndex = (alleIdx === -1) ? (alle.length - 1) : (alleIdx - 1);
    reachedStart = volgendeIndex < 0;
  }

  async function laadVolgendeBatch() {
    if (reachedStart) return;
    const alle = alleDonderdagenSafe(); / oud -> nieuw
    const $dagenLijst = document.getElementById('dagenLijst');
    if (!$dagenLijst) return;
    const endIndex = Math.max(-1, volgendeIndex - BATCH);
    for (let i = volgendeIndex; i > endIndex; i--) {
      if (i < 0) break;
      const datum = alle[i];
      if (geladenSet.has(datum)) continue;
      try {
        const acc = await createAccordionItem(datum, true);
        if (acc) {
          acc.classList.add('panel-verleden');
          acc.dataset.datum = datum;
          $dagenLijst.insertBefore(acc, $dagenLijst.firstChild);
          geladenSet.add(datum);
        }
      } catch(e) {}
    }
    volgendeIndex = endIndex;
    if (volgendeIndex < 0) reachedStart = true;
  }

  function inklapAlles() {
    const $dagenLijst = document.getElementById('dagenLijst');
    if ($dagenLijst) [...$dagenLijst.querySelectorAll('.panel-verleden')].forEach(n => n.remove());
    actief = false;
    reachedStart = false;
    volgendeIndex = null;
    geladenSet.clear();
    const $btn = document.getElementById(BTN_ID);
    if ($btn) $btn.textContent = 'Geschiedenis';
  }

  // Optioneel support voor her-render van de lijst
  document.addEventListener('toonDagen:rendered', () => {
    volgendeIndex = null;
    geladenSet.clear();
    if (actief && !reachedStart) initStartIndex();
  });
})();

//* ===== Settings page helpers (accordions + suggestions) ===== */
(() => {
  // Avoid double-declare
  if (window.__settingsHelpersInit) return;
  window.__settingsHelpersInit = true;

  function ensureModal() {
    // Use existing modal if present on the page
    let overlay = document.getElementById('customModal');
    if (overlay) return overlay;

    // Otherwise, create a minimal modal (non-intrusive for pages without it)
    overlay = document.createElement('div');
    overlay.id = 'customModal';
    overlay.className = 'fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 hidden';

    const box = document.createElement('div');
    box.className = 'bg-white p-6 rounded-xl shadow-lg max-w-sm w-11/12 text-center';

    const title = document.createElement('h3');
    title.id = 'modalTitle';
    title.className = 'text-xl font-bold text-gray-800 mb-4';
    box.appendChild(title);

    const msg = document.createElement('div');
    msg.id = 'modalMessage';
    msg.className = 'mb-4 text-gray-700 leading-relaxed text-left';
    box.appendChild(msg);

    const btns = document.createElement('div');
    btns.id = 'modalButtons';
    btns.className = 'flex justify-center gap-3';
    box.appendChild(btns);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    return overlay;
  }

  // Define showModal if not already available on page scripts
  if (typeof window.showModal !== 'function') {
    window.showModal = function(title, messageContent, buttons = []) {
      const modalOverlay = ensureModal();
      document.getElementById('modalTitle').textContent = title;
      const modalMessageDiv = document.getElementById('modalMessage');
      modalMessageDiv.innerHTML = '';

      if (typeof messageContent === 'string') {
        modalMessageDiv.textContent = messageContent;
      } else if (messageContent instanceof HTMLElement) {
        modalMessageDiv.appendChild(messageContent);
      }

      const modalButtons = document.getElementById('modalButtons');
      modalButtons.innerHTML = '';

      if (buttons.length > 0) {
        buttons.forEach(btn => {
          const buttonElement = document.createElement('button');
          buttonElement.textContent = btn.text;
          buttonElement.className = btn.className || 'bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700';
          buttonElement.onclick = btn.onclick || (() => modalOverlay.classList.add('hidden'));
          modalButtons.appendChild(buttonElement);
        });
      } else {
        const okButton = document.createElement('button');
        okButton.textContent = 'OK';
        okButton.className = 'bg-green-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-700';
        okButton.onclick = () => modalOverlay.classList.add('hidden');
        modalButtons.appendChild(okButton);
      }
      modalOverlay.classList.remove('hidden');
    };
  }

  function initAccordions() {
    document.querySelectorAll('[data-accordion-trigger]').forEach(btn => {
      // Prevent double-binding
      if (btn.__accordionBound) return;
      btn.__accordionBound = true;

      btn.addEventListener('click', () => {
        const section = btn.closest('section');
        if (!section) return;
        const wasOpen = section.classList.contains('accordion-open');
        section.classList.toggle('accordion-open', !wasOpen);

        // rotate chevron (expects wrapper with inline-flex)
        const iconWrap = btn.querySelector('span.inline-flex');
        if (iconWrap) iconWrap.classList.toggle('rotate-90', !wasOpen);
      });
    });
  }

  async function initSuggestionForm() {
    const form = document.getElementById('suggestionForm');
    if (!form || form.__bound) return;
    form.__bound = true;

    const textarea = form.querySelector('#suggestionText');
    const loader = document.getElementById('suggestionLoader') || document.createElement('div');
    const messageDiv = document.getElementById('suggestionMessage') || document.createElement('div');

    // Provide defaults if not present on the page
    if (!loader.id) {
      loader.id = 'suggestionLoader';
      loader.className = 'hidden';
      form.after(loader);
    }
    if (!messageDiv.id) {
      messageDiv.id = 'suggestionMessage';
      messageDiv.className = 'mt-3 text-center text-sm';
      loader.after(messageDiv);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const suggestion = (textarea?.value || '').trim();
      if (!suggestion) {
        showModal('Waarschuwing', 'Vul een suggestie in voordat je verstuurt.');
        return;
      }

      const API_URL = (window.API_URL || '/api').replace(/\/$/, '');
      const gebruikersnaam = localStorage.getItem('gebruikersnaam') || '';

      loader.classList.remove('hidden');
      messageDiv.textContent = '';

      try {
        const response = await fetch(`${API_URL}/suggestie`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gebruikersnaam, suggestie: suggestion }),
          credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          showModal('Succes', 'Bedankt voor je suggestie! De beheerder is op de hoogte gebracht.');
          form.reset();
        } else {
          showModal('Fout', `Versturen mislukt: ${data.message || 'Onbekende fout.'}`);
        }
      } catch (err) {
        console.error('Suggestie versturen fout:', err);
        showModal('Fout', 'Er is een netwerkfout opgetreden. Controleer je verbinding.');
      } finally {
        loader.classList.add('hidden');
      }
    });
  }

  function initWhenReady() {
    initAccordions();
    initSuggestionForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady);
  } else {
    initWhenReady();
  }
})();