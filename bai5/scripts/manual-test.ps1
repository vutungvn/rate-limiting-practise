# Kiem thu thu cong tren server dang chay (npm run build; npm start).
# Chay: powershell -ExecutionPolicy Bypass -File scripts/manual-test.ps1 [-BaseUrl http://localhost:3000]
param([string]$BaseUrl = "http://localhost:3000")

function Hit([string]$Path, [string]$Body, [string]$UserId) {
  $headers = @("-H", "Content-Type: application/json")
  if ($UserId) { $headers += @("-H", "x-user-id: $UserId") }
  $file = New-TemporaryFile
  Set-Content -Path $file -Value $Body -Encoding ascii -NoNewline
  $code = & curl.exe -s -o NUL -w "%{http_code}" -X POST "$BaseUrl$Path" @headers --data-binary "@$file"
  Remove-Item $file
  return $code
}

$suffix = Get-Random
Write-Host "== POST /orders/flash-sale (tai khoan bot-$suffix), ky vong: 201 201 201 429 =="
1..4 | ForEach-Object { Write-Host ("lan {0} -> {1}" -f $_, (Hit "/orders/flash-sale" '{"productId":"iphone-17","quantity":1}' "bot-$suffix")) }

Write-Host "== POST /auth/send-otp (cung so, doi dinh dang), ky vong: 201 201 201 429 =="
$n = "09{0:D8}" -f (Get-Random -Maximum 99999999)
$formats = @($n, ("+84" + $n.Substring(1)), ("84" + $n.Substring(1)), $n)
$i = 1
foreach ($p in $formats) { Write-Host ("lan {0} ({1}) -> {2}" -f $i, $p, (Hit "/auth/send-otp" "{`"phone`":`"$p`"}")); $i++ }
