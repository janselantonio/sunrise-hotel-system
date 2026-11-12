const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  hotel: null,
  roomTypes: [],
  availability: null,
  search: null,
  selectedRoomId: null,
};

const money = (value, symbol = '\u20B1') =>
  `${symbol}${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayISO() {
  return toISO(new Date());
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + days));
}

function dateLabel(iso) {
  if (!iso) return '\u2014';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function nightsBetween(from, to) {
  if (!from || !to) return 0;
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function parseError(payload) {
  return payload?.error || 'Something went wrong. Please try again.';
}

async function getJSON(url) {
  const response = await fetch(url);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) throw new Error(parseError(data));
  return data;
}

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) throw new Error(parseError(data));
  return data;
}

let toastTimer = 0;
function toast(message) {
  const el = $('#g-toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function bindHeader() {
  const header = $('#g-header');
  const update = () => header.classList.toggle('scrolled', window.scrollY > 40);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

function setDefaults() {
  const checkIn = addDays(todayISO(), 1);
  const checkOut = addDays(todayISO(), 3);
  for (const input of ['#search-checkin', '#search-checkout', '#book-checkin', '#book-checkout']) {
    const el = $(input);
    if (el) el.min = todayISO();
  }
  $('#search-checkin').value = checkIn;
  $('#search-checkout').value = checkOut;
  $('#book-checkin').value = checkIn;
  $('#book-checkout').value = checkOut;
}

function syncFormDates(checkIn, checkOut, adults) {
  $('#book-checkin').value = checkIn;
  $('#book-checkout').value = checkOut;
  if (adults) {
    const option = [...$('#book-adults').options].find((opt) => Number(opt.value) >= Number(adults));
    if (option) $('#book-adults').value = option.value;
  }
}

/* ------------------------------------------------------------------ */
/* Render room types                                                   */
/* ------------------------------------------------------------------ */

function availabilityFor(type) {
  if (!state.availability) return null;
  return state.availability.roomTypes.find((group) => group.type === type) || null;
}

function renderRoomCards() {
  const grid = $('#room-types');
  const symbol = state.hotel?.hotel.currencySymbol || '\u20B1';
  grid.innerHTML = state.roomTypes
    .map((room) => {
      const live = availabilityFor(room.type);
      const badge = state.availability
        ? live
          ? `<span class="g-room-availability">${live.availableCount} available</span>`
          : '<span class="g-room-availability none">Booked for your dates</span>'
        : '';
      const meta = state.availability
        ? live
          ? `${live.availableCount} room${live.availableCount === 1 ? '' : 's'} available for your dates`
          : 'No rooms free for your dates'
        : `${room.availableCount} room${room.availableCount === 1 ? '' : 's'} in this category`;
      return `<article class="g-room-card" data-type="${esc(room.type)}">
        <div class="g-room-media">
          <img src="${esc(room.image)}" alt="${esc(room.type)} at Sunrise Hotel" />
          <span class="g-room-rate">from <strong>${money(room.rateFrom, symbol)}</strong> / night</span>
          ${badge}
        </div>
        <div class="g-room-body">
          <div class="g-room-title">
            <h3>${esc(room.type)}</h3>
            <span>Sleeps ${room.maxGuests} &middot; ${room.size} m&sup2;</span>
          </div>
          <p class="g-room-tagline">${esc(room.tagline)}</p>
          <p class="g-room-desc">${esc(room.description)}</p>
          <div class="g-room-tags">
            ${room.amenities.slice(0, 4).map((item) => `<span>${esc(item)}</span>`).join('')}
          </div>
          <div class="g-room-actions">
            <span class="g-room-meta">${meta}</span>
            <button class="g-room-btn" type="button" data-book-type="${esc(room.type)}">Book this room</button>
          </div>
        </div>
      </article>`;
    })
    .join('');
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

function readSearch() {
  return {
    checkIn: $('#search-checkin').value,
    checkOut: $('#search-checkout').value,
    guests: Number($('#search-guests').value) || 1,
  };
}

async function fetchAvailability(checkIn, checkOut, adults, children = 0) {
  const query = new URLSearchParams({
    check_in: checkIn,
    check_out: checkOut,
    adults: String(adults),
    children: String(children),
  });
  return getJSON(`/api/public/availability?${query.toString()}`);
}

function validateDates(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 'Choose both your check-in and check-out dates.';
  if (checkIn < todayISO()) return 'Check-in date cannot be in the past.';
  if (nightsBetween(checkIn, checkOut) < 1) return 'Check-out must be after check-in.';
  if (nightsBetween(checkIn, checkOut) > 30) return 'Online requests are limited to 30 nights.';
  return '';
}

function renderAvailability() {
  const data = state.availability;
  const section = $('#availability');
  if (!data) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const symbol = state.hotel?.hotel.currencySymbol || '\u20B1';
  $('#availability-title').textContent = data.totalAvailable
    ? `${data.totalAvailable} room${data.totalAvailable === 1 ? '' : 's'} for ${dateLabel(data.checkInDate)} \u2013 ${dateLabel(data.checkOutDate)}`
    : `No rooms for ${dateLabel(data.checkInDate)} \u2013 ${dateLabel(data.checkOutDate)}`;
  $('#availability-summary').textContent = data.totalAvailable
    ? `${data.nights} night${data.nights === 1 ? '' : 's'} \u00B7 ${data.adults} adult${data.adults === 1 ? '' : 's'}${data.children ? ` \u00B7 ${data.children} child${data.children === 1 ? '' : 'ren'}` : ''}. Rates before 12% tax.`
    : 'Try different dates or fewer guests. Reception can also help by phone.';

  const results = $('#availability-results');
  if (!data.totalAvailable) {
    results.innerHTML = `<div class="g-availability-empty">Nothing available for those dates. Try shifting your stay by a day or two.</div>`;
    return;
  }
  results.innerHTML = data.roomTypes
    .map(
      (room) => `<div class="g-availability-row">
        <img src="${esc(room.image)}" alt="" loading="lazy" />
        <div>
          <h3>${esc(room.type)}</h3>
          <p>${room.availableCount} available &middot; sleeps ${room.maxGuests} &middot; ${room.size} m&sup2;</p>
        </div>
        <div class="g-availability-price">
          <strong>${money(room.rateFrom, symbol)}</strong>
          <span>per night</span>
        </div>
        <button type="button" data-book-room="${room.rooms[0].id}" data-type="${esc(room.type)}">Select</button>
      </div>`
    )
    .join('');
}

async function runSearch({ scroll = true, quiet = false } = {}) {
  const { checkIn, checkOut, guests } = readSearch();
  const error = validateDates(checkIn, checkOut);
  if (error) {
    if (!quiet) toast(error);
    return false;
  }
  const button = $('#search-btn');
  if (!quiet) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner" style="width:15px;height:15px;border-width:2px"></span>Checking\u2026';
  }
  try {
    const data = await fetchAvailability(checkIn, checkOut, guests, 0);
    state.availability = data;
    state.search = { checkIn, checkOut, adults: guests, children: 0 };
    renderAvailability();
    renderRoomCards();
    syncFormDates(checkIn, checkOut, guests);
    await refreshFormRooms();
    updateSummary();
    if (scroll) {
      $('#availability').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return true;
  } catch (err) {
    if (!quiet) toast(err.message || 'Could not check availability.');
    return false;
  } finally {
    if (!quiet) {
      button.disabled = false;
      button.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>Check availability';
    }
  }
}

/* ------------------------------------------------------------------ */
/* Booking form                                                        */
/* ------------------------------------------------------------------ */

function formDates() {
  return {
    checkIn: $('#book-checkin').value,
    checkOut: $('#book-checkout').value,
    adults: Number($('#book-adults').value) || 1,
    children: Number($('#book-children').value) || 0,
  };
}

function availabilityMatchesForm(data) {
  if (!data) return false;
  const form = formDates();
  return (
    data.checkInDate === form.checkIn &&
    data.checkOutDate === form.checkOut &&
    Number(data.adults) === form.adults &&
    Number(data.children) === form.children
  );
}

function roomOptionsHTML(data) {
  const symbol = state.hotel?.hotel.currencySymbol || '\u20B1';
  if (!data || !data.roomTypes.length) {
    return '<option value="">No rooms available for these dates</option>';
  }
  return (
    '<option value="">Choose a room</option>' +
    data.roomTypes
      .map(
        (group) => `<optgroup label="${esc(group.type)} \u00B7 ${money(group.rateFrom, symbol)} / night">
          ${group.rooms
            .map(
              (room) =>
                `<option value="${room.id}" data-rate="${room.rate}" data-type="${esc(group.type)}" data-number="${esc(room.number)}" data-max="${group.maxGuests}">Room ${esc(room.number)} \u00B7 ${money(room.rate, symbol)} / night</option>`
            )
            .join('')}
        </optgroup>`
      )
      .join('')
  );
}

async function refreshFormRooms({ preserve = true } = {}) {
  const form = formDates();
  const select = $('#book-room');
  const previous = preserve ? select.value : '';
  const error = validateDates(form.checkIn, form.checkOut);
  if (error) {
    select.innerHTML = '<option value="">Choose valid dates first</option>';
    state.selectedRoomId = null;
    updateSummary();
    return;
  }
  const totalGuests = form.adults + form.children;
  if (totalGuests > 8) {
    select.innerHTML = '<option value="">Reduce the number of guests</option>';
    state.selectedRoomId = null;
    updateSummary();
    return;
  }
  if (!availabilityMatchesForm(state.availability)) {
    try {
      state.availability = await fetchAvailability(
        form.checkIn,
        form.checkOut,
        form.adults,
        form.children
      );
      renderAvailability();
      renderRoomCards();
    } catch (err) {
      select.innerHTML = '<option value="">Could not load rooms</option>';
      toast(err.message);
      return;
    }
  }
  select.innerHTML = roomOptionsHTML(state.availability);
  if (previous && [...select.options].some((opt) => opt.value === previous)) {
    select.value = previous;
  }
  state.selectedRoomId = select.value || null;
  updateSummary();
}

function selectedOption() {
  const select = $('#book-room');
  return select.selectedOptions[0] || null;
}

function updateSummary() {
  const symbol = state.hotel?.hotel.currencySymbol || '\u20B1';
  const option = selectedOption();
  const form = formDates();
  const nights = nightsBetween(form.checkIn, form.checkOut);
  const taxRate = Number(state.hotel?.hotel.taxRate || 12);
  $('#summary-stay').textContent =
    form.checkIn && form.checkOut && nights > 0
      ? `${dateLabel(form.checkIn)} \u2013 ${dateLabel(form.checkOut)} \u00B7 ${nights} night${nights === 1 ? '' : 's'}`
      : '\u2014';
  if (!option || !option.value || nights < 1) {
    $('#summary-room').textContent = option?.value ? option.textContent.split('\u00B7')[0].trim() : '\u2014';
    $('#summary-subtotal').textContent = '\u2014';
    $('#summary-tax').textContent = '\u2014';
    $('#summary-total').textContent = '\u2014';
    return;
  }
  const rate = Number(option.dataset.rate) || 0;
  const subtotal = rate * nights;
  const tax = subtotal * (taxRate / 100);
  $('#summary-room').textContent = `Room ${option.dataset.number} \u00B7 ${option.dataset.type}`;
  $('#summary-subtotal').textContent = money(subtotal, symbol);
  $('#summary-tax').textContent = money(tax, symbol);
  $('#summary-total').textContent = money(subtotal + tax, symbol);
}

function selectRoom(roomId, type) {
  const select = $('#book-room');
  const option = [...select.options].find((opt) => opt.value === String(roomId));
  if (option) {
    select.value = String(roomId);
    state.selectedRoomId = String(roomId);
    updateSummary();
  } else if (type) {
    const fallback = [...select.options].find((opt) => opt.dataset.type === type && opt.value);
    if (fallback) {
      select.value = fallback.value;
      state.selectedRoomId = fallback.value;
      updateSummary();
    }
  }
  $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => $('#book-name').focus({ preventScroll: true }), 500);
}

function showFormError(message = '') {
  const el = $('#booking-error');
  el.textContent = message;
  el.hidden = !message;
}

async function submitBooking(event) {
  event.preventDefault();
  showFormError('');
  const form = formDates();
  const error = validateDates(form.checkIn, form.checkOut);
  if (error) return showFormError(error);
  const roomId = Number($('#book-room').value);
  if (!roomId) return showFormError('Choose a room for your stay.');
  const fullName = $('#book-name').value.trim();
  const phone = $('#book-phone').value.trim();
  const email = $('#book-email').value.trim();
  if (fullName.length < 2) return showFormError('Enter your full name.');
  if (phone.length < 6) return showFormError('Enter a mobile number we can reach you on.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showFormError('Enter a valid email address, or leave it blank.');
  }

  const button = $('#booking-submit');
  button.disabled = true;
  button.textContent = 'Sending request\u2026';
  try {
    const result = await postJSON('/api/public/bookings', {
      roomId,
      checkInDate: form.checkIn,
      checkOutDate: form.checkOut,
      adults: form.adults,
      children: form.children,
      fullName,
      phone,
      email,
      notes: $('#book-notes').value.trim(),
    });
    $('#success-name').textContent = result.guestName.split(' ')[0];
    $('#success-phone').textContent = phone;
    $('#success-reference').textContent = result.reference;
    $('#success-details').textContent = `${result.roomType} \u00B7 Room ${result.roomNumber} \u00B7 ${dateLabel(result.checkInDate)} to ${dateLabel(result.checkOutDate)} \u00B7 ${result.nights} night${result.nights === 1 ? '' : 's'}`;
    $('#booking-form').hidden = true;
    $('#booking-success').hidden = false;
    $('#book-panel-success')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Booking request sent. Reception will confirm shortly.');
  } catch (err) {
    showFormError(err.message || 'Could not send your request. Please try again.');
  } finally {
    button.disabled = false;
    button.textContent = 'Send booking request';
  }
}

function resetBookingForm() {
  $('#booking-form').reset();
  $('#booking-success').hidden = true;
  $('#booking-form').hidden = false;
  const search = state.search || {
    checkIn: addDays(todayISO(), 1),
    checkOut: addDays(todayISO(), 3),
    adults: 2,
  };
  syncFormDates(search.checkIn, search.checkOut, search.adults);
  $('#book-adults').value = String(Math.min(6, Math.max(1, search.adults || 2)));
  $('#book-children').value = '0';
  state.selectedRoomId = null;
  showFormError('');
  refreshFormRooms({ preserve: false });
  $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function bindEvents() {
  $('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch({ scroll: true });
  });

  $('#room-types').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-book-type]');
    if (!button) return;
    const type = button.dataset.bookType;
    const { checkIn, checkOut, guests } = readSearch();
    const error = validateDates(checkIn, checkOut);
    if (error) {
      toast(error);
      return;
    }
    if (!state.availability || state.availability.checkInDate !== checkIn || state.availability.checkOutDate !== checkOut) {
      const ok = await runSearch({ scroll: false, quiet: true });
      if (!ok) return;
    }
    const group = availabilityFor(type);
    if (!group) {
      toast(`${type} is not available for those dates. Try other dates or room types.`);
      return;
    }
    syncFormDates(checkIn, checkOut, guests);
    await refreshFormRooms({ preserve: false });
    selectRoom(group.rooms[0].id, type);
  });

  $('#availability-results').addEventListener('click', (event) => {
    const button = event.target.closest('[data-book-room]');
    if (!button) return;
    const data = state.availability;
    syncFormDates(data.checkInDate, data.checkOutDate, data.adults);
    $('#book-children').value = String(data.children || 0);
    refreshFormRooms({ preserve: false }).then(() => {
      selectRoom(button.dataset.bookRoom, button.dataset.type);
    });
  });

  $('#availability-close').addEventListener('click', () => {
    state.availability = null;
    $('#availability').hidden = true;
    renderRoomCards();
    $('#rooms').scrollIntoView({ behavior: 'smooth' });
  });

  for (const selector of ['#book-checkin', '#book-checkout', '#book-adults', '#book-children']) {
    $(selector).addEventListener('change', () => {
      $('#book-checkin').min = todayISO();
      $('#book-checkout').min = $('#book-checkin').value
        ? addDays($('#book-checkin').value, 1)
        : todayISO();
      if ($('#book-checkin').value && $('#book-checkout').value) {
        if (nightsBetween($('#book-checkin').value, $('#book-checkout').value) < 1) {
          $('#book-checkout').value = addDays($('#book-checkin').value, 1);
        }
      }
      refreshFormRooms({ preserve: false });
    });
  }

  $('#book-room').addEventListener('change', () => {
    state.selectedRoomId = $('#book-room').value || null;
    updateSummary();
  });

  $('#booking-form').addEventListener('submit', submitBooking);
  $('#success-again').addEventListener('click', resetBookingForm);

  window.addEventListener('resize', () => {
    if (window.innerWidth > 760 && state.availability) renderAvailability();
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  $('#g-year').textContent = new Date().getFullYear();
  bindHeader();
  setDefaults();
  bindEvents();

  try {
    const data = await getJSON('/api/public/hotel');
    state.hotel = data;
    state.roomTypes = data.roomTypes;
    $('#stat-rooms').textContent = data.stats.rooms;
    $('#stat-types').textContent = data.stats.roomTypes;
    $('#stat-guests').textContent = `${Math.max(200, data.stats.guestsServed * 8)}+`;
    $('#search-hint').textContent = `Direct booking with ${data.hotel.name}. No prepayment required. Check-in ${data.hotel.checkInTime}, check-out ${data.hotel.checkOutTime}.`;
    renderRoomCards();

    const checkIn = $('#book-checkin').value;
    const checkOut = $('#book-checkout').value;
    const adults = Number($('#book-adults').value) || 2;
    state.availability = await fetchAvailability(checkIn, checkOut, adults, 0);
    state.search = { checkIn, checkOut, adults, children: 0 };
    renderRoomCards();
    await refreshFormRooms({ preserve: false });
    updateSummary();
  } catch (err) {
    $('#room-types').innerHTML = `<div class="g-availability-empty" style="color:var(--text-soft);border-color:var(--line)">Could not load rooms. Make sure the server is running, then refresh. ${esc(err.message)}</div>`;
    toast('Could not load the booking site. Is the server running?');
  }
}

boot();
