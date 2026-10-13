# Makes the RegemarkFP code-signing certificate (once) and trusts it on this PC.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'build'
$pfx = Join-Path $dir 'RegemarkFP.pfx'
$cer = Join-Path $dir 'RegemarkFP.cer'
$pwFile = Join-Path $dir 'RegemarkFP-password.txt'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
if (Test-Path $pfx) {
  Write-Host ''
  Write-Host ' The RegemarkFP certificate already exists (build\RegemarkFP.pfx). Nothing to do.'
  exit 0
}
Write-Host ''
Write-Host ' Making the RegemarkFP code-signing certificate...'
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=RegemarkFP, O=RegemarkFP' -FriendlyName 'RegemarkFP code signing' `
  -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(10)
$chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
$pw = -join (1..28 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password (ConvertTo-SecureString $pw -AsPlainText -Force) | Out-Null
Export-Certificate -Cert $cert -FilePath $cer | Out-Null
Set-Content -Path $pwFile -Value $pw -NoNewline
Write-Host ' Trusting it on this PC (Windows will ask you to confirm - click Yes)...'
Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher' | Out-Null
Write-Host ''
Write-Host ' Done. Build CG Motion.bat now signs CG Motion as RegemarkFP.'
Write-Host ' Keep build\RegemarkFP.pfx and RegemarkFP-password.txt private: anyone with both can sign as RegemarkFP.'
