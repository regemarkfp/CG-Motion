# Copies the RegemarkFP certificate to the clipboard in the form GitHub secrets need (base64),
# so GitHub can sign CG Motion too. The password is in build\RegemarkFP-password.txt.
$root = Split-Path -Parent $PSScriptRoot
$pfx = Join-Path $root 'build\RegemarkFP.pfx'
$pwFile = Join-Path $root 'build\RegemarkFP-password.txt'
if (-not (Test-Path $pfx)) { Write-Host ''; Write-Host ' No certificate yet: run "Create RegemarkFP certificate.bat" first.'; exit 1 }
[Convert]::ToBase64String([IO.File]::ReadAllBytes($pfx)) | Set-Clipboard
Write-Host ''
Write-Host ' Step 1: the certificate is now on the clipboard.'
Write-Host '   On GitHub open the repository > Settings > Secrets and variables > Actions > New repository secret.'
Write-Host '   Name: REGEMARKFP_PFX    Secret: paste (Ctrl+V)    then Add secret.'
Read-Host ' Press Enter when done, to copy the password'
Get-Content $pwFile -Raw | Set-Clipboard
Write-Host ''
Write-Host ' Step 2: the password is now on the clipboard.'
Write-Host '   New repository secret.  Name: REGEMARKFP_PASSWORD    Secret: paste (Ctrl+V)    then Add secret.'
Write-Host ''
Read-Host ' Press Enter when done (this clears the clipboard)'
Set-Clipboard -Value ' '
Write-Host ' Done. From the next upload GitHub signs CG Motion as RegemarkFP.'
