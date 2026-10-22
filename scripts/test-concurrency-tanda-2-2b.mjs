/**
 * Arnés de integración multi-conexión para verificar concurrencia real (Tanda 2.2B - Paso 22G).
 * Abre 3 sesiones PostgreSQL independientes (ConnA, ConnB, ConnM) mediante `docker exec -i ... psql`
 * con stdout/stderr unificados (2>&1), marcador :SQLSTATE correlacionado por ID de comando,
 * invalidación de sesión tras timeout, verificación pre-flight anti-colisión, separación de
 * preparación y commit, preservación de candidateCompId ante fallos post-commit y limpieza
 * atómica estrictamente comprobada por consulta independiente.
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_Stockly';
const SENTINEL_PREFIX = '__STOCKLY_CMD_DONE__|';

const NORMAL_TIMEOUT_MS = 8000;
const BLOCKING_TIMEOUT_MS = 20000;
const CLEANUP_TIMEOUT_MS = 15000;

const OWNER_ID = 'cccc0021-0000-0000-0000-000000000001';
const ADMIN2_ID = 'cccc0021-0000-0000-0000-000000000002';
const ADMIN3_ID = 'cccc0021-0000-0000-0000-000000000003';
const TEST_TAX_ID = '30-71210001-6';

const PROD_A1 = 'dddd0021-0000-0000-0000-000000000001';
const PROD_A2 = 'dddd0021-0000-0000-0000-000000000002';
const PROD_B1 = 'dddd0021-0000-0000-0000-000000000003';
const PROD_B2 = 'dddd0021-0000-0000-0000-000000000004';

const KEY_A1 = 'eeee0021-0000-0000-0000-000000000001';
const KEY_A2 = 'eeee0021-0000-0000-0000-000000000002';
const KEY_B = 'eeee0021-0000-0000-0000-000000000003';

class PsqlSession {
  constructor(name) {
    this.name = name;
    this.pid = null;
    this.closed = false;
    this.tainted = false;
    this.cmdSeq = 0;
    this.buf = '';
    this.waiter = null;

    this.proc = spawn(
      'docker',
      [
        'exec', '-i', DB_CONTAINER,
        'sh', '-c',
        'exec psql -X -q -t -A -v VERBOSITY=verbose -U postgres -d postgres 2>&1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => {
      this.buf += chunk;
      this.#checkDone();
    });

    this.proc.on('error', (err) => {
      this.tainted = true;
      this.#failPending(`Error de proceso en ${this.name}: ${err.message}`);
    });
    this.proc.on('exit', (code, sig) => {
      this.closed = true;
      this.tainted = true;
      this.#failPending(`Proceso psql (${this.name}) terminó inesperadamente (code=${code}, sig=${sig}).`);
    });
  }

  #failPending(reason) {
    if (!this.waiter) return;
    const { reject, timer } = this.waiter;
    clearTimeout(timer);
    this.waiter = null;
    reject(new Error(reason));
  }

  #checkDone() {
    if (!this.waiter || this.closed || this.tainted) return;
    const { cmdId } = this.waiter;
    const cmdRegex = new RegExp(`__STOCKLY_CMD_DONE__\\|${cmdId}\\|([0-9A-Z]{5})\\r?\\n`);
    const match = cmdRegex.exec(this.buf);
    if (!match) return;

    const rawSlice = this.buf.slice(0, match.index);
    this.buf = this.buf.slice(match.index + match[0].length);
    const markerSqlState = match[1];

    const { resolve, timer } = this.waiter;
    clearTimeout(timer);
    this.waiter = null;

    const errMatch = rawSlice.match(/ERROR:\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
    const sqlState = errMatch ? errMatch[1] : markerSqlState;
    const errorMessage = errMatch ? errMatch[2].trim() : null;
    const cleanStdout = rawSlice
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('ERROR:') && !line.startsWith('DETAIL:') && !line.startsWith('CONTEXT:') && !line.startsWith('LOCATION:') && !line.startsWith('WARNING:'))
      .join('\n')
      .trim();

    resolve({
      ok: sqlState === '00000' && !errMatch,
      stdout: cleanStdout,
      rawOutput: rawSlice.trim(),
      sqlState,
      errorMessage,
    });
  }

  exec(sql, timeoutMs = NORMAL_TIMEOUT_MS) {
    if (this.closed || this.tainted) {
      return Promise.reject(
        new Error(`La sesión ${this.name} no es utilizable (cerrada o invalidada tras timeout/error).`)
      );
    }
    if (this.waiter) {
      return Promise.reject(new Error(`La sesión ${this.name} ya tiene un comando en curso.`));
    }
    const cmdId = ++this.cmdSeq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.tainted = true;
        this.close(
          `Timeout (${timeoutMs} ms) en ${this.name} (cmd #${cmdId}). Sesión invalidada y cerrada para revertir transacción.`
        );
      }, timeoutMs);

      this.waiter = { cmdId, resolve, reject, timer };
      this.proc.stdin.write(`${sql}\n\\echo ${SENTINEL_PREFIX}${cmdId}|:SQLSTATE\n`);
    });
  }

  async init() {
    const res = await this.exec('SELECT pg_catalog.pg_backend_pid();');
    assert.equal(res.ok, true, `Fallo al iniciar ${this.name}: ${res.rawOutput}`);
    this.pid = Number(res.stdout.split(/\r?\n/).pop());
    return this.pid;
  }

  async safeRollback() {
    if (this.closed || this.tainted || this.waiter) return;
    try {
      await this.exec('ROLLBACK;', 2000);
    } catch {
      // Si el ROLLBACK excede el tiempo, exec() invalida y cierra la sesión automáticamente
    }
  }

  close(reason = `Sesión ${this.name} cerrada explícitamente.`) {
    this.closed = true;
    this.tainted = true;
    this.#failPending(reason);
    try {
      this.proc.stdin.end();
      this.proc.kill('SIGTERM');
    } catch {
      // Proceso ya terminado
    }
  }
}

async function waitForBlocking(connM, waiterPid, expectedBlockerPid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastDiagnostic = null;

  while (Date.now() < deadline) {
    const res = await connM.exec(`
      SELECT
        (${expectedBlockerPid} = ANY(pg_catalog.pg_blocking_pids(${waiterPid})))::TEXT || '|' ||
        COALESCE((
          SELECT c.relname
          FROM pg_catalog.pg_locks l
          JOIN pg_catalog.pg_class c ON c.oid = l.relation
          WHERE l.pid = ${waiterPid} AND NOT l.granted
          LIMIT 1
        ), (
          SELECT l.locktype
          FROM pg_catalog.pg_locks l
          WHERE l.pid = ${waiterPid} AND NOT l.granted
          LIMIT 1
        ), 'none') || '|' ||
        pg_catalog.array_to_string(pg_catalog.pg_blocking_pids(${waiterPid}), ',');
    `);

    if (!res.ok) {
      throw new Error(`Fallo en consulta de monitoreo de bloqueos: ${res.rawOutput}`);
    }

    const trimmed = (res.stdout || '').trim();
    const parts = trimmed.split('|');

    if (parts.length < 3) {
      lastDiagnostic = {
        blocked: false,
        waitingRelation: null,
        blockingPids: '',
        diagnosticError: `Formato inesperado devuelto por monitor: "${trimmed}"`
      };
      await new Promise((r) => setTimeout(r, 25));
      continue;
    }

    const isBlockedToken = parts[0].trim().toLowerCase();
    const relName = parts[1].trim() === 'none' ? null : parts[1].trim();
    const blockingList = parts[2].trim();
    const isBlocked = isBlockedToken === 'true' || isBlockedToken === 't';

    lastDiagnostic = {
      blocked: isBlocked,
      waitingRelation: relName,
      blockingPids: blockingList,
      rawResponse: trimmed
    };

    if (isBlocked) {
      return lastDiagnostic;
    }

    await new Promise((r) => setTimeout(r, 25));
  }

  return (
    lastDiagnostic || {
      blocked: false,
      waitingRelation: null,
      blockingPids: '',
      diagnosticError: 'Timeout sin respuesta del monitor'
    }
  );
}

function checkExpectation(failures, label, actual, expected, message) {
  if (actual !== expected) {
    failures.push(`[${label}] ${message} (esperado=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)})`);
  }
}

async function runSuite() {
  const connA = new PsqlSession('ConnA');
  const connB = new PsqlSession('ConnB');
  const connM = new PsqlSession('ConnM');
  const failures = [];
  const inconclusive = [];
  let setupAttempted = false;
  let candidateCompId = null;
  let confirmedCompId = null;

  try {
    await Promise.all([connA.init(), connB.init(), connM.init()]);
    console.log(`[INIT] PIDs -> ConnA=${connA.pid}, ConnB=${connB.pid}, ConnM=${connM.pid}`);

    // 0. Pre-flight check de solo lectura: abortar sin tocar ni limpiar si existe cualquier colisión previa
    const preflightRes = await connM.exec(`
      SELECT
        (SELECT count(*) FROM auth.users WHERE id IN ('${OWNER_ID}', '${ADMIN2_ID}', '${ADMIN3_ID}') OR pg_catalog.lower(email) IN ('owner_p21@stockly.local', 'admin2_p21@stockly.local', 'admin3_p21@stockly.local')) +
        (SELECT count(*) FROM public.profiles WHERE id IN ('${OWNER_ID}', '${ADMIN2_ID}', '${ADMIN3_ID}') OR pg_catalog.lower(email) IN ('owner_p21@stockly.local', 'admin2_p21@stockly.local', 'admin3_p21@stockly.local')) +
        (SELECT count(*) FROM public.companies WHERE tax_id = '${TEST_TAX_ID}' OR owner_id IN ('${OWNER_ID}', '${ADMIN2_ID}', '${ADMIN3_ID}') OR created_by IN ('${OWNER_ID}', '${ADMIN2_ID}', '${ADMIN3_ID}')) +
        (SELECT count(*) FROM public.company_members WHERE user_id IN ('${OWNER_ID}', '${ADMIN2_ID}', '${ADMIN3_ID}')) +
        (SELECT count(*) FROM public.company_invitations WHERE pg_catalog.lower(email) IN ('owner_p21@stockly.local', 'admin2_p21@stockly.local', 'admin3_p21@stockly.local')) +
        (SELECT count(*) FROM public.products WHERE id IN ('${PROD_A1}', '${PROD_A2}', '${PROD_B1}', '${PROD_B2}') OR sku IN ('P21-A1-ADJ', 'P21-A2-INIT', 'P21-B-01', 'P21-B-02')) +
        (SELECT count(*) FROM public.product_costs WHERE product_id IN ('${PROD_A1}', '${PROD_A2}', '${PROD_B1}', '${PROD_B2}')) +
        (SELECT count(*) FROM public.stock_movements WHERE product_id IN ('${PROD_A1}', '${PROD_A2}', '${PROD_B1}', '${PROD_B2}') OR created_by IN ('${OWNER_ID}', '${ADMIN2_ID}', '${ADMIN3_ID}')) +
        (SELECT count(*) FROM public.movement_costs mc JOIN public.stock_movements sm ON sm.id = mc.movement_id WHERE sm.product_id IN ('${PROD_A1}', '${PROD_A2}', '${PROD_B1}', '${PROD_B2}')) +
        (SELECT count(*) FROM public.operation_idempotency WHERE idempotency_key IN ('${KEY_A1}', '${KEY_A2}', '${KEY_B}') OR created_by IN ('${OWNER_ID}', '${ADMIN2_ID}', '${ADMIN3_ID}'));
    `);
    assert.equal(preflightRes.ok, true, `Fallo en verificación pre-flight: ${preflightRes.rawOutput}`);
    const collisionCount = Number(preflightRes.stdout.split(/\r?\n/).pop().trim());
    if (collisionCount !== 0) {
      throw new Error(
        `Pre-flight abortado: se detectaron ${collisionCount} registros preexistentes que colisionan con los identificadores reservados del arnés. No se modificó la base ni se ejecutará limpieza.`
      );
    }

    // 1. Preparación de setup en transacción abierta con validación SQL interna
    setupAttempted = true;
    const setupPrepRes = await connM.exec(`
      BEGIN;
      INSERT INTO auth.users (id, email) VALUES
        ('${OWNER_ID}', 'owner_p21@stockly.local'),
        ('${ADMIN2_ID}', 'admin2_p21@stockly.local'),
        ('${ADMIN3_ID}', 'admin3_p21@stockly.local');

      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${OWNER_ID}';
      SET LOCAL "request.jwt.claim.email" = 'owner_p21@stockly.local';
      SELECT pg_catalog.set_config(
        'stockly.test_comp_id',
        public.create_company('Empresa P21 Concurrencia', '${TEST_TAX_ID}')::TEXT,
        true
      );
      SELECT pg_catalog.set_config(
        'stockly.invite_token_admin2',
        public.invite_user_to_company(pg_catalog.current_setting('stockly.test_comp_id')::UUID, 'admin2_p21@stockly.local', 'master_admin'),
        true
      );
      SELECT pg_catalog.set_config(
        'stockly.invite_token_admin3',
        public.invite_user_to_company(pg_catalog.current_setting('stockly.test_comp_id')::UUID, 'admin3_p21@stockly.local', 'master_admin'),
        true
      );

      SET LOCAL "request.jwt.claim.sub" = '${ADMIN2_ID}';
      SET LOCAL "request.jwt.claim.email" = 'admin2_p21@stockly.local';
      SELECT public.accept_company_invitation(pg_catalog.current_setting('stockly.invite_token_admin2'));

      SET LOCAL "request.jwt.claim.sub" = '${ADMIN3_ID}';
      SET LOCAL "request.jwt.claim.email" = 'admin3_p21@stockly.local';
      SELECT public.accept_company_invitation(pg_catalog.current_setting('stockly.invite_token_admin3'));

      RESET ROLE;
      INSERT INTO public.products (id, company_id, sku, name, unit, selling_price, min_stock, current_stock) VALUES
        ('${PROD_A1}', pg_catalog.current_setting('stockly.test_comp_id')::UUID, 'P21-A1-ADJ',  'Producto Escenario A1', 'unidad', 100.00, 0.00, 0.00),
        ('${PROD_A2}', pg_catalog.current_setting('stockly.test_comp_id')::UUID, 'P21-A2-INIT', 'Producto Escenario A2', 'unidad', 100.00, 0.00, 0.00),
        ('${PROD_B1}', pg_catalog.current_setting('stockly.test_comp_id')::UUID, 'P21-B-01',    'Producto Escenario B1', 'unidad', 100.00, 0.00, 0.00),
        ('${PROD_B2}', pg_catalog.current_setting('stockly.test_comp_id')::UUID, 'P21-B-02',    'Producto Escenario B2', 'unidad', 200.00, 0.00, 0.00);

      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${OWNER_ID}';
      SET LOCAL "request.jwt.claim.email" = 'owner_p21@stockly.local';

      -- Validación obligatoria de identidad y consistencia ANTES del COMMIT (aborto con ROLLBACK si falla)
      DO $$
      DECLARE
        v_cid_txt TEXT := pg_catalog.current_setting('stockly.test_comp_id', true);
        v_cid UUID;
        v_owner UUID;
        v_tax TEXT;
        v_caller UUID := auth.uid();
        v_m_count INT;
        v_p_count INT;
      BEGIN
        IF v_caller IS NULL OR v_caller != '${OWNER_ID}'::UUID THEN
          RAISE EXCEPTION 'Validación pre-commit falló: auth.uid() inválido (%)', v_caller;
        END IF;

        IF v_cid_txt IS NULL OR v_cid_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RAISE EXCEPTION 'Validación pre-commit falló: identificador de empresa inválido (%)', v_cid_txt;
        END IF;
        v_cid := v_cid_txt::UUID;

        SELECT owner_id, tax_id INTO v_owner, v_tax
        FROM public.companies
        WHERE id = v_cid;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Validación pre-commit falló: empresa % no encontrada.', v_cid;
        END IF;

        IF v_owner != '${OWNER_ID}'::UUID OR v_tax != '${TEST_TAX_ID}' THEN
          RAISE EXCEPTION 'Validación pre-commit falló: atributos de empresa no coinciden (owner=%, tax=%)', v_owner, v_tax;
        END IF;

        SELECT count(*) INTO v_m_count FROM public.company_members WHERE company_id = v_cid AND is_active = true;
        IF v_m_count != 3 THEN
          RAISE EXCEPTION 'Validación pre-commit falló: miembros activos esperados 3, encontrados %', v_m_count;
        END IF;

        SELECT count(*) INTO v_p_count FROM public.products WHERE company_id = v_cid;
        IF v_p_count != 4 THEN
          RAISE EXCEPTION 'Validación pre-commit falló: productos esperados 4, encontrados %', v_p_count;
        END IF;
      END;
      $$;

      SELECT 'SETUP_PREPARED|' || auth.uid()::TEXT || '|' || pg_catalog.current_setting('stockly.test_comp_id');
    `);

    if (!setupPrepRes.ok) {
      await connM.exec('ROLLBACK;', 3000).catch(() => {});
      throw new Error(`Fallo en preparación de setup: ${setupPrepRes.rawOutput}`);
    }

    const prepLine = setupPrepRes.stdout.split(/\r?\n/).find((l) => l.startsWith('SETUP_PREPARED|')) || '';
    const [, uidCheck, prepCompId] = prepLine.trim().split('|');
    if (
      uidCheck !== OWNER_ID ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(prepCompId || '')
    ) {
      await connM.exec('ROLLBACK;', 3000).catch(() => {});
      throw new Error(
        `Validación de identificadores de setup falló antes de commit (uid=${uidCheck}, compId=${prepCompId}).`
      );
    }

    // Conservar candidateCompId ANTES de confirmar la transacción para asegurar limpieza si falla el COMMIT o post-verificación
    candidateCompId = prepCompId;

    const commitRes = await connM.exec('COMMIT;');
    if (!commitRes.ok) {
      throw new Error(`Fallo al ejecutar COMMIT de setup: ${commitRes.rawOutput}`);
    }

    // Verificación post-commit de confirmación real en la base de datos antes de iniciar los escenarios
    const verifyCompRes = await connM.exec(`
      SELECT count(*)
      FROM public.companies
      WHERE id = '${candidateCompId}'::UUID
        AND owner_id = '${OWNER_ID}'::UUID
        AND tax_id = '${TEST_TAX_ID}';
    `);
    assert.equal(verifyCompRes.ok, true, `Fallo al verificar empresa confirmada: ${verifyCompRes.rawOutput}`);
    const compCount = Number(verifyCompRes.stdout.split(/\r?\n/).pop().trim());
    if (compCount !== 1) {
      throw new Error(`La empresa ${candidateCompId} no pudo ser corroborada tras el COMMIT.`);
    }
    confirmedCompId = candidateCompId;

    // ========================================================================
    // ESCENARIO A1 (MEDIO-01): deactivate_member vs register_stock_adjustment
    // ========================================================================
    const resStartA1 = await connA.exec(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${OWNER_ID}';
      SELECT public.deactivate_member(
        '${confirmedCompId}'::UUID,
        '${ADMIN2_ID}'::UUID,
        'Baja preventiva por auditoría de concurrencia A1'
      );
    `);
    assert.equal(resStartA1.ok, true, `Fallo al iniciar baja en A1: ${resStartA1.rawOutput}`);

    const pendingB1 = connB.exec(
      `
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${ADMIN2_ID}';
      SELECT public.register_stock_adjustment(
        '${confirmedCompId}'::UUID,
        '${KEY_A1}'::UUID,
        '${PROD_A1}'::UUID,
        'increase', 'physical_count', 5.00, 'Ajuste durante baja de miembro'
      );
      `,
      BLOCKING_TIMEOUT_MS
    );

    const blockInfoA1 = await waitForBlocking(connM, connB.pid, connA.pid);
    console.log('[MEDIO-01 / A1] Bloqueo detectado:', blockInfoA1);
    checkExpectation(failures, 'A1-BLOCK', blockInfoA1.blocked, true, 'ConnB debe bloquearse esperando a ConnA.');

    await connA.exec('COMMIT;');
    const resB1 = await pendingB1;
    await connB.exec('COMMIT;');

    const checkA1 = await connM.exec(`
      SELECT
        (SELECT current_stock FROM public.products WHERE id = '${PROD_A1}') || '|' ||
        (SELECT count(*) FROM public.stock_movements WHERE product_id = '${PROD_A1}') || '|' ||
        (SELECT count(*) FROM public.operation_idempotency WHERE idempotency_key = '${KEY_A1}');
    `);
    console.log('[MEDIO-01 / A1] Resultado ConnB tras COMMIT de baja:', {
      ok: resB1.ok,
      sqlState: resB1.sqlState,
      errorMessage: resB1.errorMessage,
      postState: checkA1.stdout.trim(),
    });

    checkExpectation(failures, 'A1-FAIL', resB1.ok, false, 'register_stock_adjustment debe fallar tras confirmarse deactivate_member.');
    checkExpectation(failures, 'A1-SQLSTATE', resB1.sqlState, 'P0001', 'SQLSTATE esperado P0001.');
    checkExpectation(failures, 'A1-MSG', resB1.errorMessage, 'El usuario no es un miembro activo de esta empresa.', 'Mensaje de miembro inactivo.');
    checkExpectation(failures, 'A1-STATE', checkA1.stdout.trim(), '0.00|0|0', 'No deben persistir movimientos ni filas de idempotencia.');

    // ========================================================================
    // ESCENARIO A2 (MEDIO-01): deactivate_member vs import_initial_stock
    // ========================================================================
    const resStartA2 = await connA.exec(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${OWNER_ID}';
      SELECT public.deactivate_member(
        '${confirmedCompId}'::UUID,
        '${ADMIN3_ID}'::UUID,
        'Baja administrativa por auditoría de concurrencia A2'
      );
    `);
    assert.equal(resStartA2.ok, true, `Fallo al iniciar baja en A2: ${resStartA2.rawOutput}`);

    const pendingB2 = connB.exec(
      `
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${ADMIN3_ID}';
      SELECT public.import_initial_stock(
        '${confirmedCompId}'::UUID,
        '${KEY_A2}'::UUID,
        '[{"product_id":"${PROD_A2}","quantity":10.00,"unit_cost":50.00}]'::JSONB
      );
      `,
      BLOCKING_TIMEOUT_MS
    );

    const blockInfoA2 = await waitForBlocking(connM, connB.pid, connA.pid);
    console.log('[MEDIO-01 / A2] Bloqueo detectado:', blockInfoA2);
    checkExpectation(failures, 'A2-BLOCK', blockInfoA2.blocked, true, 'ConnB debe bloquearse esperando a ConnA en import_initial_stock.');

    await connA.exec('COMMIT;');
    const resB2 = await pendingB2;
    await connB.exec('COMMIT;');

    const checkA2 = await connM.exec(`
      SELECT
        (SELECT current_stock FROM public.products WHERE id = '${PROD_A2}') || '|' ||
        (SELECT count(*) FROM public.stock_movements WHERE product_id = '${PROD_A2}') || '|' ||
        (SELECT count(*) FROM public.operation_idempotency WHERE idempotency_key = '${KEY_A2}');
    `);
    console.log('[MEDIO-01 / A2] Resultado ConnB tras COMMIT de baja:', {
      ok: resB2.ok,
      sqlState: resB2.sqlState,
      errorMessage: resB2.errorMessage,
      postState: checkA2.stdout.trim(),
    });

    checkExpectation(failures, 'A2-FAIL', resB2.ok, false, 'import_initial_stock debe fallar tras confirmarse deactivate_member.');
    checkExpectation(failures, 'A2-SQLSTATE', resB2.sqlState, 'P0001', 'SQLSTATE esperado P0001.');
    checkExpectation(failures, 'A2-MSG', resB2.errorMessage, 'El usuario no es un miembro activo de esta empresa.', 'Mensaje de miembro inactivo.');
    checkExpectation(failures, 'A2-STATE', checkA2.stdout.trim(), '0.00|0|0', 'No deben persistir movimientos ni filas de idempotencia.');

    // ========================================================================
    // ESCENARIO B (MEDIO-02): Verificación de orden canónico de adquisición
    //                         mediante bloqueo de control en ConnM.
    //                         ConnM bloquea PROD_B1 (menor UUID).
    //                         ConnA (import_initial_stock) intenta bloquear B1, B2 -> espera en ConnM.
    //                         ConnB (import_products, JSON inverso B2, B1) ejecuta
    //                         Step 2.1 pre-lock ORDER BY id ASC -> intenta B1 primero -> espera en ConnM.
    //                         Al confirmar ambas esperas, ConnM hace COMMIT.
    //                         Se verifica ausencia de deadlock (40P01) e integridad de datos.
    // ========================================================================

    let pendingA = null;
    let pendingB = null;
    let ctrlLockActive = false;

    try {
      // 1. Validar que PROD_B1 es estrictamente menor que PROD_B2 en orden lexicográfico / UUID
      assert.ok(
        PROD_B1 < PROD_B2,
        `Invariante de prueba violada: PROD_B1 (${PROD_B1}) debe ser menor que PROD_B2 (${PROD_B2}).`
      );

      // Adquirir bloqueo de control FOR UPDATE sobre PROD_B1 en connM
      console.log('[MEDIO-02 / B] Adquiriendo bloqueo de control FOR UPDATE sobre PROD_B1 en ConnM...');
      const ctrlLockRes = await connM.exec(`
        BEGIN;
        SELECT id::TEXT || '|' || company_id::TEXT
        FROM public.products
        WHERE id = '${PROD_B1}'::UUID
          AND company_id = '${confirmedCompId}'::UUID
        FOR UPDATE;
      `);
      assert.equal(ctrlLockRes.ok, true, `Fallo al adquirir bloqueo de control en ConnM: ${ctrlLockRes.rawOutput}`);

      const lockedRow = ctrlLockRes.stdout.trim();
      const expectedLockedRow = `${PROD_B1}|${confirmedCompId}`;
      if (lockedRow !== expectedLockedRow) {
        await connM.exec('ROLLBACK;').catch(() => {});
        throw new Error(
          `[ABORT-B] ConnM no adquirió el bloqueo sobre PROD_B1: esperado="${expectedLockedRow}", obtenido="${lockedRow}"`
        );
      }
      ctrlLockActive = true;

      // 2. Iniciar import_initial_stock en ConnA (orden canónico B1, B2)
      console.log('[MEDIO-02 / B] Iniciando import_initial_stock en ConnA (orden natural B1, B2)...');
      pendingA = connA.exec(
        `
        BEGIN;
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${OWNER_ID}';
        SELECT public.import_initial_stock(
          '${confirmedCompId}'::UUID,
          '${KEY_B}'::UUID,
          '[{"product_id":"${PROD_B1}","quantity":12.00,"unit_cost":85.00},{"product_id":"${PROD_B2}","quantity":8.00,"unit_cost":125.00}]'::JSONB
        );
        COMMIT;
        `,
        BLOCKING_TIMEOUT_MS
      );

      // 3. Verificar que ConnA está esperando el bloqueo de control de ConnM
      const blockInfoA = await waitForBlocking(connM, connA.pid, connM.pid, 5000);
      console.log('[MEDIO-02 / B] Diagnóstico de espera en ConnA:', blockInfoA);

      checkExpectation(
        failures,
        'B-CTRL-A',
        blockInfoA.blocked,
        true,
        'ConnA debe quedar bloqueada esperando el bloqueo de control de ConnM sobre PROD_B1.'
      );

      if (!blockInfoA.blocked) {
        throw new Error(
          `[ABORT-B] ConnA (PID ${connA.pid}) no quedó bloqueada por ConnM (PID ${connM.pid}) sobre PROD_B1: ${JSON.stringify(blockInfoA)}`
        );
      }

      // 4. Iniciar import_products en ConnB con SKUs en orden inverso (B2, B1)
      console.log('[MEDIO-02 / B] Iniciando import_products en ConnB (orden inverso SKU: B2, B1)...');
      pendingB = connB.exec(
        `
        BEGIN;
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${OWNER_ID}';
        SELECT public.import_products(
          '${confirmedCompId}'::UUID,
          '[{"sku":"P21-B-02","name":"Producto B2 Upd","unit":"unidad","selling_price":250.00,"cost_price":120.00,"min_stock":1.00},{"sku":"P21-B-01","name":"Producto B1 Upd","unit":"unidad","selling_price":150.00,"cost_price":80.00,"min_stock":1.00}]'::JSONB,
          'update'
        );
        COMMIT;
        `,
        BLOCKING_TIMEOUT_MS
      );

      // 5. Verificar que ConnB también está esperando el bloqueo de control antes de liberarlo
      let blockInfoB = null;
      const deadlineB = Date.now() + 5000;
      while (Date.now() < deadlineB) {
        const probeB = await connM.exec(`
          SELECT
            (${connM.pid} = ANY(pg_catalog.pg_blocking_pids(${connB.pid})))::TEXT || '|' ||
            (${connA.pid} = ANY(pg_catalog.pg_blocking_pids(${connB.pid})))::TEXT || '|' ||
            COALESCE((
              SELECT c.relname
              FROM pg_catalog.pg_locks l
              JOIN pg_catalog.pg_class c ON c.oid = l.relation
              WHERE l.pid = ${connB.pid} AND NOT l.granted
              LIMIT 1
            ), (
              SELECT l.locktype
              FROM pg_catalog.pg_locks l
              WHERE l.pid = ${connB.pid} AND NOT l.granted
              LIMIT 1
            ), 'none') || '|' ||
            pg_catalog.array_to_string(pg_catalog.pg_blocking_pids(${connB.pid}), ',');
        `);

        if (probeB.ok) {
          const [mInBlockers, aInBlockers, waitRel, rawBlockers] = probeB.stdout.trim().split('|');
          const isBlockedByM = mInBlockers === 'true' || mInBlockers === 't';
          const isBlockedByA = aInBlockers === 'true' || aInBlockers === 't';
          const isBlocked = isBlockedByM || isBlockedByA;

          blockInfoB = {
            blocked: isBlocked,
            blockedByCtrl: isBlockedByM,
            blockedByConnA: isBlockedByA,
            waitingRelation: waitRel === 'none' ? null : waitRel,
            blockingPids: rawBlockers,
            rawResponse: probeB.stdout.trim()
          };

          if (isBlocked) {
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 25));
      }

      console.log('[MEDIO-02 / B] Diagnóstico de espera en ConnB:', blockInfoB);

      checkExpectation(
        failures,
        'B-CTRL-B',
        Boolean(blockInfoB && blockInfoB.blocked),
        true,
        'ConnB debe quedar bloqueada esperando el bloqueo de control (directamente por ConnM o encolada tras ConnA) antes de liberar el control.'
      );

      if (!blockInfoB || !blockInfoB.blocked) {
        throw new Error(
          `[ABORT-B] ConnB (PID ${connB.pid}) no quedó bloqueada esperando el control sobre PROD_B1: ${JSON.stringify(blockInfoB)}`
        );
      }

      // 6. Liberar el bloqueo de control mediante COMMIT en connM
      console.log('[MEDIO-02 / B] Ambas sesiones bloqueadas en control. Liberando bloqueo con COMMIT en ConnM...');
      const releaseRes = await connM.exec('COMMIT;');
      assert.equal(releaseRes.ok, true, `Fallo al liberar bloqueo de control en ConnM: ${releaseRes.rawOutput}`);
      ctrlLockActive = false;

      // 7. Esperar que ambas RPC completen y registrar resultados
      const settledResults = await Promise.allSettled([pendingA, pendingB]);
      const [settledA, settledB] = settledResults;

      const resA = settledA.status === 'fulfilled'
        ? settledA.value
        : { ok: false, sqlState: 'ERROR', errorMessage: settledA.reason?.message };
      const resB = settledB.status === 'fulfilled'
        ? settledB.value
        : { ok: false, sqlState: 'ERROR', errorMessage: settledB.reason?.message };

      if (settledA.status === 'rejected') {
        failures.push(`[B-EXEC-A] ConnA falló o expiró: ${settledA.reason?.message}`);
      }
      if (settledB.status === 'rejected') {
        failures.push(`[B-EXEC-B] ConnB falló o expiró: ${settledB.reason?.message}`);
      }

      console.log('[MEDIO-02 / B] Resultados tras liberación de control:', {
        connA_ok: resA.ok,
        connA_sqlState: resA.sqlState,
        connA_error: resA.errorMessage,
        connB_ok: resB.ok,
        connB_sqlState: resB.sqlState,
        connB_error: resB.errorMessage
      });

      // Validar ausencia de Deadlock (SQLSTATE 40P01) en ambas sesiones
      checkExpectation(failures, 'B-NO-DEADLOCK-A', resA.sqlState !== '40P01', true, 'ConnA no debe fallar por deadlock (40P01).');
      checkExpectation(failures, 'B-NO-DEADLOCK-B', resB.sqlState !== '40P01', true, 'ConnB no debe fallar por deadlock (40P01).');
      checkExpectation(failures, 'B-OK-A', resA.ok, true, `import_initial_stock debe completar con éxito (sqlState=${resA.sqlState}).`);
      checkExpectation(failures, 'B-OK-B', resB.ok, true, `import_products debe completar con éxito (sqlState=${resB.sqlState}).`);

      const invRes = await connM.exec(`
        SELECT
          (SELECT current_stock || ':' || selling_price FROM public.products WHERE id = '${PROD_B1}') || '|' ||
          (SELECT current_stock || ':' || selling_price FROM public.products WHERE id = '${PROD_B2}') || '|' ||
          (SELECT cost_price FROM public.product_costs WHERE product_id = '${PROD_B1}') || '|' ||
          (SELECT cost_price FROM public.product_costs WHERE product_id = '${PROD_B2}') || '|' ||
          (SELECT count(*) FROM public.stock_movements WHERE product_id IN ('${PROD_B1}', '${PROD_B2}'));
      `);
      const actualInv = invRes.stdout.trim();
      console.log('[MEDIO-02 / B] Estado final de inventario y catálogo:', actualInv);

      const invParts = actualInv.split('|');
      const b1StockSelling = invParts[0] || '';
      const b2StockSelling = invParts[1] || '';
      const b1Cost = invParts[2] || '';
      const b2Cost = invParts[3] || '';
      const movCount = invParts[4] || '';

      // Aserciones obligatorias de invariantes físicos y de catálogo
      checkExpectation(failures, 'B-INV-B1', b1StockSelling, '12.00:150.00', 'Stock y precio de venta de B1 deben ser 12.00 y 150.00.');
      checkExpectation(failures, 'B-INV-B2', b2StockSelling, '8.00:250.00', 'Stock y precio de venta de B2 deben ser 8.00 y 250.00.');
      checkExpectation(failures, 'B-INV-MOV-COUNT', movCount, '2', 'Deben existir exactamente dos movimientos de carga inicial.');

      // Aserción de costos actuales en product_costs: admite exclusivamente los dos órdenes de serialización válidos
      const actualCurrentCosts = `${b1Cost}|${b2Cost}`;
      const VALID_COST_SCHEDULES = [
        '80.00|120.00', // Serialización 1: import_products escribió al final
        '85.00|125.00', // Serialización 2: import_initial_stock escribió al final
      ];
      if (!VALID_COST_SCHEDULES.includes(actualCurrentCosts)) {
        failures.push(
          `[B-INV-COSTS] Costos actuales en product_costs no corresponden a ninguna serialización válida (esperado uno de ${JSON.stringify(VALID_COST_SCHEDULES)}, actual="${actualCurrentCosts}").`
        );
      }

      // Aserción global B-INV (debe ser estrictamente uno de los dos estados combinados válidos)
      const VALID_INV_OUTCOMES = [
        '12.00:150.00|8.00:250.00|80.00|120.00|2',
        '12.00:150.00|8.00:250.00|85.00|125.00|2',
      ];
      checkExpectation(
        failures,
        'B-INV',
        VALID_INV_OUTCOMES.includes(actualInv),
        true,
        `Saldos, catálogo, costos y movimientos deben corresponder a una serialización válida (actual="${actualInv}", válidos=[${VALID_INV_OUTCOMES.join(', ')}]).`
      );

      // Comprobación independiente de costos históricos en public.movement_costs
      const histCostsRes = await connM.exec(`
        SELECT
          (
            SELECT mc.unit_cost
            FROM public.movement_costs mc
            JOIN public.stock_movements sm ON sm.id = mc.movement_id
            WHERE sm.company_id = '${confirmedCompId}'::UUID AND sm.product_id = '${PROD_B1}'
          ) || '|' ||
          (
            SELECT mc.unit_cost
            FROM public.movement_costs mc
            JOIN public.stock_movements sm ON sm.id = mc.movement_id
            WHERE sm.company_id = '${confirmedCompId}'::UUID AND sm.product_id = '${PROD_B2}'
          ) || '|' ||
          (
            SELECT count(*)
            FROM public.movement_costs mc
            JOIN public.stock_movements sm ON sm.id = mc.movement_id
            WHERE sm.company_id = '${confirmedCompId}'::UUID AND sm.product_id IN ('${PROD_B1}', '${PROD_B2}')
          );
      `);
      const actualHistCosts = histCostsRes.stdout.trim();
      console.log('[MEDIO-02 / B] Costos unitarios históricos en movement_costs:', actualHistCosts);
      checkExpectation(
        failures,
        'B-HIST-COST',
        actualHistCosts,
        '85.00|125.00|2',
        'Los costos históricos en movement_costs deben ser inmutables (85.00 para B1 y 125.00 para B2, con 2 registros).'
      );

      // Evaluación explícita de cobertura empírica
      const ctrlContentionConfirmed = blockInfoA && blockInfoA.blocked && blockInfoB && blockInfoB.blocked;
      if (!ctrlContentionConfirmed) {
        inconclusive.push(
          '[MEDIO-02 / B-EVIDENCIA-PARCIAL] No se pudo verificar la contención controlada en kernel en ambas sesiones.'
        );
      } else {
        console.log('[MEDIO-02 / B] Contención de control en kernel verificada exitosamente para ConnA y ConnB.');
      }
    } finally {
      // Drenar y sincronizar cualquier operación pendiente de ConnA / ConnB y asegurar que ConnM no tenga transacción abierta
      if (ctrlLockActive && !connM.closed && !connM.tainted) {
        try {
          await connM.exec('ROLLBACK;', 3000);
        } catch {
          // Si el ROLLBACK excede el tiempo, safeRollback o close lo manejará
        } finally {
          ctrlLockActive = false;
        }
      }

      const pendingDrains = [];
      if (pendingA) pendingDrains.push(pendingA);
      if (pendingB) pendingDrains.push(pendingB);
      if (pendingDrains.length > 0) {
        await Promise.allSettled(pendingDrains);
      }
    }

    if (inconclusive.length > 0) {
      console.warn('\n[ESCENARIOS INCONCLUSOS]:');
      for (const inc of inconclusive) console.warn(' ?', inc);
    }

    if (failures.length > 0) {
      console.error('\n[RESUMEN DE FALLOS DETECTADOS]:');
      for (const f of failures) console.error(' -', f);
      throw new Error(`Fallaron ${failures.length} comprobaciones de concurrencia.`);
    }

    if (inconclusive.length > 0) {
      process.exitCode = 2;
      console.warn(`\n[INCONCLUSO] Finalizado con ${inconclusive.length} comprobación(es) inconclusa(s) (exitCode=2).`);
    } else {
      console.log('\n[OK] Todas las pruebas de concurrencia pasaron.');
    }
  } finally {
    // 1. Liberar cualquier transacción abierta en ConnA, ConnB y ConnM y cerrar sus procesos
    await Promise.allSettled([connA.safeRollback(), connB.safeRollback(), connM.safeRollback()]);
    const pidA = connA.pid || -1;
    const pidB = connB.pid || -1;
    connA.close('Cierre de fin de suite ConnA');
    connB.close('Cierre de fin de suite ConnB');

    try {
      if (!connM.closed && !connM.tainted) {
        await connM.exec(
          `SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE pid IN (${pidA}, ${pidB});`,
          3000
        );
      }

      // 2. Determinar el identificador a limpiar con recuperación segura si setupAttempted fue true
      let targetCompId = candidateCompId || confirmedCompId;

      if (!targetCompId && setupAttempted && !connM.closed && !connM.tainted) {
        try {
          const recoverRes = await connM.exec(
            `
            SELECT id::TEXT
            FROM public.companies
            WHERE owner_id = '${OWNER_ID}'::UUID
              AND tax_id = '${TEST_TAX_ID}'
              AND name = 'Empresa P21 Concurrencia';
            `,
            3000
          );
          if (recoverRes.ok) {
            const lines = recoverRes.stdout
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(l));
            if (lines.length === 1) {
              targetCompId = lines[0];
              console.log(`[CLEANUP RECOVERY] Se recuperó unívocamente el ID de la empresa confirmada: ${targetCompId}`);
            } else if (lines.length > 1) {
              console.error(
                `[CLEANUP ABORTED] Se detectaron múltiples empresas para owner_id=${OWNER_ID} y tax_id=${TEST_TAX_ID}. No se puede identificar unívocamente la empresa.`
              );
            }
          }
        } catch (recErr) {
          console.error(`[CLEANUP RECOVERY ERROR] Error al intentar recuperar ID de empresa: ${recErr.message}`);
        }
      }

      // 3. Ejecutar limpieza destructiva SOLO si una consulta independiente corrobora exactamente id, owner_id y tax_id
      if (targetCompId) {
        const verifyBeforeDelete = await connM.exec(
          `
          SELECT count(*)
          FROM public.companies
          WHERE id = '${targetCompId}'::UUID
            AND owner_id = '${OWNER_ID}'::UUID
            AND tax_id = '${TEST_TAX_ID}'
            AND name = 'Empresa P21 Concurrencia';
          `,
          3000
        ).catch(() => ({ ok: false, stdout: '0' }));

        const isIdentityDemonstrated =
          verifyBeforeDelete.ok &&
          Number((verifyBeforeDelete.stdout || '').split(/\r?\n/).pop().trim()) === 1;

        if (!isIdentityDemonstrated) {
          console.error(
            `[CLEANUP ABORTED] No se pudo corroborar en base la identidad exacta de la empresa '${targetCompId}' (owner_id=${OWNER_ID}, tax_id=${TEST_TAX_ID}). Limpieza destructiva abortada por seguridad; la limpieza manual queda pendiente.`
          );
          process.exitCode = 1;
        } else {
          const cleanupRes = await connM.exec(
            `
            BEGIN;
            ALTER TABLE public.movement_costs DISABLE TRIGGER tr_protect_movement_costs_immutable;
            ALTER TABLE public.stock_movements DISABLE TRIGGER tr_protect_stock_movements_immutable;
            ALTER TABLE public.audit_log DISABLE TRIGGER tr_audit_log_immutable;
            ALTER TABLE public.company_members DISABLE TRIGGER tr_protect_last_company_admin;
            ALTER TABLE public.products DISABLE TRIGGER tr_audit_products;
            ALTER TABLE public.product_costs DISABLE TRIGGER tr_audit_product_costs;

            DELETE FROM public.movement_costs
            WHERE company_id = '${targetCompId}'::UUID;

            DELETE FROM public.product_costs
            WHERE company_id = '${targetCompId}'::UUID;

            DELETE FROM public.stock_movements
            WHERE company_id = '${targetCompId}'::UUID;

            DELETE FROM public.products
            WHERE company_id = '${targetCompId}'::UUID
              AND id IN ('${PROD_A1}', '${PROD_A2}', '${PROD_B1}', '${PROD_B2}');

            DELETE FROM public.operation_idempotency
            WHERE company_id = '${targetCompId}'::UUID;

            DELETE FROM public.company_counters
            WHERE company_id = '${targetCompId}'::UUID;

            DELETE FROM public.audit_log
            WHERE company_id = '${targetCompId}'::UUID;

            DELETE FROM public.company_invitations
            WHERE company_id = '${targetCompId}'::UUID;

            DELETE FROM public.company_members
            WHERE company_id = '${targetCompId}'::UUID;

            DELETE FROM public.companies
            WHERE id = '${targetCompId}'::UUID
              AND owner_id = '${OWNER_ID}'::UUID
              AND tax_id = '${TEST_TAX_ID}';

            DELETE FROM public.profiles
            WHERE id IN ('${OWNER_ID}', '${ADMIN2_ID}', '${ADMIN3_ID}');

            DELETE FROM auth.users
            WHERE id IN ('${OWNER_ID}', '${ADMIN2_ID}', '${ADMIN3_ID}');

            ALTER TABLE public.movement_costs ENABLE TRIGGER tr_protect_movement_costs_immutable;
            ALTER TABLE public.stock_movements ENABLE TRIGGER tr_protect_stock_movements_immutable;
            ALTER TABLE public.audit_log ENABLE TRIGGER tr_audit_log_immutable;
            ALTER TABLE public.company_members ENABLE TRIGGER tr_protect_last_company_admin;
            ALTER TABLE public.products ENABLE TRIGGER tr_audit_products;
            ALTER TABLE public.product_costs ENABLE TRIGGER tr_audit_product_costs;
            COMMIT;
            `,
            CLEANUP_TIMEOUT_MS
          );

          if (!cleanupRes.ok) {
            await connM.exec('ROLLBACK;', 3000).catch(() => {});
            console.error('[CLEANUP ERROR] La transacción de limpieza falló y se revirtió:', cleanupRes.rawOutput);
            process.exitCode = 1;
          } else {
            // Verificación post-limpieza independiente incluyendo public.movement_costs
            const verifyResiduals = await connM.exec(
              `
              SELECT
                (SELECT count(*) FROM public.movement_costs WHERE company_id = '${targetCompId}'::UUID) +
                (SELECT count(*) FROM public.product_costs WHERE company_id = '${targetCompId}'::UUID) +
                (SELECT count(*) FROM public.stock_movements WHERE company_id = '${targetCompId}'::UUID) +
                (SELECT count(*) FROM public.products WHERE company_id = '${targetCompId}'::UUID);
              `,
              3000
            ).catch(() => ({ ok: false, stdout: '-1' }));
            const residualCount = Number((verifyResiduals.stdout || '').split(/\r?\n/).pop().trim());
            if (residualCount === 0) {
              console.log('[CLEANUP] Datos creados por el arnés eliminados y triggers restaurados atómicamente (0 residuales confirmados incluyendo movement_costs).');
            } else {
              console.error(`[CLEANUP WARNING] Se detectaron ${residualCount} registros residuales tras la limpieza.`);
              process.exitCode = 1;
            }
          }
        }
      } else if (setupAttempted) {
        console.log('[CLEANUP] Setup fue intentado pero no se confirmó ninguna empresa en base de datos. Nada que limpiar.');
      }
    } catch (cleanupErr) {
      await connM.exec('ROLLBACK;', 3000).catch(() => {});
      console.error('[CLEANUP EXCEPTION] Error inesperado durante la limpieza:', cleanupErr.message);
      process.exitCode = 1;
    } finally {
      connM.close('Cierre de fin de suite ConnM');
    }
  }
}

runSuite().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exitCode = 1;
});
