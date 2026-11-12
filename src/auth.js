import crypto from 'node:crypto';
import { get } from './db.js';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

export async function getSessionUser(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = (await get('SELECT * FROM users WHERE id = ? AND active = 1', session.userId));
  return user || null;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expires < now) sessions.delete(token);
  }
}, 15 * 60 * 1000).unref();

export const ROLE_LABELS = {
  admin: 'Administrator',
  receptionist: 'Receptionist',
  manager: 'Manager',
  housekeeping: 'Housekeeping',
};
