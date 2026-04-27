param(
  [string]$EnvFile = ".env",
  [string]$Schema = "logistica_tareas",
  [string]$Table = "test"
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    throw "No existe el archivo $Path"
  }

  $values = @{}
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
      $values[$matches[1].Trim()] = $matches[2].Trim()
    }
  }

  return $values
}

function Decode-JwtPayload {
  param([string]$Jwt)

  $parts = $Jwt.Split(".")
  if ($parts.Count -lt 2) {
    throw "SUPABASE_ANON_KEY no parece ser un JWT valido."
  }

  $payload = $parts[1].Replace("-", "+").Replace("_", "/")
  switch ($payload.Length % 4) {
    2 { $payload += "==" }
    3 { $payload += "=" }
    1 { throw "Payload JWT invalido." }
  }

  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
}

function Invoke-CurlGet {
  param(
    [string]$Uri,
    [string[]]$Headers = @()
  )

  $tempFile = New-TemporaryFile
  try {
    $args = @("-sS", "-o", $tempFile.FullName, "-w", "%{http_code}", $Uri)
    foreach ($header in $Headers) {
      $args += @("-H", $header)
    }

    $status = & curl.exe @args
    $body = [string](Get-Content -LiteralPath $tempFile.FullName -Raw)

    return [pscustomobject]@{
      StatusCode = [int]$status
      Body = $body
    }
  } finally {
    Remove-Item -LiteralPath $tempFile.FullName -Force -ErrorAction SilentlyContinue
  }
}

$envMap = Read-DotEnv $EnvFile
$url = $envMap["SUPABASE_URL"]
$anonKey = $envMap["SUPABASE_ANON_KEY"]

if (-not $url -or -not $anonKey) {
  throw "Faltan SUPABASE_URL o SUPABASE_ANON_KEY en $EnvFile"
}

$jwt = Decode-JwtPayload $anonKey
$urlProjectRef = ([Uri]$url).Host.Split(".")[0]

Write-Host "Supabase Cloud"
Write-Host "URL: $url"
Write-Host "JWT project ref: $($jwt.ref)"
Write-Host "URL project ref: $urlProjectRef"

if ($jwt.ref -ne $urlProjectRef) {
  throw "La anon key no corresponde a la URL configurada."
}

Write-Host "[ok] La anon key corresponde a este proyecto."

$health = Invoke-CurlGet "$url/auth/v1/health" @("apikey: $anonKey")
if ($health.StatusCode -ne 200) {
  throw "Auth no respondio correctamente. HTTP $($health.StatusCode). $($health.Body)"
}
Write-Host "[ok] Auth responde con HTTP $($health.StatusCode)."

$tableResponse = Invoke-CurlGet "$url/rest/v1/$Table`?select=*&limit=1" @(
  "apikey: $anonKey",
  "Authorization: Bearer $anonKey",
  "Accept-Profile: $Schema"
)

if ($tableResponse.StatusCode -eq 200) {
  Write-Host "[ok] La tabla $Schema.$Table existe y responde con HTTP $($tableResponse.StatusCode)."
} else {
  Write-Host "[aviso] No se pudo leer $Schema.$Table. HTTP $($tableResponse.StatusCode)."
  if ($tableResponse.Body) {
    Write-Host $tableResponse.Body
  }
}
