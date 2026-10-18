$ErrorActionPreference = "SilentlyContinue"

$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")

$inbox = $ns.GetDefaultFolder(6) # olFolderInbox
$sent  = $ns.GetDefaultFolder(5) # olFolderSentMail

$keywords = @("Alky Reactor", "Alky Flare", "5884", "5333")

function Extract-EmailsFromFolder($folder, $folderType) {
    $items = $folder.Items
    $sortProp = if ($folderType -eq "Sent Items") { "[SentOn]" } else { "[ReceivedTime]" }
    $items.Sort($sortProp, $true)
    
    $results = New-Object System.Collections.ArrayList
    $scanned = 0

    foreach ($m in $items) {
        $scanned++
        if ($scanned -gt 2500) { break }
        try {
            if ($m.Class -ne 43) { continue } # olMail = 43

            $subj = [string]$m.Subject
            $body = [string]$m.Body
            $text = "$subj $body"

            $matchedKws = @()
            foreach ($kw in $keywords) {
                if ($text -match [regex]::Escape($kw)) {
                    $matchedKws += $kw
                }
            }

            if ($matchedKws.Count -gt 0) {
                $when = if ($folderType -eq "Sent Items") { $m.SentOn } else { $m.ReceivedTime }
                $email = $m.SenderEmailAddress
                if ($m.SenderEmailType -eq "EX") {
                    try { $email = $m.Sender.GetExchangeUser().PrimarySmtpAddress } catch { }
                }

                $cleanBody = if ($body) { ($body -replace "\r?\n", "`n").Trim() } else { "" }
                if ($cleanBody.Length -gt 8000) { $cleanBody = $cleanBody.Substring(0, 8000) }

                [void]$results.Add([pscustomobject]@{
                    folder      = $folderType
                    subject     = $subj
                    senderName  = [string]$m.SenderName
                    senderEmail = [string]$email
                    to          = [string]$m.To
                    cc          = [string]$m.CC
                    date        = $when.ToString("o")
                    matchedKws  = $matchedKws
                    body        = $cleanBody
                })
            }
        } catch { }
    }
    return $results
}

Write-Host "Extracting from Inbox..." -ForegroundColor Cyan
$inboxEmails = Extract-EmailsFromFolder $inbox "Inbox"
Write-Host "Extracted $($inboxEmails.Count) emails from Inbox." -ForegroundColor Green

Write-Host "Extracting from Sent Items..." -ForegroundColor Cyan
$sentEmails = Extract-EmailsFromFolder $sent "Sent Items"
Write-Host "Extracted $($sentEmails.Count) emails from Sent Items." -ForegroundColor Green

$allEmails = @($inboxEmails) + @($sentEmails)
Write-Host "Total extracted emails: $($allEmails.Count)" -ForegroundColor Yellow

$outputPath = "C:\Users\dpeng\Documents\Digital-Twin-Suite\scratch\extracted_kent_emails.json"
$json = ConvertTo-Json -InputObject $allEmails -Depth 5
[System.IO.File]::WriteAllText($outputPath, $json, [System.Text.Encoding]::UTF8)
Write-Host "Saved extracted emails to: $outputPath" -ForegroundColor Green
