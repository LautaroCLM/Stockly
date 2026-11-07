import { describe, expect, it } from 'vitest';
import {
  dayScheduleText, formatDuration, fromLocalInput, isoWeekday, toLocalInput, toMinutes, validateSchedule, weeklyMinutes,
} from './timeMath';
import type { ScheduleBlock } from './types';

const block = (weekday: number, start: string, end: string): ScheduleBlock => ({ weekday, start, end });

describe('timeMath', () => {
  it('convierte HH:MM a minutos', () => {
    expect(toMinutes('08:30')).toBe(510);
    expect(toMinutes('08:30:00')).toBe(510);
    expect(toMinutes('24:00')).toBeNull();
    expect(toMinutes('')).toBeNull();
  });

  it('usa lunes = 1 y domingo = 7', () => {
    expect(isoWeekday(new Date(2026, 10, 7))).toBe(6); // sábado
    expect(isoWeekday(new Date(2026, 10, 8))).toBe(7); // domingo
    expect(isoWeekday(new Date(2026, 10, 9))).toBe(1); // lunes
  });

  it('formatea duraciones', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(520)).toBe('8 h 40 min');
  });

  it('valida los bloques del horario', () => {
    expect(validateSchedule([block(1, '08:00', '12:00'), block(1, '14:00', '18:00')])).toBeNull();
    expect(validateSchedule([block(1, '18:00', '08:00')])).toContain('terminar después');
    expect(validateSchedule([block(1, '', '08:00')])).toContain('Completá');
    expect(validateSchedule([block(2, '08:00', '12:00'), block(2, '11:00', '15:00')])).toContain('martes');
    expect(validateSchedule([block(2, '08:00', '12:00'), block(3, '11:00', '15:00')])).toBeNull();
  });

  it('suma las horas semanales y arma el texto del día', () => {
    const blocks = [block(1, '14:00', '18:00'), block(1, '08:00', '12:00'), block(2, '08:00', '12:30')];
    expect(weeklyMinutes(blocks)).toBe(750);
    expect(dayScheduleText(blocks, 1)).toBe('08:00-12:00 · 14:00-18:00');
    expect(dayScheduleText(blocks, 3)).toBeNull();
  });

  it('ida y vuelta de datetime-local', () => {
    const iso = fromLocalInput('2026-11-07T08:20');
    expect(iso).not.toBeNull();
    expect(toLocalInput(iso as string)).toBe('2026-11-07T08:20');
    expect(fromLocalInput('')).toBeNull();
  });
});
