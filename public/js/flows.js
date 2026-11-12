import { api } from './api.js';
import { state, can } from './store.js';
import { icon } from './icons.js';
import {
  openModal,
  confirmDialog,
  toast,
  withBusy,
  esc,
  money,
  num,
  fmtDate,
  fmtDateShort,
  fmtDateTime,
  todayISO,
  addDaysISO,
  diffNights,
  nightsLabel,
  rangeLabel,
  initials,
  pill,
  statusPill,
  invoiceStatusMeta,
  reservationStatusMeta,
  approvalStatusMeta,
  bookingSourceMeta,
  bookingSourcePill,
  needsApproval,
  PAYMENT_METHODS,
  CATEGORY_LABELS,
  ROLE_LABELS,
  getConfig,
  emptyState,
  debounce,
  formValues,
} from './utils.js';

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function methodOptions(selected = 'cash') {
  return Object.entries(PAYMENT_METHODS)
    .map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function guestCount(adults, children) {
  const parts = [`${adults} adult${adults === 1 ? '' : 's'}`];
  const kids = Number(children) || 0;
  if (kids > 0) parts.push(`${kids} child${kids === 1 ? '' : 'ren'}`);
  return parts.join(' \u00B7 ');
}

function closeAndRefresh(modal, onDone) {
  modal.close();
  if (typeof onDone === 'function') onDone();
}

/* ================================================================== */
/* New reservation                                                     */
/* ================================================================== */

export function openNewReservation({ onDone } = {}) {
  if (!can('receptionist', 'admin')) {
    toast('Only front desk staff can create reservations.', 'error');
    return;
  }
  const today = todayISO();
  let selectedGuest = null;
  let selectedRoom = null;
  let guestResults = [];
  let rooms = [];
  let creatingGuest = false;

  const body = `
    <form id="res-form" novalidate autocomplete="off">
      <div class="form-section">
        <div class="section-label">1 \u00B7 Stay dates</div>
        <div class="form-grid">
          <label class="field"><span>Check-in</span>
            <input type="date" name="checkInDate" value="${today}" min="${today}" required />
          </label>
          <label class="field"><span>Check-out</span>
            <input type="date" name="checkOutDate" value="${addDaysISO(today, 1)}" min="${addDaysISO(today, 1)}" required />
          </label>
          <label class="field"><span>Adults</span><input type="number" name="adults" min="1" value="2" /></label>
          <label class="field"><span>Children</span><input type="number" name="children" min="0" value="0" /></label>
        </div>
      </div>

      <div class="form-section">
        <div class="section-label">2 \u00B7 Guest</div>
        <div class="guest-picker">
          <label class="field"><span>Find an existing guest</span>
            <div class="search">${icon('search', 16)}<input id="guest-search" placeholder="Search name, phone or email" autocomplete="off" /></div>
          </label>
          <div id="guest-results" class="search-results" hidden></div>
          <div id="guest-selected" hidden></div>
          <div class="guest-toggle"><button type="button" class="link-btn" id="toggle-new-guest">+ Add a new guest</button></div>
          <div id="new-guest-fields" class="form-grid" hidden>
            <label class="field span-2"><span>Full name</span><input name="guestName" placeholder="Guest full name" /></label>
            <label class="field"><span>Phone</span><input name="guestPhone" placeholder="+63 9xx xxx xxxx" /></label>
            <label class="field"><span>Email</span><input name="guestEmail" type="email" placeholder="guest@email.com" /></label>
            <label class="field span-2"><span>Address</span><input name="guestAddress" placeholder="Home address" /></label>
            <label class="field"><span>ID type</span><input name="guestIdType" placeholder="Passport, driver's license" /></label>
            <label class="field"><span>ID number</span><input name="guestIdNumber" placeholder="ID number" /></label>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="section-label">3 \u00B7 Room</div>
        <div id="room-available" class="availability-box"><p class="muted small">Checking availability\u2026</p></div>
        <label class="field" style="margin-top:14px"><span>Notes</span>
          <textarea name="notes" rows="2" placeholder="Arrival time, special requests, etc."></textarea>
        </label>
      </div>
    </form>`;

  const footer = `<div class="modal-foot-left" id="res-summary">Choose dates, guest and room</div>
    <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
    <button class="btn btn-primary" type="button" id="res-submit">Create reservation</button>`;

  const modal = openModal({
    title: 'New reservation',
    subtitle: 'Check availability, pick a room and capture the guest details.',
    size: 'lg',
    body,
    footer,
  });

  const form = modal.body.querySelector('#res-form');
  const checkInInput = form.elements.checkInDate;
  const checkOutInput = form.elements.checkOutDate;
  const searchInput = modal.body.querySelector('#guest-search');
  const resultsBox = modal.body.querySelector('#guest-results');
  const selectedBox = modal.body.querySelector('#guest-selected');
  const newGuestFields = modal.body.querySelector('#new-guest-fields');
  const toggleGuest = modal.body.querySelector('#toggle-new-guest');
  const roomsBox = modal.body.querySelector('#room-available');
  const summary = modal.footer.querySelector('#res-summary');
  const submit = modal.footer.querySelector('#res-submit');

  modal.footer.querySelector('[data-cancel]').addEventListener('click', modal.close);

  function currentNights() {
    const inDate = checkInInput.value;
    const outDate = checkOutInput.value;
    if (!inDate || !outDate) return 0;
    return Math.max(0, diffNights(inDate, outDate));
  }

  function updateSummary() {
    if (!selectedRoom) {
      summary.textContent = 'Choose dates, guest and room';
      return;
    }
    const nights = currentNights();
    summary.innerHTML = `<strong>${nightsLabel(nights)}</strong> \u00B7 ${money(selectedRoom.rate)} / night
      <span class="summary-total">${money(nights * selectedRoom.rate)}</span>`;
  }

  function roomCard(room) {
    return `<button type="button" class="avail-room ${selectedRoom?.id === room.id ? 'selected' : ''}" data-room-id="${room.id}">
      <span class="avail-num">${esc(room.number)}</span>
      <span class="avail-type">${esc(room.type)} \u00B7 Floor ${room.floor}</span>
      <span class="avail-rate">${money(room.rate)}<em>/night</em></span>
      <span class="avail-check">${icon('check', 13)}</span>
    </button>`;
  }

  async function refreshAvailability() {
    const checkIn = checkInInput.value;
    const checkOut = checkOutInput.value;
    if (!checkIn || !checkOut || diffNights(checkIn, checkOut) < 1) {
      roomsBox.innerHTML = `<p class="muted small">Check-out must be after check-in.</p>`;
      return;
    }
    roomsBox.innerHTML = `<p class="muted small">Checking availability\u2026</p>`;
    try {
      const data = await api.get(
        `/api/rooms/availability?check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}`
      );
      rooms = data.rooms;
      if (selectedRoom && !rooms.some((room) => room.id === selectedRoom.id)) {
        selectedRoom = null;
      }
      roomsBox.innerHTML = rooms.length
        ? `<div class="avail-grid">${rooms.map(roomCard).join('')}</div>`
        : emptyState('door', 'No rooms available', 'Try different dates or check the room board.');
      updateSummary();
    } catch (error) {
      roomsBox.innerHTML = `<p class="form-error">${esc(error.message)}</p>`;
    }
  }

  roomsBox.addEventListener('click', (event) => {
    const card = event.target.closest('[data-room-id]');
    if (!card) return;
    const room = rooms.find((entry) => entry.id === Number(card.dataset.roomId));
    if (!room) return;
    selectedRoom = room;
    roomsBox.querySelectorAll('.avail-room').forEach((element) => {
      element.classList.toggle('selected', element === card);
    });
    updateSummary();
  });

  checkInInput.addEventListener('change', () => {
    const minOut = addDaysISO(checkInInput.value || today, 1);
    checkOutInput.min = minOut;
    if (!checkOutInput.value || checkOutInput.value <= checkInInput.value) {
      checkOutInput.value = minOut;
    }
    refreshAvailability();
  });
  checkOutInput.addEventListener('change', refreshAvailability);

  const searchGuests = debounce(async () => {
    const query = searchInput.value.trim();
    if (creatingGuest) return;
    if (query.length < 2) {
      resultsBox.hidden = true;
      resultsBox.innerHTML = '';
      return;
    }
    try {
      const data = await api.get(`/api/guests?q=${encodeURIComponent(query)}`);
      guestResults = data.guests;
      resultsBox.innerHTML = guestResults.length
        ? guestResults
            .slice(0, 6)
            .map(
              (guest) => `<button type="button" class="search-result" data-guest-id="${guest.id}">
                <span class="avatar sm">${initials(guest.fullName)}</span>
                <span class="search-result-text"><strong>${esc(guest.fullName)}</strong>
                <small>${esc(guest.phone)}${guest.email ? ` \u00B7 ${esc(guest.email)}` : ''}</small></span>
              </button>`
            )
            .join('')
        : `<div class="search-empty">No guests found. Add a new guest below.</div>`;
      resultsBox.hidden = false;
    } catch (error) {
      toast(error.message, 'error');
    }
  }, 280);

  searchInput.addEventListener('input', searchGuests);

  resultsBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-guest-id]');
    if (!button) return;
    const guest = guestResults.find((entry) => entry.id === Number(button.dataset.guestId));
    if (!guest) return;
    selectedGuest = guest;
    resultsBox.hidden = true;
    searchInput.value = '';
    selectedBox.hidden = false;
    selectedBox.innerHTML = `<div class="selected-guest">
      <span class="avatar">${initials(guest.fullName)}</span>
      <div><strong>${esc(guest.fullName)}</strong><span>${esc(guest.phone)}${
      guest.email ? ` \u00B7 ${esc(guest.email)}` : ''
    }</span></div>
      <button type="button" class="icon-btn" id="clear-guest" aria-label="Remove guest">${icon('x', 15)}</button>
    </div>`;
    selectedBox.querySelector('#clear-guest').addEventListener('click', () => {
      selectedGuest = null;
      selectedBox.hidden = true;
      selectedBox.innerHTML = '';
    });
  });

  toggleGuest.addEventListener('click', () => {
    creatingGuest = !creatingGuest;
    newGuestFields.hidden = !creatingGuest;
    searchInput.disabled = creatingGuest;
    if (creatingGuest) {
      selectedGuest = null;
      selectedBox.hidden = true;
      selectedBox.innerHTML = '';
      toggleGuest.textContent = 'Use an existing guest';
      newGuestFields.querySelector('input').focus();
    } else {
      toggleGuest.textContent = '+ Add a new guest';
    }
  });

  submit.addEventListener('click', () => {
    const values = formValues(form);
    if (!values.checkInDate || !values.checkOutDate || diffNights(values.checkInDate, values.checkOutDate) < 1) {
      toast('Check-out must be after check-in.', 'error');
      return;
    }
    if (!selectedRoom) {
      toast('Select an available room.', 'error');
      return;
    }
    let guestPayload = null;
    if (selectedGuest) {
      guestPayload = { guestId: selectedGuest.id };
    } else if (creatingGuest) {
      if (!values.guestName || !values.guestPhone) {
        toast('Enter the guest\u2019s name and phone number.', 'error');
        return;
      }
      guestPayload = {
        guest: {
          fullName: values.guestName,
          phone: values.guestPhone,
          email: values.guestEmail,
          address: values.guestAddress,
          idType: values.guestIdType,
          idNumber: values.guestIdNumber,
        },
      };
    } else {
      toast('Select a guest or add a new one.', 'error');
      return;
    }

    withBusy(
      submit,
      async () => {
        try {
          const data = await api.post('/api/reservations', {
            ...guestPayload,
            roomId: selectedRoom.id,
            checkInDate: values.checkInDate,
            checkOutDate: values.checkOutDate,
            adults: values.adults,
            children: values.children,
            notes: values.notes,
          });
          modal.close();
          toast(`Reservation ${data.reservation.code} created for ${data.reservation.guestName}.`);
          if (typeof onDone === 'function') onDone();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
      'Creating\u2026'
    );
  });

  refreshAvailability();
}

/* ================================================================== */
/* Check-in                                                            */
/* ================================================================== */

export function openCheckIn(reservation, { onDone } = {}) {
  if (!can('receptionist', 'admin')) {
    toast('Only front desk staff can check guests in.', 'error');
    return;
  }
  const modal = openModal({
    title: 'Check in guest',
    subtitle: `${esc(reservation.code)} \u00B7 Room ${esc(reservation.roomNumber)}`,
    size: 'sm',
    body: `<div class="confirm-stack">
      <div class="confirm-person">
        <span class="avatar lg">${initials(reservation.guestName)}</span>
        <div><strong>${esc(reservation.guestName)}</strong><span>${esc(reservation.guestPhone)}</span></div>
      </div>
      <div class="detail-grid">
        <div><span>Room</span><strong>${esc(reservation.roomNumber)} \u00B7 ${esc(reservation.roomType)}</strong></div>
        <div><span>Stay</span><strong>${rangeLabel(reservation.checkInDate, reservation.checkOutDate)}</strong>
          <small>${nightsLabel(reservation.nights)}</small></div>
        <div><span>Guests</span><strong>${guestCount(reservation.adults, reservation.children)}</strong></div>
        <div><span>Check-in time</span><strong>${esc(getConfig().checkInTime)}</strong></div>
      </div>
      <div class="notice">${icon('info', 16)} The room will be marked <strong>occupied</strong> and the guest added to the in-house list.</div>
    </div>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-primary" type="button" id="ci-confirm">Check in</button>`,
  });

  modal.footer.querySelector('[data-cancel]').addEventListener('click', modal.close);
  const confirm = modal.footer.querySelector('#ci-confirm');
  confirm.addEventListener('click', () =>
    withBusy(
      confirm,
      async () => {
        try {
          await api.post(`/api/reservations/${reservation.id}/check-in`);
          modal.close();
          toast(`${reservation.guestName} checked in to room ${reservation.roomNumber}.`);
          if (typeof onDone === 'function') onDone();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
      'Checking in\u2026'
    )
  );
}

/* ================================================================== */
/* Check-out                                                           */
/* ================================================================== */

export function openCheckout(reservation, { onDone } = {}) {
  if (!can('receptionist', 'admin')) {
    toast('Only front desk staff can check guests out.', 'error');
    return;
  }
  const taxRate = Number(getConfig().taxRate) || 0;
  const nights = reservation.nights;
  const roomTotal = round2(reservation.nightlyRate * nights);
  let amountTouched = false;

  const modal = openModal({
    title: 'Check out guest',
    subtitle: `${esc(reservation.code)} \u00B7 ${esc(reservation.guestName)} \u00B7 Room ${esc(reservation.roomNumber)}`,
    size: 'lg',
    body: `<div class="checkout-head">
      <div class="confirm-person">
        <span class="avatar lg">${initials(reservation.guestName)}</span>
        <div><strong>${esc(reservation.guestName)}</strong>
          <span>${esc(reservation.roomType)} \u00B7 ${guestCount(reservation.adults, reservation.children)}</span></div>
      </div>
      <div class="checkout-dates">
        <span>${fmtDate(reservation.checkInDate)}</span>${icon('arrowRight', 14)}<span>${fmtDate(
      reservation.checkOutDate
    )}</span>
        <em>${nightsLabel(nights)}</em>
      </div>
    </div>

    <div class="form-section">
      <div class="section-label">Charges</div>
      <div class="bill-lines">
        <div class="bill-line"><span>Room ${esc(reservation.roomNumber)} \u00B7 ${nightsLabel(nights)} @ ${money(
      reservation.nightlyRate
    )}</span><strong>${money(roomTotal)}</strong></div>
      </div>
      <div class="extras-list" id="extras-list"></div>
      <button type="button" class="link-btn" id="add-extra">${icon('plus', 13)} Add extra charge</button>
    </div>

    <div class="form-grid">
      <label class="field"><span>Discount</span><input type="number" id="co-discount" min="0" step="0.01" value="0" /></label>
      <label class="field"><span>Payment method</span><select id="co-method">${methodOptions('cash')}</select></label>
      <label class="field"><span>Amount received</span><input type="number" id="co-amount" min="0" step="0.01" /></label>
      <label class="field"><span>Reference (optional)</span><input id="co-reference" placeholder="Card / GCash / bank reference" /></label>
    </div>
    <p class="hint">Set the amount to 0 to check out with an open balance. The guest invoice can be settled later in Billing.</p>
    <div class="bill-total" id="bill-total"></div>`,
    footer: `<div class="modal-foot-left">Room will be marked for cleaning after check-out.</div>
      <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-primary" type="button" id="co-confirm">Complete check-out</button>`,
  });

  const extrasList = modal.body.querySelector('#extras-list');
  const discountInput = modal.body.querySelector('#co-discount');
  const amountInput = modal.body.querySelector('#co-amount');
  const methodInput = modal.body.querySelector('#co-method');
  const referenceInput = modal.body.querySelector('#co-reference');
  const totalBox = modal.body.querySelector('#bill-total');

  amountInput.addEventListener('input', () => {
    amountTouched = true;
    recalc();
  });

  function collectExtras() {
    return [...modal.body.querySelectorAll('.extra-row')]
      .map((row) => ({
        description: row.querySelector('.extra-desc').value.trim(),
        category: row.querySelector('.extra-cat').value,
        qty: Number(row.querySelector('.extra-qty').value) || 1,
        unitPrice: Number(row.querySelector('.extra-price').value) || 0,
      }))
      .filter((extra) => extra.description && extra.unitPrice > 0);
  }

  function recalc() {
    const extras = collectExtras();
    const extrasTotal = round2(extras.reduce((sum, extra) => sum + extra.qty * extra.unitPrice, 0));
    const discount = Math.max(0, round2(Number(discountInput.value) || 0));
    const subtotal = round2(roomTotal + extrasTotal);
    const taxable = Math.max(0, round2(subtotal - discount));
    const tax = round2((taxable * taxRate) / 100);
    const total = round2(taxable + tax);

    modal.body.querySelectorAll('.extra-row').forEach((row) => {
      const qty = Number(row.querySelector('.extra-qty').value) || 0;
      const price = Number(row.querySelector('.extra-price').value) || 0;
      row.querySelector('.extra-amount').textContent = money(round2(qty * price));
    });

    if (!amountTouched) amountInput.value = total.toFixed(2);
    const payment = Math.max(0, round2(Number(amountInput.value) || 0));
    const balance = Math.max(0, round2(total - payment));

    totalBox.innerHTML = `<div><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div><span>Discount</span><span>-${money(discount)}</span></div>
      <div><span>VAT (${taxRate}%)</span><span>${money(tax)}</span></div>
      <div class="grand"><span>Invoice total</span><span>${money(total)}</span></div>
      <div><span>Payment received</span><span>${money(payment)}</span></div>
      <div class="${balance > 0 ? 'balance due' : 'balance'}"><span>Balance after payment</span><span>${money(
      balance
    )}</span></div>`;
  }

  function addExtraRow() {
    const row = document.createElement('div');
    row.className = 'extra-row';
    row.innerHTML = `
      <input class="extra-desc" placeholder="Charge description" aria-label="Charge description" />
      <select class="extra-cat" aria-label="Charge category">
        <option value="food">F&amp;B</option>
        <option value="service">Service</option>
        <option value="other">Other</option>
      </select>
      <input class="extra-qty" type="number" min="1" step="1" value="1" aria-label="Quantity" />
      <input class="extra-price" type="number" min="0" step="0.01" placeholder="Price" aria-label="Unit price" />
      <span class="extra-amount">${money(0)}</span>
      <button type="button" class="icon-btn extra-remove" aria-label="Remove charge">${icon('x', 14)}</button>`;
    extrasList.appendChild(row);
    row.querySelector('.extra-remove').addEventListener('click', () => {
      row.remove();
      recalc();
    });
    row.querySelectorAll('input').forEach((input) => input.addEventListener('input', recalc));
    row.querySelector('.extra-desc').focus();
    recalc();
  }

  modal.body.querySelector('#add-extra').addEventListener('click', addExtraRow);
  discountInput.addEventListener('input', recalc);
  modal.footer.querySelector('[data-cancel]').addEventListener('click', modal.close);

  recalc();

  const confirm = modal.footer.querySelector('#co-confirm');
  confirm.addEventListener('click', () => {
    const extras = collectExtras();
    const extrasTotal = extras.reduce((sum, extra) => sum + extra.qty * extra.unitPrice, 0);
    const discount = Math.max(0, Number(discountInput.value) || 0);
    const subtotal = roomTotal + extrasTotal;
    if (discount > subtotal) {
      toast('Discount cannot be more than the bill subtotal.', 'error');
      return;
    }
    const payment = Math.max(0, round2(Number(amountInput.value) || 0));
    const taxable = Math.max(0, subtotal - discount);
    const total = round2(taxable + (taxable * taxRate) / 100);
    if (payment > total + 0.005) {
      toast('The payment is greater than the invoice total.', 'error');
      return;
    }

    withBusy(
      confirm,
      async () => {
        try {
          const data = await api.post(`/api/reservations/${reservation.id}/check-out`, {
            extras,
            discount,
            payments:
              payment > 0
                ? [{ amount: payment, method: methodInput.value, reference: referenceInput.value }]
                : [],
          });
          modal.close();
          toast(`Invoice ${data.invoice.number} created for ${reservation.guestName}.`);
          if (typeof onDone === 'function') onDone();
          openInvoice(data.invoice.id);
        } catch (error) {
          toast(error.message, 'error');
        }
      },
      'Checking out\u2026'
    );
  });
}

/* ================================================================== */
/* Online booking requests                                             */
/* ================================================================== */

export async function approveBookingRequest(reservation, { onDone } = {}) {
  if (!can('receptionist', 'admin')) {
    toast('Only front desk staff can approve booking requests.', 'error');
    return;
  }
  const confirmed = await confirmDialog({
    title: 'Approve this booking request?',
    message: `${reservation.guestName} will be confirmed for room ${reservation.roomNumber}.`,
    details: `<div class="confirm-line"><span>Stay</span><strong>${rangeLabel(
      reservation.checkInDate,
      reservation.checkOutDate
    )} \u00B7 ${nightsLabel(reservation.nights)}</strong></div>
      <div class="confirm-line"><span>Estimated total</span><strong>${money(
        (reservation.nightlyRate || 0) * (reservation.nights || 1)
      )}</strong></div>`,
    confirmLabel: 'Approve request',
    tone: 'primary',
  });
  if (!confirmed) return;
  try {
    await api.post(`/api/reservations/${reservation.id}/approve`);
    toast(`Booking ${reservation.code} approved and confirmed.`);
    if (typeof onDone === 'function') onDone();
  } catch (error) {
    toast(error.message, 'error');
  }
}

export function openDeclineRequest(reservation, { onDone } = {}) {
  if (!can('receptionist', 'admin')) {
    toast('Only front desk staff can decline booking requests.', 'error');
    return;
  }
  const modal = openModal({
    title: 'Decline booking request',
    subtitle: `${esc(reservation.code)} \u00B7 ${esc(reservation.guestName)}`,
    size: 'sm',
    body: `<form id="decline-form" class="form-stack">
      <div class="confirm-line"><span>Room</span><strong>${esc(reservation.roomNumber)} \u00B7 ${esc(
      reservation.roomType
    )}</strong></div>
      <div class="confirm-line"><span>Stay</span><strong>${rangeLabel(
        reservation.checkInDate,
        reservation.checkOutDate
      )}</strong></div>
      <label class="field"><span>Reason (optional)</span>
        <textarea name="reason" rows="3" placeholder="e.g. room is no longer available for those dates"></textarea>
      </label>
      <div class="notice">${icon('info', 16)} The request will be marked <strong>declined</strong> and the room released.</div>
    </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Keep request</button>
      <button class="btn btn-danger" type="button" id="decline-confirm">Decline request</button>`,
  });

  modal.footer.querySelector('[data-cancel]').addEventListener('click', modal.close);
  const confirm = modal.footer.querySelector('#decline-confirm');
  confirm.addEventListener('click', () =>
    withBusy(
      confirm,
      async () => {
        try {
          const { reason } = formValues(modal.body.querySelector('#decline-form'));
          await api.post(`/api/reservations/${reservation.id}/decline`, { reason });
          modal.close();
          toast(`Booking request ${reservation.code} declined.`);
          if (typeof onDone === 'function') onDone();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
      'Declining\u2026'
    )
  );
}

/* ================================================================== */
/* Invoice                                                             */
/* ================================================================== */

export async function openInvoice(id, { onDone } = {}) {
  let detail;
  try {
    detail = await api.get(`/api/invoices/${id}`);
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  const invoice = detail.invoice;
  const canEdit = can('receptionist', 'admin') && invoice.status === 'open';
  const isAdmin = can('admin');
  const statusMeta = invoiceStatusMeta(invoice.status);

  const itemsRows = detail.items
    .map(
      (item) => `<tr>
        <td>${esc(item.description)}${
        item.category !== 'room' && canEdit
          ? `<button type="button" class="row-remove no-print" data-remove-item="${item.id}" aria-label="Remove charge">${icon(
              'x',
              12
            )}</button>`
          : ''
      }</td>
        <td class="num">${item.category === 'room' ? esc(item.qty) : num(item.qty)}</td>
        <td class="num">${money(item.unitPrice)}</td>
        <td class="num">${money(item.amount)}</td>
      </tr>`
    )
    .join('');

  const paymentRows = detail.payments.length
    ? detail.payments
        .map(
          (payment) => `<div class="receipt-payment">
            <span>${esc(PAYMENT_METHODS[payment.method] || payment.method)}${
            payment.reference ? ` \u00B7 ${esc(payment.reference)}` : ''
          }</span>
            <span>${money(payment.amount)}</span>
            <em>${fmtDateTime(payment.paidAt)} \u00B7 ${esc(payment.receivedByName)}</em>
          </div>`
        )
        .join('')
    : `<p class="muted small">No payments recorded yet.</p>`;

  const config = getConfig();
  const receipt = `<div class="receipt print-area">
    <div class="receipt-head">
      <img src="/assets/logo.svg" alt="" class="receipt-logo" />
      <h3>${esc(config.hotelName)}</h3>
      <p>${esc(config.address)}</p>
      <p>${esc(config.phone)} \u00B7 ${esc(config.email)}</p>
    </div>
    <div class="receipt-meta">
      <div><span>Billed to</span><strong>${esc(invoice.guestName)}</strong><small>${esc(invoice.guestPhone)}</small></div>
      <div><span>Room</span><strong>${esc(invoice.roomNumber)} \u00B7 ${esc(invoice.roomType)}</strong>
        <small>${rangeLabel(invoice.checkInDate, invoice.checkOutDate)} \u00B7 ${nightsLabel(invoice.nights)}</small></div>
      <div><span>Invoice</span><strong>${esc(invoice.number)}</strong><small>${fmtDateTime(invoice.issuedAt)}</small></div>
      <div><span>Status</span><strong>${statusMeta.label}</strong>
        <small>${invoice.balance > 0 ? `Balance due ${money(invoice.balance)}` : 'Fully settled'}</small></div>
    </div>
    <table class="receipt-table">
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <div class="receipt-totals">
      <div><span>Subtotal</span><span>${money(invoice.roomTotal + invoice.extrasTotal)}</span></div>
      ${invoice.discount ? `<div><span>Discount</span><span>-${money(invoice.discount)}</span></div>` : ''}
      <div><span>VAT (${invoice.taxRate}%)</span><span>${money(invoice.taxAmount)}</span></div>
      <div class="grand"><span>Total</span><span>${money(invoice.total)}</span></div>
      <div><span>Paid</span><span>${money(invoice.amountPaid)}</span></div>
      <div class="balance ${invoice.balance > 0 ? 'due' : ''}"><span>Balance due</span><span>${money(
    invoice.balance
  )}</span></div>
    </div>
    <div class="receipt-payments"><h4>Payments</h4>${paymentRows}</div>
    <p class="receipt-note">Thank you for staying at ${esc(
      config.hotelName
    )}. This invoice was generated by the hotel management system.</p>
  </div>`;

  let tools = '';
  if (canEdit) {
    tools = `<div class="invoice-tools no-print">
      <div class="form-section">
        <div class="section-label">Add a charge</div>
        <form id="add-item-form" class="inline-form">
          <input name="description" placeholder="Charge description" required />
          <select name="category">
            <option value="food">F&amp;B</option>
            <option value="service">Service</option>
            <option value="other">Other</option>
          </select>
          <input name="qty" type="number" min="1" step="1" value="1" aria-label="Quantity" />
          <input name="unitPrice" type="number" min="0" step="0.01" placeholder="Unit price" required />
          <button class="btn btn-sm btn-ghost" type="submit">Add charge</button>
        </form>
      </div>
      <div class="form-section">
        <div class="section-label">Record a payment</div>
        <form id="add-payment-form" class="inline-form">
          <input name="amount" type="number" min="0.01" step="0.01" value="${invoice.balance.toFixed(
            2
          )}" aria-label="Payment amount" />
          <select name="method">${methodOptions('cash')}</select>
          <input name="reference" placeholder="Reference (optional)" />
          <button class="btn btn-sm btn-primary" type="submit">Record payment</button>
        </form>
      </div>
    </div>`;
  }

  const modal = openModal({
    title: `Invoice ${esc(invoice.number)}`,
    subtitle: `${esc(invoice.guestName)} \u00B7 Room ${esc(invoice.roomNumber)} \u00B7 ${esc(statusMeta.label)}`,
    size: 'lg',
    body: `${receipt}${tools}`,
    footer: `<div class="modal-foot-left">${
      isAdmin && invoice.status !== 'void' && invoice.amountPaid <= 0.005
        ? `<button class="btn btn-sm btn-danger no-print" type="button" id="void-invoice">Void invoice</button>`
        : ''
    }</div>
      <button class="btn btn-ghost no-print" type="button" id="print-invoice">${icon('printer', 15)} Print</button>
      <button class="btn btn-primary no-print" type="button" data-close>Done</button>`,
  });

  const refresh = () => {
    modal.close();
    setTimeout(() => openInvoice(id, { onDone }), 140);
    if (typeof onDone === 'function') onDone();
  };

  modal.footer.querySelector('[data-close]').addEventListener('click', modal.close);
  modal.footer.querySelector('#print-invoice').addEventListener('click', () => window.print());

  const voidButton = modal.footer.querySelector('#void-invoice');
  if (voidButton) {
    voidButton.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Void this invoice?',
        message: `${invoice.number} will be marked void and removed from revenue reports.`,
        confirmLabel: 'Void invoice',
      });
      if (!confirmed) return;
      try {
        await api.post(`/api/invoices/${invoice.id}/void`);
        toast('Invoice voided.');
        refresh();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }

  modal.body.querySelectorAll('[data-remove-item]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Remove charge?',
        message: 'The selected charge will be removed from this invoice.',
        confirmLabel: 'Remove charge',
      });
      if (!confirmed) return;
      try {
        await api.del(`/api/invoices/${invoice.id}/items/${button.dataset.removeItem}`);
        toast('Charge removed.');
        refresh();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });

  const addItemForm = modal.body.querySelector('#add-item-form');
  if (addItemForm) {
    addItemForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = formValues(addItemForm);
      const submit = addItemForm.querySelector('button[type="submit"]');
      await withBusy(
        submit,
        async () => {
          try {
            await api.post(`/api/invoices/${invoice.id}/items`, values);
            toast('Charge added to the invoice.');
            refresh();
          } catch (error) {
            toast(error.message, 'error');
          }
        },
        'Adding\u2026'
      );
    });
  }

  const addPaymentForm = modal.body.querySelector('#add-payment-form');
  if (addPaymentForm) {
    addPaymentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = formValues(addPaymentForm);
      const submit = addPaymentForm.querySelector('button[type="submit"]');
      await withBusy(
        submit,
        async () => {
          try {
            await api.post(`/api/invoices/${invoice.id}/payments`, values);
            toast('Payment recorded.');
            refresh();
          } catch (error) {
            toast(error.message, 'error');
          }
        },
        'Saving\u2026'
      );
    });
  }
}

