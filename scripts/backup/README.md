# Respaldos de Stockly

Respaldo completo de la base de producción (productos, ventas, caja, usuarios, permisos, documentos, etc.) cada noche, en una carpeta de tu PC. Se conservan los últimos 14 (configurable).

Requisitos: Docker Desktop instalado (ya lo tenés) y la PC prendida a la hora del respaldo. Si estaba apagada, el respaldo corre apenas se prende.

## Configurar (una sola vez)

1. En Supabase: **Connect** (arriba) → **Session pooler** → copiá la cadena de conexión y reemplazá `[YOUR-PASSWORD]` por la contraseña de la base de datos (Project Settings → Database → Reset database password si no la sabés).
2. Creá el archivo `.env.backup` en la raíz del proyecto (no se sube a git) con:

```
BACKUP_DB_URL=postgresql://postgres.xxxx:TU_CONTRASEÑA@aws-0-xx.pooler.supabase.com:5432/postgres
BACKUP_DIR=C:\Users\TU_USUARIO\OneDrive\StocklyBackups
BACKUP_KEEP=14
```

   Poné `BACKUP_DIR` dentro de OneDrive o Google Drive para tener también una copia fuera de la PC.
3. Probá un respaldo manual:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup\backup.ps1
```

4. Programalo todos los días:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup\register-task.ps1 -Hora 23:00
```

Cada ejecución queda anotada en `backup.log`, dentro de la carpeta de respaldos. Revisalo de vez en cuando: si dice `ERROR`, el respaldo de ese día no se hizo.

## Restaurar

Siempre sobre una base **nueva** (un proyecto de Supabase nuevo o una base local), nunca sobre producción sin saber qué se pisa:

```powershell
docker run --rm -v "C:\ruta\a\los\respaldos:/out" public.ecr.aws/supabase/postgres:17.11.0.016 `
  pg_restore --no-owner --clean --if-exists -d "CADENA_DE_CONEXION_DESTINO" /out/stockly-AAAAMMDD-HHMMSS.dump
```

Un aviso de "schema public already exists" es normal. Probar una restauración de vez en cuando es la única forma de saber que el respaldo sirve.
