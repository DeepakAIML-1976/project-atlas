try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    
    # Check COM Addins
    Write-Host "Checking Outlook COM Addins for Teams..."
    for ($i = 1; $i -le $outlook.COMAddIns.Count; $i++) {
        $addon = $outlook.COMAddIns.Item($i)
        if ($addon.Description -like "*Teams*" -or $addon.ProgId -like "*Teams*") {
            Write-Host "Found Teams Addin: $($addon.Description) ($($addon.ProgId)) Connected: $($addon.Connect)"
        }
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