/* ================================================================== */
/* Reservation detail                                                  */
/* ================================================================== */

export async function openReservationDetail(id, { onDone } = {}) {
  let reservation;
  try {
    const data = await api.get(`/api/reservations/${id}`);
    reservation = data.reservation;
  } catch (error) {
    toast(error.message, 'error');
    return;
  }

  const pending = needsApproval(reservation);
  const meta = pending ? approvalStatusMeta('pending') : reservationStatusMeta(reservation.status);
  const canWrite = can('receptionist', 'admin');
  const actions = [];
  if (canWrite && pending) {
    actions.push('<button class="btn btn-danger" type="button" id="rd-decline">Decline request</button>');
    actions.push('<button class="btn btn-primary" type="button" id="rd-approve">Approve request</button>');
  }
  if (canWrite && !pending && reservation.status === 'reserved' && reservation.checkInDate <= todayISO()) {
    actions.push('<button class="btn btn-primary" type="button" id="rd-checkin">Check in</button>');
  }
  if (canWrite && !pending && reservation.status === 'checked_in') {
    actions.push('<button class="btn btn-primary" type="button" id="rd-checkout">Check out</button>');
  }
  if (canWrite && !pending && reservation.status === 'reserved') {
    actions.push('<button class="btn btn-danger" type="button" id="rd-cancel">Cancel reservation</button>');
  }
  if (reservation.invoiceId) {
    actions.push('<button class="btn btn-ghost" type="button" id="rd-invoice">View invoice</button>');
  }

  const modal = openModal({
    title: `Reservation ${esc(reservation.code)}`,
    subtitle: `${esc(reservation.guestName)} \u00B7 Room ${esc(reservation.roomNumber)}`,
    size: 'md',
    body: `<div class="detail-head">
      <div class="confirm-person">
        <span class="avatar lg">${initials(reservation.guestName)}</span>
        <div><strong>${esc(reservation.guestName)}</strong><span>${esc(reservation.guestPhone)}</span></div>
      </div>
      <div class="detail-badges">${statusPill(meta)}${bookingSourcePill(reservation.source)}</div>
    </div>
    ${
      pending
        ? `<div class="notice">${icon('bell', 16)} <div><strong>This online request needs a decision</strong>
            <span>Approve it to hold room ${esc(reservation.roomNumber)}, or decline it to release the dates.</span></div></div>`
        : ''
    }
    <div class="detail-grid">
      <div><span>Room</span><strong>${esc(reservation.roomNumber)} \u00B7 ${esc(reservation.roomType)}</strong>
        <small>Floor ${reservation.floor}</small></div>
      <div><span>Stay</span><strong>${rangeLabel(reservation.checkInDate, reservation.checkOutDate)}</strong>
        <small>${nightsLabel(reservation.nights)} \u00B7 ${guestCount(reservation.adults, reservation.children)}</small></div>
      <div><span>Nightly rate</span><strong>${money(reservation.nightlyRate)}</strong>
        <small>Estimate ${money(reservation.nightlyRate * reservation.nights)} before extras</small></div>
      <div><span>Booked on</span><strong>${fmtDate(reservation.createdAt)}</strong>
        <small>${fmtDateTime(reservation.createdAt)}</small></div>
      <div><span>Booking channel</span><strong>${esc(bookingSourceMeta(reservation.source).label)}</strong>
        <small>${reservation.source === 'website' ? 'Submitted on the guest site' : 'Entered by staff'}</small></div>
      <div><span>Approval</span><strong>${esc(approvalStatusMeta(reservation.approvalStatus).label)}</strong>
        <small>${
          pending
            ? 'Waiting for front desk review'
            : reservation.approvalStatus === 'declined'
            ? 'Request declined'
            : 'Ready for the arrival list'
        }</small></div>
    </div>
    ${
      reservation.notes
        ? `<div class="note-block"><span>Notes</span><p>${esc(reservation.notes)}</p></div>`
        : ''
    }
    <div class="mini-timeline">
      <div><span class="timeline-dot"></span>${
        reservation.source === 'website' ? 'Online request received' : 'Reservation created'
      } \u00B7 ${fmtDateTime(reservation.createdAt)}</div>
      ${
        pending
          ? '<div><span class="timeline-dot amber"></span>Awaiting front desk approval</div>'
          : reservation.approvalStatus === 'declined'
          ? '<div><span class="timeline-dot red"></span>Request declined by the front desk</div>'
          : ''
      }
      ${
        reservation.checkedInAt
          ? `<div><span class="timeline-dot"></span>Checked in \u00B7 ${fmtDateTime(reservation.checkedInAt)}</div>`
          : ''
      }
      ${
        reservation.checkedOutAt
          ? `<div><span class="timeline-dot"></span>Checked out \u00B7 ${fmtDateTime(reservation.checkedOutAt)}</div>`
          : ''
      }
    </div>
    <div class="detail-actions no-print">
      <button type="button" class="link-btn" id="rd-guest">View guest profile</button>
      ${
        reservation.balance != null
          ? `<span class="muted small">Invoice balance: <strong>${money(reservation.balance)}</strong></span>`
          : ''
      }
    </div>`,
    footer: `<button class="btn btn-ghost" type="button" data-close>Close</button>${actions.join('')}`,
  });

  modal.footer.querySelector('[data-close]').addEventListener('click', modal.close);
  modal.body.querySelector('#rd-guest').addEventListener('click', () => {
    modal.close();
    openGuestDetail(reservation.guestId, { onDone });
  });

  const approve = modal.footer.querySelector('#rd-approve');
  if (approve) {
    approve.addEventListener('click', () => {
      modal.close();
      approveBookingRequest(reservation, { onDone });
    });
  }
  const decline = modal.footer.querySelector('#rd-decline');
  if (decline) {
    decline.addEventListener('click', () => {
      modal.close();
      openDeclineRequest(reservation, { onDone });
    });
  }

  const checkIn = modal.footer.querySelector('#rd-checkin');
  if (checkIn) {
    checkIn.addEventListener('click', () => {
      modal.close();
      openCheckIn(reservation, { onDone });
    });
  }
  const checkOut = modal.footer.querySelector('#rd-checkout');
  if (checkOut) {
    checkOut.addEventListener('click', () => {
      modal.close();
      openCheckout(reservation, { onDone });
    });
  }
  const cancel = modal.footer.querySelector('#rd-cancel');
  if (cancel) {
    cancel.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Cancel reservation?',
        message: `${reservation.code} for ${reservation.guestName} will be cancelled.`,
        confirmLabel: 'Cancel reservation',
        cancelLabel: 'Keep reservation',
      });
      if (!confirmed) return;
      try {
        await api.post(`/api/reservations/${reservation.id}/cancel`);
        modal.close();
        toast('Reservation cancelled.');
        if (typeof onDone === 'function') onDone();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }
  const invoiceButton = modal.footer.querySelector('#rd-invoice');
  if (invoiceButton) {
    invoiceButton.addEventListener('click', () => {
      modal.close();
      openInvoice(reservation.invoiceId, { onDone });
    });
  }
}

