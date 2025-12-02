# Path to the base64 file generated earlier
$b64Path = "C:\Users\gombc\OneDrive - Sport Dog Food\github\client\clear-round-datasets\items\agents\crt-blog-runner\crt-bottom-runner\bottom-runner-zip.zip.b64"

# Chunk size (characters)
$chunkSize = 50000

# Read the entire base64 string
$b64 = Get-Content $b64Path -Raw

# Compute number of chunks
$length = $b64.Length
$chunks = [Math]::Ceiling($length / $chunkSize)

Write-Output "Splitting into $chunks chunks..."

# Output directory (same as base64 file)
$outDir = Split-Path $b64Path

for ($i = 0; $i -lt $chunks; $i++) {
    $start = $i * $chunkSize
    $count = [Math]::Min($chunkSize, $length - $start)
    $segment = $b64.Substring($start, $count)

    $index = "{0:D3}" -f ($i + 1)  # 001, 002, 003
    $outFile = Join-Path $outDir "chunk_$index.txt"

    $segment | Out-File -Encoding ascii $outFile

    Write-Output "Created: $outFile"
}

Write-Output "Done!"
