import { describe, expect, it } from 'vitest';
import { buildSetupSteps, countDone, shouldShowGuide, type SetupProgress } from './setupSteps';

const empty: SetupProgress = { hasIssuerData: false, hasLogo: false, productCount: 0, employeeCount: 0, memberCount: 1, saleCount: 0 };

describe('buildSetupSteps', () => {
  it('con la empresa recién creada no hay ningún paso hecho', () => {
    const steps = buildSetupSteps(empty);
    expect(steps.map((s) => s.id)).toEqual(['empresa', 'productos', 'equipo', 'venta']);
    expect(countDone(steps)).toBe(0);
  });

  it('los datos de empresa cuentan con el logo o con los datos del emisor', () => {
    expect(buildSetupSteps({ ...empty, hasLogo: true })[0].done).toBe(true);
    expect(buildSetupSteps({ ...empty, hasIssuerData: true })[0].done).toBe(true);
  });

  it('el equipo cuenta con un empleado cargado o con otro usuario además del dueño', () => {
    expect(buildSetupSteps({ ...empty, employeeCount: 1 })[2].done).toBe(true);
    expect(buildSetupSteps({ ...empty, memberCount: 2 })[2].done).toBe(true);
    expect(buildSetupSteps({ ...empty, memberCount: 1 })[2].done).toBe(false);
  });

  it('productos y venta se marcan con al menos uno', () => {
    const steps = buildSetupSteps({ ...empty, productCount: 3, saleCount: 1 });
    expect(steps[1].done).toBe(true);
    expect(steps[3].done).toBe(true);
  });
});

describe('shouldShowGuide', () => {
  it('se oculta al terminar todos los pasos o si la ocultaron', () => {
    const all = buildSetupSteps({ hasIssuerData: true, hasLogo: true, productCount: 1, employeeCount: 1, memberCount: 1, saleCount: 1 });
    expect(shouldShowGuide(all, false)).toBe(false);
    expect(shouldShowGuide(buildSetupSteps(empty), true)).toBe(false);
    expect(shouldShowGuide(buildSetupSteps(empty), false)).toBe(true);
  });
});
