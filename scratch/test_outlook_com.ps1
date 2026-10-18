try {
    $outlook = New-Object -ComObject Outlook.Application
    Write-Host "Outlook COM Object available! Version: $($outlook.Version)"
    $namespace = $outlook.GetNamespace("MAPI")
    Write-Host "Default profile: $($namespace.CurrentProfileName)"
    Write-Host "Accounts count: $($namespace.Accounts.Count)"
    for ($i = 1; $i -le $namespace.Accounts.Count; $i++) {
        $acc = $namespace.Accounts.Item($i)
        Write-Host "Account ${i}: $($acc.DisplayName) ($($acc.SmtpAddress))"
    }
} catch {
    Write-Host "Outlook COM not available: $($_.Exception.Message)"
}
