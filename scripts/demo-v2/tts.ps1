# Renders each narration line to a WAV with the Windows built-in speech synthesizer (free, local).
# Usage: powershell -File scripts/demo-v2/tts.ps1 [-Rate 1]
param([int]$Rate = -99)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $root "narration.json") -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Rate -eq -99) { $Rate = [int]$cfg.rate }
$out = Join-Path $root "..\..\docs\media\v2"
New-Item -ItemType Directory -Force $out | Out-Null
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice($cfg.voice)
$s.Rate = $Rate
foreach ($l in $cfg.lines) {
  $f = Join-Path $out ($l.id + ".wav")
  $s.SetOutputToWaveFile($f)
  $s.Speak($l.text)
  $s.SetOutputToNull()
  Write-Output ("{0} rate={1} {2}" -f $l.id, $Rate, $f)
}
$s.Dispose()
