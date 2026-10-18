try {
    $outlook = New-Object -ComObject Outlook.Application
    $mail = $outlook.CreateItem(0) # olMailItem

    $recipients = @(
        "dpengineeringservices@gmail.com",
        "sunil.hiremath@kentplc.com",
        "DeepakParanjape@DPEngineeringservices.onmicrosoft.com"
    )

    foreach ($r in $recipients) {
        $mail.Recipients.Add($r) | Out-Null
    }
    $mail.Recipients.ResolveAll() | Out-Null

    $mail.Subject = "Calendar Invitation: Project 5884 - Technical Review & Construction Drawings / RFI Closures"

    $icsPath = "c:\Users\dpeng\Documents\Digital-Twin-Suite\Project_5884_Meeting_19Oct2026.ics"
    if (Test-Path $icsPath) {
        $mail.Attachments.Add($icsPath) | Out-Null
        Write-Host "Attached ICS file: $icsPath"
    }

    $meetingUrl = "https://teams.microsoft.com/meet/3974193108816856?p=czVGm69wMuy3elTrcm"

    $mail.HTMLBody = @"
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; }
  .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; max-width: 600px; background-color: #ffffff; }
  .header { font-size: 18px; font-weight: bold; color: #0f172a; margin-bottom: 15px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
  .time-badge { background-color: #eff6ff; color: #1d4ed8; padding: 8px 14px; border-radius: 6px; font-weight: 600; display: inline-block; margin-bottom: 15px; border: 1px solid #bfdbfe; }
  .button { display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 15px 0; }
  .section { margin-top: 15px; }
  .label { font-weight: bold; color: #334155; }
  .footer { margin-top: 20px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style>
</head>
<body>
<div class="card">
  <div class="header">Project 5884 - Technical Review & Construction Drawings / RFI Closures</div>
  
  <div class="time-badge">
    📅 Monday, 19 October 2026 &nbsp;|&nbsp; ⏰ 10:00 AM – 11:00 AM IST
  </div>

  <p>Dear Team,</p>
  <p>Please find your calendar invitation for the <strong>Project 5884 Technical Review & Construction Drawings / RFI Closures</strong> meeting. You can add this directly to your calendar via the attached <code>.ics</code> file or join directly using the button below.</p>

  <p style="text-align: center;">
    <a href="$meetingUrl" class="button">👉 Join Microsoft Teams Meeting</a>
  </p>

  <div class="section">
    <div class="label">Meeting Details:</div>
    <ul>
      <li><strong>Date & Time:</strong> Monday, 19-Oct-2026, 10:00 AM – 11:00 AM (IST)</li>
      <li><strong>Meeting Link:</strong> <a href="$meetingUrl">$meetingUrl</a></li>
      <li><strong>Organizer:</strong> Deepak Paranjape (Host)</li>
      <li><strong>Attendees:</strong> Sunil Hiremath, dpengineeringservices@gmail.com, DeepakParanjape@DPEngineeringservices.onmicrosoft.com</li>
    </ul>
  </div>

  <div class="section">
    <div class="label">Agenda:</div>
    <ol>
      <li>Status of Project 5884 construction drawings for reactor platforms</li>
      <li>Review and closure of outstanding RFIs prior to client submittal</li>
      <li>Piping SME technical review (ASME B31.3 / API 570)</li>
    </ol>
  </div>

  <div class="section" style="background-color: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #3b82f6;">
    <div class="label">AI Representative Participation Notice:</div>
    <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;">
      <strong>Deepak's AI Representative (Atlas)</strong> will participate alongside Deepak to assist with live technical assessments (ASME B31.3 / API 570), automated transcription, and action item logging.
    </p>
  </div>

  <div class="footer">
    Coordinated by Deepak AI Representative Atlas | Digital Twin Suite
  </div>
</div>
</body>
</html>
"@

    Write-Host "Sending calendar invitation email with attached .ics to all participants..."
    $mail.Send()
    Write-Host "[SUCCESS] Calendar invite email dispatched to: $($recipients -join ', ')"
} catch {
    Write-Error $_
    exit 1
}
