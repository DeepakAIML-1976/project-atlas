try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    
    $inbox = $namespace.GetDefaultFolder(6) # olFolderInbox = 6
    $sent = $namespace.GetDefaultFolder(5)  # olFolderSentMail = 5

    Write-Host "Inbox name: $($inbox.Name) | Items: $($inbox.Items.Count)"
    Write-Host "Sent Items name: $($sent.Name) | Items: $($sent.Items.Count)"

    $keywords = @("Alky Reactor", "Alky Flare", "5884", "5333")

    function Scan-Folder($folder, $folderName) {
        Write-Host "`n--- Scanning $folderName ($($folder.Items.Count) items) ---"
        $items = $folder.Items
        $items.Sort("[ReceivedTime]", $true) # or SentOn
        $matched = 0
        $scanned = 0
        
        # Scan recent items or all
        foreach ($item in $items) {
            $scanned++
            if ($scanned -gt 1500) { break }
            try {
                $subj = $item.Subject
                $body = $item.Body
                $text = "$subj $body"

                $hit = $false
                $hitKw = ""
                foreach ($kw in $keywords) {
                    if ($text -like "*$kw*") {
                        $hit = $true
                        $hitKw = $kw
                        break
                    }
                }

                if ($hit) {
                    $matched++
                    $sender = $item.SenderName
                    $time = if ($item.ReceivedTime) { $item.ReceivedTime } else { $item.SentOn }
                    Write-Host "[$matched] Found ($hitKw): Subj: '$subj' | From: $sender | Date: $time"
                }
            } catch {}
        }
        Write-Host "Total matched in ${folderName}: $matched (out of $scanned scanned)"
    }

    Scan-Folder $inbox "Inbox"
    Scan-Folder $sent "Sent Items"

} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
