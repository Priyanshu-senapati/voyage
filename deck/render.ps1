# Renders a deck with the installed PowerPoint: a PDF next to the .pptx, plus one PNG per slide in deck/renders/.
# Usage (from anywhere):  powershell -ExecutionPolicy Bypass -File deck\render.ps1 [path\to\deck.pptx]
param([string]$Pptx = (Join-Path $PSScriptRoot "voyance_round1.pptx"))

$ErrorActionPreference = "Stop"
$full = (Resolve-Path $Pptx).Path
$outDir = Join-Path $PSScriptRoot "renders"
New-Item -ItemType Directory -Force $outDir | Out-Null
Get-ChildItem $outDir -Filter "slide-*.png" | Remove-Item -Force

$pp = New-Object -ComObject PowerPoint.Application
try {
    # Open(FileName, ReadOnly, Untitled, WithWindow): msoTrue = -1, msoFalse = 0
    $pres = $pp.Presentations.Open($full, -1, 0, 0)
    $pdf = [IO.Path]::ChangeExtension($full, ".pdf")
    $pres.SaveAs($pdf, 32)  # ppSaveAsPDF
    $i = 1
    foreach ($slide in $pres.Slides) {
        $slide.Export((Join-Path $outDir ("slide-{0}.png" -f $i)), "PNG", 2000, 1125)
        $i++
    }
    $pres.Close()
    Write-Output "pdf: $pdf"
    Get-ChildItem $outDir -Filter "slide-*.png" | ForEach-Object { Write-Output "png: $($_.FullName)" }
}
finally {
    $pp.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp) | Out-Null
}
