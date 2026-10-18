$ErrorActionPreference = "Stop"
$out = "C:\Users\dpeng\.gemini\antigravity\brain\a6139213-1b01-4be2-a990-f6942830b6a6\outlook_emails_summary.json"

$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")

function Get-Items($folder, $count) {
    $items = $folder.Items
    $items.Sort("[ReceivedTime]", $true)
    $list = @()
    $i = 0
    foreach ($m in $items) {
        if ($i -ge $count) { break }
        try {
            $body = ""
            if ($m.Body) { $body = ($m.Body -replace "\s+", " ").Trim(); if ($body.Length -gt 200) { $body = $body.Substring(0, 200) } }
            $list += [pscustomobject]@{
                Subject  = $m.Subject
                From     = $m.SenderName
                To       = $m.To
                Received = if ($m.ReceivedTime) { $m.ReceivedTime.ToString("yyyy-MM-dd HH:mm") } else { "" }
                Sent     = if ($m.SentOn) { $m.SentOn.ToString("yyyy-MM-dd HH:mm") } else { "" }
                Unread   = $m.UnRead
                Preview  = $body
            }
            $i++
        } catch { }
    }
    return $list
}

$inbox = $ns.GetDefaultFolder(6)
$sent  = $ns.GetDefaultFolder(5)

$inboxItems = Get-Items $inbox 10
$sentItems  = Get-Items $sent 10

$report = [pscustomobject]@{
    account    = "deepak.paranjape@kentplc.com"
    timestamp  = (Get-Date).ToString("s")
    inboxTotal = $inbox.Items.Count
    inboxUnread = $inbox.UnReadItemCount
    sentTotal  = $sent.Items.Count
    inbox      = $inboxItems
    sent       = $sentItems
}
$report | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $out

Write-Output "INBOX total=$($report.inboxTotal) unread=$($report.inboxUnread) | SENT total=$($report.sentTotal)"
Write-Output "---- LATEST INBOX ----"
$inboxItems | ForEach-Object { Write-Output ("[{0}] {1} | {2}" -f $_.Received, $_.From, $_.Subject) }
Write-Output "---- LATEST SENT ----"
$sentItems | ForEach-Object { Write-Output ("[{0}] To: {1} | {2}" -f $_.Sent, $_.To, $_.Subject) }
