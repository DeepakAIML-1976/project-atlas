try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    
    $entryID = "000000001DD3D1F2036FDB469166B87C46A3CBEC0700E42F84BC50EA8048A5639E34EC352B9F00000000010D0000E42F84BC50EA8048A5639E34EC352B9F0001EE14FFE40000"
    $appt = $null
    
    try {
        $appt = $namespace.GetItemFromID($entryID)
        Write-Host "Successfully loaded appointment by EntryID: $($appt.Subject)"
    } catch {
        Write-Host "Could not load by EntryID, querying calendar..."
        $calendar = $namespace.GetDefaultFolder(9) # olFolderCalendar
        $items = $calendar.Items
        $items.IncludeRecurrences = $false
        $filtered = $items.Restrict("[Start] >= '19/10/2026 00:00' AND [Start] <= '19/10/2026 23:59'")
        if ($filtered.Count -eq 0) {
            $filtered = $items.Restrict("[Start] >= '10/19/2026 00:00' AND [Start] <= '10/19/2026 23:59'")
        }
        if ($filtered.Count -gt 0) {
            $appt = $filtered.Item(1)
            Write-Host "Found appointment via Restrict: $($appt.Subject)"
        }
    }

    if (-not $appt) {
        Write-Host "Creating fresh appointment..."
        $appt = $outlook.CreateItem(1)
        $appt.Subject = "Project 5884 - Technical Review & Construction Drawings / RFI Closures"
        $appt.Start = [DateTime]::Parse("2026-10-19 10:00:00")
        $appt.End = [DateTime]::Parse("2026-10-19 11:00:00")
    }

    $meetingUrl = "https://teams.microsoft.com/meet/3974193108816856?p=czVGm69wMuy3elTrcm"
    $appt.Location = "Microsoft Teams Meeting"
    $appt.Body = @"
Project 5884 - Technical Review & Construction Drawings / RFI Closures
Meeting Coordinated by: Deepak AI Representative (Atlas)

Date & Time: Monday, 19-Oct-2026 from 10:00 AM to 11:00 AM (IST)
Location: Microsoft Teams Meeting

Join Microsoft Teams Meeting:
$meetingUrl

Participants:
- Deepak Paranjape (Host - deepak.paranjape@kentplc.com)
- dpengineeringservices@gmail.com
- sunil.hiremath@kentplc.com
- DeepakParanjape@DPEngineeringservices.onmicrosoft.com
- Deepak AI Representative Atlas (Active Participant & Technical Co-Host)

Agenda:
1. Status of Project 5884 construction drawings for reactor platforms
2. Review and closure of outstanding RFIs prior to client submittal
3. Piping SME technical review (ASME B31.3 / API 570)

AI Representative Participation Policy:
Deepak AI Representative Atlas will attend this session alongside Deepak to handle live transcription, piping SME technical assessment (ASME B31.3 / API 570), and automated action item logging.
"@

    $appt.MeetingStatus = 1 # olMeeting
    $appt.ResponseRequested = $true
    $appt.ReminderSet = $true
    $appt.ReminderMinutesBeforeStart = 15

    # Attendees to invite
    $recipientsList = @(
        "dpengineeringservices@gmail.com",
        "sunil.hiremath@kentplc.com",
        "DeepakParanjape@DPEngineeringservices.onmicrosoft.com"
    )

    foreach ($email in $recipientsList) {
        $found = $false
        foreach ($r in $appt.Recipients) {
            if ($r.Address -ieq $email -or $r.Name -ieq $email) {
                $found = $true
                break
            }
        }
        if (-not $found) {
            $nr = $appt.Recipients.Add($email)
            $nr.Type = 1 # olRequired
            Write-Host "Added attendee: $email"
        }
    }

    $appt.Recipients.ResolveAll() | Out-Null
    Write-Host "Total resolved attendees: $($appt.Recipients.Count)"

    # Save first, then send
    $appt.Save()
    Write-Host "Appointment saved. Now sending meeting invitation to all participants..."
    $appt.Send()
    Write-Host "[SUCCESS] Meeting invitation dispatched to all attendees via Deepak's Outlook!"

} catch {
    Write-Error "Error: $_"
    exit 1
}
