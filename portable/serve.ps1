$ErrorActionPreference = "Stop"

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$port = 4173
$listener = $null

while ($port -le 4190 -and $null -eq $listener) {
    try {
        $candidate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        $candidate.Start()
        $listener = $candidate
    }
    catch {
        $port++
    }
}

if ($null -eq $listener) {
    throw "Could not find an available local port between 4173 and 4190."
}

$url = "http://127.0.0.1:$port/"
Write-Host "JEVArena is running at $url"
Write-Host "Press Ctrl+C or close this window to stop it."
Start-Process $url

function Get-ContentType([string]$path) {
    switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
        ".html" { return "text/html; charset=utf-8" }
        ".js"   { return "text/javascript; charset=utf-8" }
        ".mjs"  { return "text/javascript; charset=utf-8" }
        ".css"  { return "text/css; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".svg"  { return "image/svg+xml" }
        ".png"  { return "image/png" }
        ".jpg"  { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".webp" { return "image/webp" }
        ".ico"  { return "image/x-icon" }
        ".woff" { return "font/woff" }
        ".woff2" { return "font/woff2" }
        default  { return "application/octet-stream" }
    }
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new(
                $stream,
                [System.Text.Encoding]::ASCII,
                $false,
                4096,
                $true
            )

            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                $client.Close()
                continue
            }

            while ($true) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) { break }
            }

            $parts = $requestLine.Split(" ")
            $rawPath = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
            $rawPath = $rawPath.Split("?")[0]
            $relative = [System.Uri]::UnescapeDataString($rawPath.TrimStart("/"))
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }

            $candidatePath = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
            $safeRoot = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

            $status = "200 OK"
            $contentType = "text/plain; charset=utf-8"
            $body = $null

            if (-not $candidatePath.StartsWith($safeRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                $status = "403 Forbidden"
                $body = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
            }
            elseif (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
                $body = [System.IO.File]::ReadAllBytes($candidatePath)
                $contentType = Get-ContentType $candidatePath
            }
            else {
                $status = "404 Not Found"
                $body = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
            }

            $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
            $stream.Flush()
        }
        catch {
            Write-Warning $_.Exception.Message
        }
        finally {
            $client.Close()
        }
    }
}
finally {
    if ($null -ne $listener) { $listener.Stop() }
}
