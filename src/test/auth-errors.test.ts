import { describe, it, expect } from 'vitest';
import { loginErrorKey, registerErrorKey } from '../lib/authErrors';
import { ApiError } from '../api/client';

describe('auth error -> i18n key mapping', () => {
  it('maps login failures', () => {
    expect(loginErrorKey(new ApiError('network', 0))).toBe('auth.networkError');
    expect(loginErrorKey(new ApiError('Invalid username or password.', 401))).toBe(
      'auth.invalidCredentials',
    );
    expect(loginErrorKey(new ApiError('boom', 500))).toBe('auth.genericError');
    expect(loginErrorKey(new Error('nope'))).toBe('auth.genericError');
  });

  it('maps register failures to the two known duplicate cases, else generic', () => {
    expect(registerErrorKey(new ApiError('Username is already taken.', 400))).toBe(
      'auth.usernameTaken',
    );
    expect(registerErrorKey(new ApiError('Email is already registered.', 400))).toBe(
      'auth.emailTaken',
    );
    expect(registerErrorKey(new ApiError('network', 0))).toBe('auth.networkError');
    // Server-side FluentValidation prose degrades to a localized generic message.
    expect(registerErrorKey(new ApiError('Password must be at least 8 characters.', 400))).toBe(
      'auth.genericError',
    );
  });
});
