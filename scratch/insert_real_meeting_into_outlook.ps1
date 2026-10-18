try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $calendar = $namespace.GetDefaultFolder(9) # olFolderCalendar

    Write-Host "Creating Outlook Calendar Meeting on Deepak's account..."
    $appt = $outlook.CreateItem(1) # olAppointmentItem
    $appt.Subject = "Project 5884 - Technical Review & Construction Drawings / RFI Closures"
    $appt.Start = [DateTime]::Parse("2026-10-19 10:00:00")
    $appt.End = [DateTime]::Parse("2026-10-19 11:00:00")
    $appt.Location = "Microsoft Teams Meeting"

    $meetingUrl = "https://teams.microsoft.com/meet/3974193108816856?p=czVGm69wMuy3elTrcm"

    $appt.Body = @"
Project 5884 - Technical Review & Construction Drawings / RFI Closures
Meeting Coordinated by: Deepak AI Representative (Atlas)

Date & Time: Monday, 19-Oct-2026 from 10:00 AM to 11:00 AM (IST)
Location: Microsoft Teams Meeting

Join Microsoft Teams Meeting:
$meetingUrl

Participants:
- Deepak Paranjape (Host)
- deepak.paranjape@kentplc.com
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

    $r1 = $appt.Recipients.Add("deepak.paranjape@kentplc.com")
    $r1.Type = 1 # olRequired

    $r2 = $appt.Recipients.Add("dpengineeringservices@gmail.com")
    $r2.Type = 1

    $r3 = $appt.Recipients.Add("sunil.hiremath@kentplc.com")
    $r3.Type = 1

    $r4 = $appt.Recipients.Add("DeepakParanjape@DPEngineeringservices.onmicrosoft.com")
    $r4.Type = 1

    $appt.Recipients.ResolveAll() | Out-Null

    $appt.ReminderSet = $true
    $appt.ReminderMinutesBeforeStart = 15

    $appt.Save()
    Write-Host "[SUCCESS] Meeting successfully saved to Outlook Calendar!"
    Write-Host "EntryID: $($appt.EntryID)"

    # Verify insertion on 19-Oct-2026
    Start-Sleep -Seconds 1
    $matching = $calendar.Items | Where-Object { $_.Start -ge (Get-Date "2026-10-19 00:00:00") -and $_.Start -le (Get-Date "2026-10-19 23:59:59") }
    Write-Host "[VERIFICATION] Found $($matching.Count) item(s) on 19-Oct-2026 in Calendar:"
    foreach ($m in $matching) {
        Write-Host "  -> $($m.Subject) | Start: $($m.Start) | Location: $($m.Location)"
    }

} catch {
    Write-Host "[ERROR]: $($_.Exception.Message)"
}
