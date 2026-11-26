# Generates the two PDF fixtures with Windows' built-in "Microsoft Print to PDF" printer (Windows only).
#   kohsar-annual-report.pdf   : real text layer (text drawn as text)
#   scanned-membership-card.pdf: image only, no text layer (text drawn into a bitmap first, like a scan)
# Real PDF tooling matters: Gemini rejects some hand-assembled PDFs, so the fixtures come from a real printer driver.
param([string]$OutDir = (Join-Path $PSScriptRoot '..\fixtures\documents'))
Add-Type -AssemblyName System.Drawing

function Print-ToPdf([string]$path, [scriptblock]$draw) {
  if (Test-Path $path) { Remove-Item $path }
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = 'Microsoft Print to PDF'
  $doc.PrinterSettings.PrintToFile = $true
  $doc.PrinterSettings.PrintFileName = $path
  $doc.add_PrintPage({ param($s, $e) & $draw $e.Graphics $e.PageBounds; $e.HasMorePages = $false }.GetNewClosure())
  $doc.Print(); $doc.Dispose()
  for ($i = 0; $i -lt 40 -and -not (Test-Path $path); $i++) { Start-Sleep -Milliseconds 250 }
  Start-Sleep -Milliseconds 500
  "wrote $path"
}

$reportLines = @(
  'Kohsar Falcons Cricket Club - Annual Report 2024',
  '',
  'Membership: 238 members at the end of 2024 (up from 201 in 2023).',
  'Annual membership fee: 4,500 rupees for adults, 2,000 rupees for juniors.',
  'The club bought a new bowling machine in May 2024 for 310,000 rupees.',
  'Next annual general meeting: 15 February 2025 at the Pinewood Oval pavilion.'
)
Print-ToPdf (Join-Path $OutDir 'kohsar-annual-report.pdf') {
  param($g, $bounds)
  $title = New-Object System.Drawing.Font 'Arial', 16, ([System.Drawing.FontStyle]::Bold)
  $body = New-Object System.Drawing.Font 'Arial', 11
  $y = 80
  foreach ($l in $reportLines) { $f = if ($y -eq 80) { $title } else { $body }; $g.DrawString($l, $f, [System.Drawing.Brushes]::Black, 70, $y); $y += 28 }
}

$bmp = New-Object System.Drawing.Bitmap 1240, 1754
$bg = [System.Drawing.Graphics]::FromImage($bmp)
$bg.Clear([System.Drawing.Color]::FromArgb(250, 248, 240))
$bg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$bg.DrawString('KOHSAR FALCONS CRICKET CLUB', (New-Object System.Drawing.Font 'Georgia', 34, ([System.Drawing.FontStyle]::Bold)), [System.Drawing.Brushes]::Black, 100, 140)
$cardLines = @('Membership card', 'Member: Ayesha Siddiqui', 'Membership number: KF-0421', 'Category: Senior playing member', 'Valid until: March 2027')
$y = 260; foreach ($l in $cardLines) { $bg.DrawString($l, (New-Object System.Drawing.Font 'Georgia', 26), [System.Drawing.Brushes]::Black, 100, $y); $y += 70 }
$bg.Dispose()
Print-ToPdf (Join-Path $OutDir 'scanned-membership-card.pdf') {
  param($g, $bounds)
  $g.DrawImage($bmp, $bounds)
}
$bmp.Dispose()
