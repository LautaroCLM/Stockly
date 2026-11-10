# Respaldo completo de la base de datos de Stockly (esquemas public, private y auth).
# Lee la configuracion de .env.backup (en la raiz del proyecto, no se sube a git):
#   BACKUP_DB_URL = cadena de conexion de Supabase (Session pooler)
#   BACKUP_DIR    = carpeta de destino (opcional, por defecto C:\StocklyBackups)
#   BACKUP_KEEP   = cuantos respaldos conservar (opcional, por defecto 14)
# Usa Docker con la misma imagen de Postgres que Supabase, asi no hay que instalar nada mas.

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$image = 'public.ecr.aws/supabase/postgres:17.11.0.016'

function Read-EnvFile($path) {
  $values = @{}
  foreach ($line in Get-Content $path) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $values[$Matches[1]] = $Matches[2].Trim('"').Trim("'") }
  }
  return $values
}

$envPath = Join-Path $root '.env.backup'
if (-not (Test-Path $envPath)) { throw "Falta el archivo $envPath. Segui los pasos de scripts\backup\README.md." }
$config = Read-EnvFile $envPath
if (-not $config['BACKUP_DB_URL']) { throw 'Falta BACKUP_DB_URL en .env.backup.' }

$dir = if ($config['BACKUP_DIR']) { $config['BACKUP_DIR'] } else { 'C:\StocklyBackups' }
$keep = if ($config['BACKUP_KEEP']) { [int]$config['BACKUP_KEEP'] } else { 14 }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$log = Join-Path $dir 'backup.log'
function Write-Log($message) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $message) }

try {
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker no esta funcionando. Abri Docker Desktop y reintenta.' }

  $name = 'stockly-{0:yyyyMMdd-HHmmss}.dump' -f (Get-Date)
  $env:PGURL = $config['BACKUP_DB_URL']
  $dump = 'pg_dump "$PGURL" --format=custom --no-owner --no-privileges --schema=public --schema=private --schema=auth -f /out/' + $name
  docker run --rm -e PGURL -v "${dir}:/out" $image sh -c $dump
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump fallo (revisa la cadena de conexion y la contrasena).' }
  Remove-Item Env:PGURL

  $file = Join-Path $dir $name
  if (-not (Test-Path $file) -or (Get-Item $file).Length -lt 10KB) { throw 'El archivo de respaldo no se genero bien.' }
  # Verifica que el archivo se pueda leer (lista su contenido)
  docker run --rm -v "${dir}:/out" $image pg_restore --list "/out/$name" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'El respaldo se genero pero no se puede leer: no lo uses.' }

  Get-ChildItem $dir -Filter 'stockly-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $keep | Remove-Item -Force
  Write-Log ("OK  {0}  ({1:N1} MB)" -f $name, ((Get-Item $file).Length / 1MB))
  Write-Output "Respaldo listo: $file"
} catch {
  Write-Log "ERROR  $($_.Exception.Message)"
  Write-Error $_.Exception.Message
  exit 1
}
