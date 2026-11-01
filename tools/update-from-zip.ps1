<#
  update-from-zip.ps1 — one command to apply a new Malba Ree zip to your project,
  commit it and push it to GitHub (Vercel then redeploys automatically).

  Usage (in the VS Code terminal, inside the project folder):
      npm run update
      npm run update -- -Message "Added Bluetooth printing"
      npm run update -- -Zip "C:\path\to\malba-ree-pos-multi-restaurant.zip"

  With no -Zip it uses the newest  malba-ree-pos*.zip  in your Downloads folder.

  It REPLACES: src, public, database, supabase and the project config files.
  It NEVER touches: .env, .git, node_modules, package-lock.json.
  (So do not keep hand-made code changes inside src — they would be overwritten.)
#>
param(
  [string]$Zip = "",
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not (Test-Path (Join-Path $projectRoot "package.json"))) { throw "Run this inside the project folder." }
if (-not (Test-Path (Join-Path $projectRoot ".git"))) { throw "This folder is not a git repository." }

# 1. find the zip
if (-not $Zip) {
  $downloads = Join-Path $HOME "Downloads"
  $found = Get-ChildItem -Path $downloads -Filter "malba-ree-pos*.zip" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $found) { throw "No malba-ree-pos*.zip found in $downloads. Download it first, or pass -Zip <path>." }
  $Zip = $found.FullName
}
if (-not (Test-Path $Zip)) { throw "Zip not found: $Zip" }
Write-Host "Using zip: $Zip" -ForegroundColor Cyan

# 2. unpack to a temp folder
$temp = Join-Path ([IO.Path]::GetTempPath()) ("malba-update-" + [guid]::NewGuid().ToString("N"))
Expand-Archive -Path $Zip -DestinationPath $temp -Force
try {
  $pkg = Get-ChildItem -Path $temp -Recurse -Filter package.json -File |
    Where-Object { $_.FullName -notmatch "node_modules" } |
    Sort-Object { $_.FullName.Length } | Select-Object -First 1
  if (-not $pkg) { throw "package.json not found inside the zip." }
  $source = $pkg.DirectoryName

  # 3. copy the folders that I manage (mirror = also removes files I deleted)
  foreach ($dir in @("src", "public", "database", "supabase")) {
    $from = Join-Path $source $dir
    if (Test-Path $from) {
      robocopy $from (Join-Path $projectRoot $dir) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "Copying $dir failed (robocopy code $LASTEXITCODE)." }
    }
  }
  $global:LASTEXITCODE = 0

  # 4. copy single config files
  foreach ($file in @("README.md", "vite.config.ts", "tsconfig.json", "components.json", "eslint.config.js",
                      ".prettierrc", ".prettierignore", ".env.example", ".gitignore", "bunfig.toml")) {
    $from = Join-Path $source $file
    if (Test-Path $from) { Copy-Item $from (Join-Path $projectRoot $file) -Force }
  }

  # 5. package.json: copy only if it changed, then reinstall
  $needInstall = $false
  $newPkg = Join-Path $source "package.json"
  $oldPkg = Join-Path $projectRoot "package.json"
  if ((Get-FileHash $newPkg).Hash -ne (Get-FileHash $oldPkg).Hash) {
    Copy-Item $newPkg $oldPkg -Force
    $needInstall = $true
  }
}
finally {
  Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}

Push-Location $projectRoot
try {
  if ($needInstall) {
    Write-Host "package.json changed - running npm install..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
  }

  # 6. commit and push
  git add -A
  $changes = git status --porcelain
  if (-not $changes) { Write-Host "Nothing changed - you already have this version." -ForegroundColor Green; return }
  Write-Host "`nChanged files:" -ForegroundColor Cyan
  git status --short
  if (-not $Message) { $Message = "Update " + (Get-Date -Format "yyyy-MM-dd HH:mm") }
  git commit -m $Message
  git push
  if ($LASTEXITCODE -ne 0) { throw "git push failed. Try: git pull --rebase origin main   then run again." }
  Write-Host "`nDone. Pushed to GitHub - Vercel will redeploy in a minute." -ForegroundColor Green
}
finally {
  Pop-Location
}