/* ================================================================== */
/* Guests                                                              */
/* ================================================================== */

export async function openGuestDetail(id, { onDone } = {}) {
  let detail;
  try {
    detail = await api.get(`/api/guests/${id}`);
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  const guest = detail.guest;
  const canEdit = can('receptionist', 'admin');

  const staysRows = detail.reservations.length
    ? detail.reservations
        .map(
          (reservation) => `<tr>
            <td><span class="cell-title">${esc(reservation.code)}</span>
              <span class="cell-sub">${fmtDateTime(reservation.createdAt)}</span></td>
            <td><span class="cell-title">Room ${esc(reservation.roomNumber)}</span>
              <span class="cell-sub">${esc(reservation.roomType)}</span></td>
            <td>${rangeLabel(reservation.checkInDate, reservation.checkOutDate)}
              <span class="cell-sub">${nightsLabel(reservation.nights)}</span></td>
            <td>${statusPill(reservationStatusMeta(reservation.status))}</td>
            <td class="num"><button type="button" class="link-btn" data-view-reservation="${reservation.id}">Open</button></td>
          </tr>`
        )
        .join('')
    : '';

  const invoiceRows = detail.invoices.length
    ? detail.invoices
        .map(
          (invoice) => `<tr>
            <td><span class="cell-title">${esc(invoice.number)}</span>
              <span class="cell-sub">${fmtDate(invoice.issuedAt)}</span></td>
            <td>Room ${esc(invoice.roomNumber)} <span class="cell-sub">${nightsLabel(invoice.nights)}</span></td>
            <td class="num">${money(invoice.total)}</td>
            <td>${statusPill(invoiceStatusMeta(invoice.status))}</td>
            <td class="num"><button type="button" class="link-btn" data-view-invoice="${invoice.id}">View</button></td>
          </tr>`
        )
        .join('')
    : '';

  const modal = openModal({
    title: esc(guest.fullName),
    subtitle: guest.email ? esc(guest.email) : 'Guest profile',
    size: 'lg',
    body: `<div class="detail-head">
      <div class="confirm-person">
        <span class="avatar xl">${initials(guest.fullName)}</span>
        <div><strong>${esc(guest.fullName)}</strong>
          <span>${esc(guest.phone)}${guest.email ? ` \u00B7 ${esc(guest.email)}` : ''}</span></div>
      </div>
      ${guest.activeStays > 0 ? pill('Currently in-house', 'green') : pill('Past guest', 'gray')}
    </div>
    <div class="detail-grid">
      <div><span>Phone</span><strong>${esc(guest.phone)}</strong></div>
      <div><span>Email</span><strong>${esc(guest.email || '\u2014')}</strong></div>
      <div><span>ID</span><strong>${esc(guest.idType || '\u2014')}</strong><small>${esc(guest.idNumber || '')}</small></div>
      <div><span>Address</span><strong class="wrap-text">${esc(guest.address || '\u2014')}</strong></div>
      <div><span>Total stays</span><strong>${guest.stays}</strong><small>${guest.activeStays} active</small></div>
      <div><span>Last stay</span><strong>${guest.lastStay ? fmtDate(guest.lastStay) : '\u2014'}</strong></div>
    </div>
    ${guest.notes ? `<div class="note-block"><span>Notes</span><p>${esc(guest.notes)}</p></div>` : ''}
    <div class="form-section">
      <div class="section-label">Stay history</div>
      ${
        staysRows
          ? `<div class="table-wrap"><table class="table"><thead><tr><th>Reservation</th><th>Room</th><th>Stay</th><th>Status</th><th></th></tr></thead><tbody>${staysRows}</tbody></table></div>`
          : emptyState('calendar', 'No stays yet', 'Reservations for this guest will appear here.')
      }
    </div>
    <div class="form-section">
      <div class="section-label">Invoices</div>
      ${
        invoiceRows
          ? `<div class="table-wrap"><table class="table"><thead><tr><th>Invoice</th><th>Room</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody>${invoiceRows}</tbody></table></div>`
          : emptyState('receipt', 'No invoices yet', 'Invoices are created at check-out.')
      }
    </div>`,
    footer: `${canEdit ? '<button class="btn btn-ghost" type="button" id="gd-edit">Edit profile</button>' : ''}
      <button class="btn btn-primary" type="button" data-close>Close</button>`,
  });

  modal.footer.querySelector('[data-close]').addEventListener('click', modal.close);
  const editButton = modal.footer.querySelector('#gd-edit');
  if (editButton) {
    editButton.addEventListener('click', () => {
      modal.close();
      openGuestForm(guest, { onDone });
    });
  }

  modal.body.querySelectorAll('[data-view-reservation]').forEach((button) => {
    button.addEventListener('click', () => {
      modal.close();
      openReservationDetail(Number(button.dataset.viewReservation), { onDone });
    });
  });
  modal.body.querySelectorAll('[data-view-invoice]').forEach((button) => {
    button.addEventListener('click', () => {
      modal.close();
      openInvoice(Number(button.dataset.viewInvoice), { onDone });
    });
  });
}

export function openGuestForm(guest = null, { onDone } = {}) {
  if (!can('receptionist', 'admin')) {
    toast('Only front desk staff can edit guest profiles.', 'error');
    return;
  }
  const editing = Boolean(guest);
  const g = guest || {
    fullName: '',
    phone: '',
    email: '',
    address: '',
    idType: '',
    idNumber: '',
    notes: '',
  };

  const modal = openModal({
    title: editing ? 'Edit guest profile' : 'New guest',
    subtitle: editing ? 'Update the details kept on file.' : 'Create a guest record for future stays.',
    size: 'md',
    body: `<form id="guest-form" class="form-stack">
      <div class="form-grid">
        <label class="field span-2"><span>Full name</span><input name="fullName" value="${esc(g.fullName)}" required /></label>
        <label class="field"><span>Phone</span><input name="phone" value="${esc(g.phone)}" required /></label>
        <label class="field"><span>Email</span><input name="email" type="email" value="${esc(g.email)}" /></label>
        <label class="field span-2"><span>Address</span><input name="address" value="${esc(g.address)}" /></label>
        <label class="field"><span>ID type</span><input name="idType" value="${esc(g.idType)}" placeholder="Passport, driver's license" /></label>
        <label class="field"><span>ID number</span><input name="idNumber" value="${esc(g.idNumber)}" /></label>
        <label class="field span-2"><span>Notes</span><textarea name="notes" rows="2">${esc(g.notes)}</textarea></label>
      </div>
    </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-primary" type="button" id="guest-save">${editing ? 'Save changes' : 'Create guest'}</button>`,
  });

  modal.footer.querySelector('[data-cancel]').addEventListener('click', modal.close);
  const save = modal.footer.querySelector('#guest-save');
  save.addEventListener('click', () => {
    const form = modal.body.querySelector('#guest-form');
    if (!form.reportValidity()) return;
    const values = formValues(form);
    withBusy(
      save,
      async () => {
        try {
          if (editing) {
            await api.patch(`/api/guests/${guest.id}`, values);
            toast('Guest profile updated.');
          } else {
            await api.post('/api/guests', values);
            toast('Guest added.');
          }
          modal.close();
          if (typeof onDone === 'function') onDone();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
      'Saving\u2026'
    );
  });
}

/* ================================================================== */
/* Rooms                                                               */
/* ================================================================== */

export async function openRoomDetail(id, { onDone } = {}) {
  let detail;
  try {
    detail = await api.get(`/api/rooms/${id}`);
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  const { room, current, upcoming, logs } = detail;
  const meta = {
    available: { label: 'Available', tone: 'green' },
    occupied: { label: 'Occupied', tone: 'red' },
    cleaning: { label: 'Needs cleaning', tone: 'amber' },
    maintenance: { label: 'Out of service', tone: 'gray' },
  }[room.status];

  const canHousekeep = can('admin', 'receptionist', 'housekeeping');
  const actions = [];
  if (canHousekeep && !current) {
    if (room.status === 'cleaning') {
      actions.push('<button class="btn btn-primary" type="button" data-room-action="available">Mark ready</button>');
    }
    if (room.status === 'maintenance') {
      actions.push('<button class="btn btn-primary" type="button" data-room-action="available">Return to service</button>');
    }
    if (room.status === 'available') {
      actions.push('<button class="btn btn-ghost" type="button" data-room-action="cleaning">Flag for cleaning</button>');
    }
    if (room.status !== 'maintenance') {
      actions.push('<button class="btn btn-ghost" type="button" data-room-action="maintenance">Report out of service</button>');
    }
  }
  if (can('admin')) {
    actions.push('<button class="btn btn-ghost" type="button" id="room-edit">Edit room</button>');
  }

  const upcomingRows = upcoming.length
    ? upcoming
        .map(
          (reservation) => `<div class="room-upcoming">
            <div><strong>${esc(reservation.guestName)}</strong>
              <span>${esc(reservation.code)} \u00B7 ${nightsLabel(reservation.nights)}</span></div>
            <span>${rangeLabel(reservation.checkInDate, reservation.checkOutDate)}</span>
          </div>`
        )
        .join('')
    : `<p class="muted small">No upcoming reservations for this room.</p>`;

  const logsRows = logs.length
    ? logs
        .map(
          (log) => `<div class="room-log">
            <span class="timeline-dot"></span>
            <div><p>${esc(log.note || 'Room status updated.')}</p>
              <span>${esc(log.updatedByName)} \u00B7 ${fmtDateTime(log.createdAt)}</span></div>
          </div>`
        )
        .join('')
    : `<p class="muted small">No housekeeping updates recorded yet.</p>`;

  const modal = openModal({
    title: `Room ${esc(room.number)}`,
    subtitle: `${esc(room.type)} \u00B7 Floor ${room.floor}`,
    size: 'md',
    body: `<div class="detail-head">
      <div class="room-heading">
        <span class="room-badge" style="--room-tone:${
          { available: '#2e8b63', occupied: '#c4554d', cleaning: '#d08a23', maintenance: '#7d828d' }[room.status]
        }">${esc(room.number)}</span>
        <div><strong>${esc(room.type)}</strong><span>${money(room.rate)} per night</span></div>
      </div>
      ${statusPill(meta)}
    </div>
    <div class="detail-grid">
      <div><span>Nightly rate</span><strong>${money(room.rate)}</strong></div>
      <div><span>Floor</span><strong>${room.floor}</strong></div>
      <div><span>Last update</span><strong>${fmtDateTime(room.updatedAt)}</strong></div>
      <div><span>Notes</span><strong>${esc(room.notes || '\u2014')}</strong></div>
    </div>
    ${
      current
        ? `<div class="current-stay">
            <div class="section-label">Current stay</div>
            <div class="confirm-person">
              <span class="avatar">${initials(current.guestName)}</span>
              <div><strong>${esc(current.guestName)}</strong>
                <span>${esc(current.code)} \u00B7 Check-out ${fmtDate(current.checkOutDate)}</span></div>
              <span class="pill green">In-house</span>
            </div>
          </div>`
        : ''
    }
    <div class="form-section">
      <div class="section-label">Upcoming reservations</div>
      ${upcomingRows}
    </div>
    <div class="form-section">
      <div class="section-label">Housekeeping history</div>
      <div class="room-logs">${logsRows}</div>
    </div>`,
    footer: `<button class="btn btn-ghost" type="button" data-close>Close</button>${actions.join('')}`,
  });

  modal.footer.querySelector('[data-close]').addEventListener('click', modal.close);
  const editButton = modal.footer.querySelector('#room-edit');
  if (editButton) {
    editButton.addEventListener('click', () => {
      modal.close();
      openRoomForm(room, { onDone });
    });
  }

  modal.footer.querySelectorAll('[data-room-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const status = button.dataset.roomAction;
      const note = {
        available: 'Room cleaned and inspected.',
        cleaning: 'Room flagged for cleaning.',
        maintenance: 'Room reported out of service.',
      }[status];
      try {
        await api.patch(`/api/rooms/${room.id}`, { status, note });
        modal.close();
        toast(`Room ${room.number} updated.`);
        if (typeof onDone === 'function') onDone();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });
}

export function openRoomForm(room = null, { onDone } = {}) {
  if (!can('admin')) {
    toast('Only administrators can manage rooms.', 'error');
    return;
  }
  const editing = Boolean(room);
  const r = room || { number: '', type: 'Standard Room', floor: 1, rate: 1800, notes: '' };

  const modal = openModal({
    title: editing ? `Edit room ${esc(r.number)}` : 'New room',
    subtitle: 'Room inventory and nightly rate.',
    size: 'sm',
    body: `<form id="room-form" class="form-stack">
      <div class="form-grid">
        <label class="field"><span>Room number</span><input name="number" value="${esc(r.number)}" required /></label>
        <label class="field"><span>Floor</span><input name="floor" type="number" min="0" value="${r.floor}" required /></label>
        <label class="field span-2"><span>Room type</span><input name="type" value="${esc(r.type)}" required /></label>
        <label class="field span-2"><span>Nightly rate</span><input name="rate" type="number" min="1" step="0.01" value="${r.rate}" required /></label>
        <label class="field span-2"><span>Notes</span><textarea name="notes" rows="2">${esc(r.notes)}</textarea></label>
      </div>
    </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-primary" type="button" id="room-save">${editing ? 'Save room' : 'Add room'}</button>`,
  });

  modal.footer.querySelector('[data-cancel]').addEventListener('click', modal.close);
  const save = modal.footer.querySelector('#room-save');
  save.addEventListener('click', () => {
    const form = modal.body.querySelector('#room-form');
    if (!form.reportValidity()) return;
    const values = formValues(form);
    withBusy(
      save,
      async () => {
        try {
          if (editing) {
            await api.patch(`/api/rooms/${room.id}`, values);
            toast(`Room ${values.number} updated.`);
          } else {
            await api.post('/api/rooms', values);
            toast(`Room ${values.number} added.`);
          }
          modal.close();
          if (typeof onDone === 'function') onDone();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
      'Saving\u2026'
    );
  });
}

/* ================================================================== */
/* Staff                                                               */
/* ================================================================== */

export function openStaffForm(user = null, { onDone } = {}) {
  if (!can('admin')) return;
  const editing = Boolean(user);
  const u = user || { fullName: '', username: '', role: 'receptionist', phone: '' };

  const roleOptions = Object.entries(ROLE_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${value}" ${value === u.role ? 'selected' : ''}>${label}</option>`
    )
    .join('');

  const modal = openModal({
    title: editing ? 'Edit staff account' : 'New staff account',
    subtitle: editing ? `@${esc(u.username)}` : 'Create login credentials for a team member.',
    size: 'sm',
    body: `<form id="staff-form" class="form-stack">
      <div class="form-grid">
        <label class="field span-2"><span>Full name</span><input name="fullName" value="${esc(u.fullName)}" required /></label>
        <label class="field span-2"><span>Username</span>
          <input name="username" value="${esc(u.username)}" ${editing ? 'disabled' : ''} required />
        </label>
        <label class="field"><span>Role</span><select name="role">${roleOptions}</select></label>
        <label class="field"><span>Phone</span><input name="phone" value="${esc(u.phone)}" /></label>
        <label class="field span-2"><span>${editing ? 'New password (optional)' : 'Password'}</span>
          <input name="password" type="password" ${editing ? '' : 'required'} placeholder="${
      editing ? 'Leave blank to keep the current password' : 'At least 6 characters'
    }" />
        </label>
      </div>
    </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-primary" type="button" id="staff-save">${editing ? 'Save account' : 'Create account'}</button>`,
  });

  modal.footer.querySelector('[data-cancel]').addEventListener('click', modal.close);
  const save = modal.footer.querySelector('#staff-save');
  save.addEventListener('click', () => {
    const form = modal.body.querySelector('#staff-form');
    if (!form.reportValidity()) return;
    const values = formValues(form);
    if (editing) delete values.username;
    if (editing && !values.password) delete values.password;
    withBusy(
      save,
      async () => {
        try {
          if (editing) {
            await api.patch(`/api/users/${user.id}`, values);
            toast('Staff account updated.');
          } else {
            await api.post('/api/users', values);
            toast('Staff account created.');
          }
          modal.close();
          if (typeof onDone === 'function') onDone();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
      'Saving\u2026'
    );
  });
}

export function openPasswordReset(user, { onDone } = {}) {
  if (!can('admin')) return;
  const modal = openModal({
    title: 'Reset password',
    subtitle: `Set a new password for @${esc(user.username)}.`,
    size: 'sm',
    body: `<form id="pw-form">
      <label class="field"><span>New password</span>
        <input name="password" type="password" placeholder="At least 6 characters" required />
      </label>
    </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-primary" type="button" id="pw-save">Update password</button>`,
  });

  modal.footer.querySelector('[data-cancel]').addEventListener('click', modal.close);
  const save = modal.footer.querySelector('#pw-save');
  save.addEventListener('click', () => {
    const form = modal.body.querySelector('#pw-form');
    if (!form.reportValidity()) return;
    const { password } = formValues(form);
    withBusy(
      save,
      async () => {
        try {
          await api.patch(`/api/users/${user.id}`, { password });
          modal.close();
          toast('Password updated.');
          if (typeof onDone === 'function') onDone();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
      'Saving\u2026'
    );
  });
}
