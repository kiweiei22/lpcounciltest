
try {
    Write-Host "Connecting to API..."
    $response = Invoke-WebRequest -Uri "https://lpcounciltest.vercel.app/api/init" -Method POST -ContentType "application/json" -Body '{"secret":"init-turso-db-2024"}'
    Write-Host "Success!" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "Request Failed!" -ForegroundColor Red
    Write-Host "Status: " $_.Exception.Response.StatusCode
    
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = [System.IO.StreamReader]::new($stream)
        $body = $reader.ReadToEnd()
        Write-Host "Error Details from Server:" -ForegroundColor Yellow
        Write-Host $body
    } else {
        Write-Host "Error: " $_.Exception.Message
    }
}
