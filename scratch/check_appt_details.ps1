try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $calendar = $namespace.GetDefaultFolder(9)

    $items = $calendar.Items
    $items.IncludeRecurrences = $false
    $targetDateStart = Get-Date "2026-10-19 00:00:00"
    $targetDateEnd = Get-Date "2026-10-19 23:59:59"

    $found = $null
    foreach ($item in $items) {
        if ($item.Start -ge $targetDateStart -and $item.Start -le $targetDateEnd) {
            if ($item.Subject -like "*5884*") {
                $found = $item
                break
            }
        }
    }

    if ($found) {
        Write-Host "Appointment Found:"
        Write-Host "  Subject: $($found.Subject)"
        Write-Host "  Start: $($found.Start)"
        Write-Host "  End: $($found.End)"
        Write-Host "  MeetingStatus: $($found.MeetingStatus)" # 1=olMeeting, 2=olMeetingReceived, 3=olMeetingCanceled
        Write-Host "  ResponseRequested: $($found.ResponseRequested)"
        Write-Host "  Recipients count: $($found.Recipients.Count)"
        for ($i = 1; $i -le $found.Recipients.Count; $i++) {
            $r = $found.Recipients.Item($i)
            $rName = $r.Name
            $rAddr = $r.Address
            $rType = $r.Type
            $rStatus = $r.MeetingResponseStatus
            Write-Host "    Attendee $i - Name: $rName | Address: $rAddr | Type: $rType | Status: $rStatus"
        }
    } else {
        Write-Host "No matching appointment found on 19-Oct-2026."
    }
} catch {
    Write-Error $_
}
