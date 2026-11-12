export const state = {
  user: null,
  settings: null,
  staff: null,
};

export function setSession({ user, settings, staff = null }) {
  state.user = user;
  state.settings = settings;
  state.staff = staff;
}

export function clearSession() {
  state.user = null;
  state.settings = null;
  state.staff = null;
}

export function can(...roles) {
  if (!state.user) return false;
  if (!roles.length) return true;
  return roles.includes(state.user.role);
}
