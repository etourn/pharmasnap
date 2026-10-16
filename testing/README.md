# Test sheets

Fill `true_name` / `true_expiry` in scan-accuracy.csv BEFORE scanning anything.
`silent_error` = confidence flag was "high" but the value was wrong (the number that matters most).

Barcode: register each item once (barcode-new), then re-scan it (barcode-match).

Timing: same items in both arms. Group A does old first, group B does new first.
Start the timer on tapping "+ Add medicine", stop on "Confirm". Include time spent fixing scan errors.
Report median and range per arm.

Use a test account / test data, not the real inventory.
