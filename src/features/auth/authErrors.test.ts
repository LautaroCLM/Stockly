import { describe, expect, it } from 'vitest';
import { GENERIC_AUTH_ERROR, NETWORK_AUTH_ERROR, translateAuthError } from './authErrors';

describe('translateAuthError', () => {
  it('traduce credenciales inválidas por código', () => {
    expect(
      translateAuthError({ message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 })
    ).toBe('El correo o la contraseña son incorrectos.');
  });

  it('traduce credenciales inválidas sin código usando el mensaje', () => {
    expect(translateAuthError({ message: 'Invalid login credentials', status: 400 })).toBe(
      'El correo o la contraseña son incorrectos.'
    );
  });

  it('traduce el límite de intentos por status 429', () => {
    expect(translateAuthError({ message: 'Too many requests', status: 429 })).toMatch(/Demasiados intentos/);
  });

  it('detecta errores de red', () => {
    expect(translateAuthError({ message: 'Failed to fetch', name: 'AuthRetryableFetchError', status: 0 })).toBe(
      NETWORK_AUTH_ERROR
    );
    expect(translateAuthError(new TypeError('Failed to fetch'))).toBe(NETWORK_AUTH_ERROR);
  });

  it('nunca muestra el mensaje en inglés de un error desconocido', () => {
    expect(translateAuthError({ message: 'Something odd happened', status: 500 })).toBe(GENERIC_AUTH_ERROR);
  });
});
