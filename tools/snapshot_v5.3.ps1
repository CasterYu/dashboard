$src = 'D:\projects\dashboard\index.html'
$dst = 'D:\projects\dashboard\legacy\index_v5.2.html'
if (Test-Path $dst) {
    $s1 = (Get-Item $src).Length; $s2 = (Get-Item $dst).Length
    if ($s1 -eq $s2) { Write-Output ('skip: snapshot exists same size ' + $s1) }
    else { Write-Output ('ABORT: size mismatch src=' + $s1 + ' dst=' + $s2); exit 1 }
} else {
    Copy-Item $src $dst
    $s1 = (Get-Item $src).Length; $s2 = (Get-Item $dst).Length
    if ($s1 -eq $s2) { Write-Output ('copied OK size=' + $s1) }
    else { Remove-Item $dst; Write-Output 'ABORT: copy size mismatch'; exit 1 }
}
# legacy 顶层快照 >5 份则按 LastWriteTime 升序移最旧到 _archive
$snaps = Get-ChildItem 'D:\projects\dashboard\legacy' -Filter 'index_v*.html' | Sort-Object LastWriteTime
if ($snaps.Count -gt 5) {
    $arch = 'D:\projects\dashboard\legacy\_archive'
    if (-not (Test-Path $arch)) { New-Item -ItemType Directory -Path $arch | Out-Null }
    $snaps | Select-Object -First ($snaps.Count - 5) | ForEach-Object {
        Move-Item $_.FullName (Join-Path $arch $_.Name)
        Write-Output ('archived: ' + $_.Name)
    }
}
Write-Output ('legacy top-level now: ' + (Get-ChildItem 'D:\projects\dashboard\legacy' -Filter 'index_v*.html').Count)
