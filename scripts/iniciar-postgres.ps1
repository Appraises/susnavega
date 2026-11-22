param([string]$PastaPostgres = 'C:\Program Files\PostgreSQL\18\bin')
$ErrorActionPreference = 'Stop'
$pastaProjeto = Split-Path $PSScriptRoot -Parent
$pastaDados = Join-Path $pastaProjeto 'dados\postgres-local'
$arquivoSenha = Join-Path $pastaProjeto 'dados\senha-inicial.txt'
if (!(Test-Path -LiteralPath (Join-Path $PastaPostgres 'initdb.exe'))) {
    throw 'PostgreSQL não encontrado. Informe -PastaPostgres ou use docker compose up -d banco.'
}
New-Item -ItemType Directory -Path (Join-Path $pastaProjeto 'dados') -Force | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $pastaDados 'PG_VERSION'))) {
    Set-Content -LiteralPath $arquivoSenha -Value 'fluxsus_demo' -Encoding ascii
    & "$PastaPostgres\initdb.exe" -D $pastaDados -U fluxsus --auth=scram-sha-256 --pwfile=$arquivoSenha --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível iniciar a base local.' }
    Remove-Item -LiteralPath $arquivoSenha
}
& "$PastaPostgres\pg_ctl.exe" -D $pastaDados status 2>$null
if ($LASTEXITCODE -ne 0) {
    & "$PastaPostgres\pg_ctl.exe" -D $pastaDados -l (Join-Path $pastaProjeto 'dados\postgres.log') -o '-p 55433 -h 127.0.0.1' -w start
    if ($LASTEXITCODE -ne 0) { throw 'Confira dados/postgres.log e se a porta 55433 está livre.' }
}
$env:PGPASSWORD = 'fluxsus_demo'
try {
    foreach ($nomeBanco in @('fluxsus_p3', 'fluxsus_p3_test')) {
        $existente = & "$PastaPostgres\psql.exe" -h 127.0.0.1 -p 55433 -U fluxsus -d postgres -Atc "SELECT datname FROM pg_database WHERE datname = '$nomeBanco'"
        if (!$existente) {
            & "$PastaPostgres\createdb.exe" -h 127.0.0.1 -p 55433 -U fluxsus $nomeBanco
            if ($LASTEXITCODE -ne 0) { throw "Não foi possível criar $nomeBanco." }
        }
    }
} finally { Remove-Item Env:\PGPASSWORD }
Write-Output 'PostgreSQL do projeto disponível em 127.0.0.1:55433. O serviço existente não foi alterado.'
