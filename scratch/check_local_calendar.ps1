try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $calendar = $namespace.GetDefaultFolder(9) # olFolderCalendar = 9
    Write-Host "Calendar folder found: $($calendar.Name) (Items count: $($calendar.Items.Count))"

    # Search for any items on 19-Oct-2026
    $items = $calendar.Items
    $items.IncludeRecurrences = $true
    $items.Sort("[Start]")
    Write-Host "Checking items around October 2026..."
    $filter = "[Start] >= '19/10/2026 00:00 AM' AND [End] <= '20/10/2026 11:59 PM'"
    # In Windows date format (depending on culture)
    $matching = $calendar.Items | Where-Object { $_.Start -ge (Get-Date "2026-10-19 00:00:00") -and $_.Start -le (Get-Date "2026-10-19 23:59:59") }
    Write-Host "Matching items on 19-Oct-2026: $($matching.Count)"
    foreach ($m in $matching) {
        Write-Host "  Found: $($m.Subject) at $($m.Start)"
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
