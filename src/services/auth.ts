import { create, destroy, patch, read } from './firebase';
import { sha256 } from '../utils/format';
import type { GuestAccount } from '../types/domain';

const SESSION_KEY = 'zogquiz.admin';
const GUEST_SESSION_KEY = 'zogquiz.guest';

export type AdminSession = { uid: string; loginId: string };
export type GuestSession = { accountId: string; participantId: string; displayName: string; loginId: string; buzzerSound?: string };

export function getAdminSession(): AdminSession | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
export function setAdminSession(session: AdminSession | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY);
}
export function getGuestSession(): GuestSession | null {
  try { return JSON.parse(localStorage.getItem(GUEST_SESSION_KEY) || 'null'); } catch { return null; }
}
export function setGuestSession(session: GuestSession | null) {
  if (session) localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(GUEST_SESSION_KEY);
}

export async function signupAdmin(loginId: string, password: string) {
  const existing = await read<string>(`adminLoginIndex/${loginId}`);
  if (existing) throw new Error('Cet ID admin existe déjà.');
  const uid = await create('admins', { loginId, passwordHash: await sha256(password) });
  await patch(`adminLoginIndex`, { [loginId]: uid });
  return { uid, loginId };
}

export async function loginAdmin(loginId: string, password: string) {
  const uid = await read<string>(`adminLoginIndex/${loginId}`);
  if (!uid) throw new Error('Identifiants invalides.');
  const admin = await read<{ passwordHash: string }>(`admins/${uid}`);
  if (!admin || admin.passwordHash !== await sha256(password)) throw new Error('Identifiants invalides.');
  return { uid, loginId };
}

export async function createGuestAccount(loginId: string, password: string, displayName: string, buzzerSound = 'buzzer.mp3') {
  const existing = await read<string>(`guestLoginIndex/${loginId}`);
  if (existing) throw new Error('Cet ID invité existe déjà.');
  const participantId = await create('rooms/manche1/participants', { nickname: displayName, displayName, score: 0, buzzerSound, online: false });
  const accountId = await create('guestAccounts', { loginId, displayName, participantId, buzzerSound, passwordHash: await sha256(password) });
  await patch('guestLoginIndex', { [loginId]: accountId });
  return accountId;
}

export async function removeGuestAccount(account: GuestAccount) {
  await destroy(`guestAccounts/${account.id}`);
  await destroy(`guestLoginIndex/${account.loginId}`);
  if (account.participantId) await destroy(`rooms/manche1/participants/${account.participantId}`);
}

export async function loginGuest(loginId: string, password: string) {
  const accountId = await read<string>(`guestLoginIndex/${loginId}`);
  if (!accountId) throw new Error('Compte invité introuvable.');
  const account = await read<Omit<GuestAccount, 'id'>>(`guestAccounts/${accountId}`);
  if (!account || account.passwordHash !== await sha256(password)) throw new Error('Mot de passe invalide.');
  let participantId = account.participantId;
  if (!participantId) {
    participantId = await create('rooms/manche1/participants', { nickname: account.displayName || loginId, displayName: account.displayName || loginId, score: 0, online: true });
    await patch(`guestAccounts/${accountId}`, { participantId });
  }
  return { accountId, participantId, displayName: account.displayName || loginId, loginId, buzzerSound: account.buzzerSound };
}
