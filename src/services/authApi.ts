import { request } from './http';
import type { UserAccount } from '../types';
export async function getSession(): Promise<UserAccount | null> { return (await request('auth.php')).user; }
export async function login(email: string, password: string): Promise<UserAccount> {
  await getSession();
  return (await request('auth.php', { method: 'POST', body: JSON.stringify({ email, password }) })).user;
}
export async function logout(): Promise<void> { await request('auth.php', { method: 'DELETE' }); }
