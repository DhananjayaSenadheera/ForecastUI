// Auth error -> i18n key mapping (FE-17). Kept as a pure, tested lib because the
// mapping is real logic: it turns transport/status facts (and the backend's FIXED
// English messages — see the AUTH contract in types.ts) into localized keys so no
// untranslated server prose reaches the farmer.
import { ApiError } from '../api/client';

/** Login failure -> i18n key. 401 = wrong credentials; status 0 = network. */
export function loginErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'auth.networkError';
    if (err.status === 401) return 'auth.invalidCredentials';
  }
  return 'auth.genericError';
}

/** Register failure -> i18n key. Matches the two known duplicate-account messages;
 *  everything else (incl. server-side FluentValidation, which the client mirrors
 *  first) degrades to a generic localized message. */
export function registerErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'auth.networkError';
    const m = err.message.toLowerCase();
    if (m.includes('username') && m.includes('taken')) return 'auth.usernameTaken';
    if (m.includes('email') && m.includes('registered')) return 'auth.emailTaken';
  }
  return 'auth.genericError';
}
