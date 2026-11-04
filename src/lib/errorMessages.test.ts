import { describe, expect, it } from 'vitest';
import { NETWORK_ERROR_MESSAGE, isNetworkErrorMessage, toUserMessage } from './errorMessages';

describe('toUserMessage', () => {
  it('traduce los errores de red de los distintos navegadores', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'), 'x')).toBe(NETWORK_ERROR_MESSAGE);
    expect(toUserMessage({ message: 'TypeError: Failed to fetch' }, 'x')).toBe(NETWORK_ERROR_MESSAGE);
    expect(toUserMessage(new TypeError('NetworkError when attempting to fetch resource.'), 'x')).toBe(NETWORK_ERROR_MESSAGE);
    expect(toUserMessage(new TypeError('Load failed'), 'x')).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('muestra los mensajes de la base sin el prefijo técnico', () => {
    expect(toUserMessage({ message: 'P0001: La caja ya está cerrada.' }, 'x')).toBe('La caja ya está cerrada.');
  });

  it('usa el texto de respaldo si no hay mensaje', () => {
    expect(toUserMessage(null, 'No se pudo cargar.')).toBe('No se pudo cargar.');
    expect(toUserMessage(new Error(''), 'No se pudo cargar.')).toBe('No se pudo cargar.');
  });
});

describe('isNetworkErrorMessage', () => {
  it('no confunde errores de negocio con errores de red', () => {
    expect(isNetworkErrorMessage('El usuario no es un miembro activo de esta empresa.')).toBe(false);
  });
});
