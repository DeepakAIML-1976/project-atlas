try {
    $outlook = New-Object -ComObject Outlook.Application
    $appt = $outlook.CreateItem(1) # olAppointmentItem = 1
    $appt.Subject = "Test Appointment Properties"
    $appt.Display() # Displays the appointment inspector
    Start-Sleep -Seconds 1

    # Check Inspector ribbon commands
    $inspector = $appt.GetInspector
    Write-Host "Inspector Caption: $($inspector.Caption)"
    
    # Check if Teams meeting button can be executed
    # In Office Ribbon: Teams Meeting button idMso is "TeamsMeetingNew" or "CreateTeamsMeeting"
    try {
        $outlook.ActiveExplorer()
    } catch {}

    $appt.Close(1) # olDiscard = 1
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
