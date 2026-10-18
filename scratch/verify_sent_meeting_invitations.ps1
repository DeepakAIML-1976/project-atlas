try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $sent = $namespace.GetDefaultFolder(5) # olFolderSentMail
    $items = $sent.Items
    $items.Sort("[SentOn]", $true)

    Write-Host "Verifying most recent items in Sent Items folder:"
    $count = [Math]::Min(10, $items.Count)
    for ($idx = 1; $idx -le $count; $idx++) {
        $item = $items.Item($idx)
        $msgClass = $item.MessageClass
        $subj = $item.Subject
        $sentOn = $item.SentOn
        $to = $item.To
        Write-Host "Item #$idx - Class: $msgClass | SentOn: $sentOn"
        Write-Host "   Subject: $subj"
        Write-Host "   To: $to"
    }

    $outbox = $namespace.GetDefaultFolder(4) # olFolderOutbox
    Write-Host "`nItems pending in Outbox: $($outbox.Items.Count)"
    foreach ($ob in $outbox.Items) {
        Write-Host "Outbox Item: $($ob.Subject) | To: $($ob.To)"
    }
} catch {
    Write-Error $_
}
