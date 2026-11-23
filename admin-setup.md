# UARL Race Control — personal accounts setup

Edition 31 uses individual staff accounts and direct live publishing. It does **not** require GitHub or another repository.

## One-time Netlify deployment

Race Control includes a secure server-side login and publisher, so deploy this package once with the Netlify CLI. Future website content changes are published entirely from `/admin/`.

1. Unzip the complete site folder on a computer with Node.js installed.
2. Open a terminal inside that folder.
3. Run `npm install`.
4. Run `npx netlify login` and complete the Netlify sign-in.
5. Run `npx netlify link` and select the existing UARL Netlify site.
6. In Netlify, open **Site configuration → Environment variables** and add:
   - Key: `UARL_ADMIN_KEY`
   - Value: a long, random one-time setup key
7. Run `npx netlify deploy --prod`.

Keep `UARL_ADMIN_KEY` private and leave it configured after setup. It protects account sessions, but it is not anyone’s daily login password.

## Create the first Owner account

1. Open `/admin/` on the live website.
2. Race Control automatically displays **Create Owner** when no accounts exist.
3. Enter your display name, desired username, a new personal password, and the one-time setup key from Netlify.
4. Select **Create Owner account**.

The setup screen permanently closes after the first Owner is created. From then on, everyone signs in with their own username and password.

## Staff roles

- **Owner:** complete website control, staff-account management, password resets, and activity history.
- **Admin:** complete website editing and publishing without staff-account management.
- **Race Control:** schedule, results, and standings editing/publishing only.

The Owner can add, update, reset, or disable staff accounts under **Administration → Staff accounts**. Passwords are stored as secure salted hashes. Every publish records the responsible staff member, time, note, and revision.

## Daily workflow

1. Open `/admin/` and sign in with your personal account.
2. Edit an allowed section. Changes autosave as a private browser recovery draft.
3. Use **Preview** to inspect the draft without changing the public site.
4. Select **Publish website** and confirm. Public pages use the new data immediately.

Roster, charter, qualifying, race-result, stage, bonus, paint-tag, and history records use visual row builders. In Results, choose drivers from the selected series' dropdown; Race Control fills the car number automatically and prevents unrelated names. Use the add/remove controls for rows—normal updates do not require editing JSON.

Race Control calculates result points automatically. Enter the finishing order, stage order, pole winner, applicable bonus types, and each driver's eligibility/status. The read-only total follows the universal UARL points table and becomes zero automatically for exhibitions or points-ineligible drivers.

Drivers are registered permanently under **Driver roster**. Add their Roblox username, public display name, and roster series once. D1 roster entries belong to a team; Open Series entries may be independent. Profiles and existing free-agent records are retained when a driver has no current seat. Leave the car number blank until it is known. Existing free agents with saved usernames are registered for D1 automatically, without reusing their former charter numbers. **Other names accepted in CSV** stores full names or former display names that should resolve to that same driver. These names do not replace the current public display name. The result editor no longer has a guest-driver entry section.

Always include the correct Roblox username when registering a driver. Race Control uses that username as the permanent identity, so future display-name changes and saved CSV names contribute to the same standings row. Older results remain intact; verified drivers in former race-only entries are registered automatically when upgrading. Race-specific numbers in those saved records remain unchanged.

For a renamed account, use **Edit name or username** beside an assigned driver in **Teams + charters**. Keep **Driver account (original username)** and edit **Current Roblox username** instead. Username changes retain the same driver, team, points, artwork, and accepted former handles; a username belonging to another registered driver is rejected. Use **Move or sign a driver** to assign a different person to a seat. Public roster cards show the current username, and CSV imports accept it while retaining the original account’s results and points. The supplied roster links King’s `kingofgamez_YT`, Muffin’s `Muffin`, and JJ’s `JamesRacer22` to their existing records. James Eklund (#25) and JJ Whitlock (#84) remain separate drivers.

The current D1 roster follows the supplied league sheet: Dakota Sullivan Racing runs Chevrolet; Avery, Goforth, Team Penske, and Sham run Ford; Goat Whitlock and Winston-Hermonstyne run Toyota. Grouped rosters show the manufacturer logo in the team header; individual driver cards and profiles retain their badges. Logos also appear in race finishes and in the public and admin points standings (including CSV previews and zero-point drivers). Open Series entries retain their separate manufacturer choices, and historical finishes use a recorded manufacturer when provided. An unassigned manufacturer shows a dash with an accessible label instead of an invented logo. CSV headers stay the same. Open cars, part-time vacancies, and TBD numbers do not create extra drivers.

Existing published data and browser drafts receive this roster update once. Previous teams and profiles are retained in the downloadable backup, including retired branding and old number artwork. Saved signatures and career statistics follow the driver, while number artwork carries over only when the number still matches. Historical results and points stay attached to the original driver. Later manual roster edits are kept.

The #84 driver is displayed as **JJ**; **James Eklund** remains a separate driver. JJ’s former names continue to work in CSV lookups. Missing standings names from the earlier roster update recover automatically from the saved CSV backup or verified driver profile. No CSV reimport is needed, and points, car numbers, position changes, and manual ordering are preserved.

Sessions remain active for up to 12 hours. **Sign out** ends the current session immediately.

## Add drivers from CSV

Owners and Admins can choose **Add drivers from CSV** on the dashboard, or open **Driver roster → Import drivers from CSV**. Select **D1 · Cup** or **Open Series** under **Import into**, then paste the data or upload a `.csv` file using this exact header:

```csv
DriverName,Username,Driver#,Team
```

Select **Preview CSV** to check names, account matches, car numbers, teams, and whether each row adds or skips a driver. The preview counts new entries and skipped rows. Select **Apply preview to draft** to add the new entries. Applying the batch is one **Undo** action and supports browser draft recovery. When every row is skipped, there is nothing to apply and your draft stays unchanged. Use **Publish website** after reviewing the draft.

The import adds drivers to the selected series. `DriverName` and a Roblox `Username` are required for new entries; current usernames and saved former usernames match the same permanent identity. Drivers already assigned to that series are skipped, preserving their names, numbers, team, manufacturer, points, career statistics, and artwork. Repeated accounts in the same CSV are also skipped after their first accepted row. Use the entry editor or team transfer tools to change existing roster entries. A profile or assignment in another series does not prevent adding the driver to this series. Different accounts are never combined because they share a name or number. Switching series keeps the pasted CSV but requires a fresh preview before applying.

For **D1**, every new roster entry must have a team. `Team` accepts an existing team name or ID; **Available teams** lists both. A number already assigned to another D1 driver cannot be reused, including on a different team. Vacant charters do not count as drivers. Create a new D1 team in **Teams + charters** before importing drivers for it. Existing free-agent records and Open Series entries are preserved.

For **Open Series**, different drivers can share the same car number. Each keeps their own identity, points, artwork, and manufacturer. `Team` is optional. Leave it blank to register an independent entry. Keep the `Team` header and the final comma when its value is blank, for example `Open Driver,OpenDriver22,005,`. Applying the import opens the first newly added Open entry for review, where its optional team label, car number and manufacturer can be edited. Existing Open manufacturers stay unchanged; a new entry starts unassigned. D1 seats, numbers and number artwork are preserved. A new Open entry never borrows a driver’s D1 number or number artwork.

A blank `Driver#` leaves a new Open entry pending. In D1, it uses a saved D1 number when available, or stays pending. Leading zeros are preserved, so `05` and `5` remain different numbers. Invalid new rows, ambiguous account aliases, or occupied D1 numbers block the whole batch. Existing roster entries are skipped even if their CSV name, number, or team is outdated. When Open drivers share a name and number, use their usernames in results and standings CSVs to identify them individually.

Race Control accounts cannot import driver rosters.

## Import results from CSV

1. Open **Results + points → Add new** and choose the scheduled race as usual.
2. Expand **Import results from CSV** and paste the header and driver rows:

   ```csv
   FinishingPosition,Driver,Qualifying,Stage1,Stage2,FastestLap,MostLapsLed
   1,DriverUsername,2,1,3,Yes,No
   2,OtherUsername,1,2,1,No,Yes
   ```

3. Select **Preview CSV**. Check the matched drivers, car numbers, classifications, awards, and calculated points. Errors must be corrected before applying.
4. Select **Apply preview to draft**. You can still use the manual result editor afterward, then **Publish website** when ready.

Use Roblox usernames, unique current display names, or saved CSV names from the selected division’s permanent roster. The confirmed names supplied for Haydon/Nurtec, Regan/Rocky, Hailey/Wispy, and the other known drivers are included. Haydon and Muffin are registered for D1, including when they have no team entry. Existing saved display names, team assignments, artwork, and car numbers are preserved when upgrading published data or browser drafts. Blank qualifying/stage positions mean no classification was entered; awards require **Yes** or **No**. Quote names containing commas (`"Driver, Jr."`).

The normal flow is **choose race → paste CSV → Preview CSV → Apply preview to draft → Review & publish**. **Manual corrections** remains available when needed; entering the CSV does not require visiting the qualifying, stage, finish-order, or awards builders.

An import replaces that race’s qualifying, stages, finish order, and Fastest lap/Most laps led awards. It keeps manually corrected car numbers and driver points eligibility. This CSV format has no DNF/DNQ column, so apply those statuses in the manual editor afterward. Existing practice awards are kept only for participants still in the finish order.

## Import or correct standings

Open **Standings**, choose the division, and expand **Import standings from CSV**:

```csv
Position,+/-,Driver#,DriverName,Points
1,+1,019,DriverUsername,150
2,-1,020,OtherUsername,140
```

Select **Preview CSV**, check the full points table, then **Apply preview to draft**. The CSV box is open by default. In D1 and Open Series, matching names, usernames, and saved aliases use the known driver identity. A former or unlisted driver can be imported using the supplied name or username without a driver profile or roster entry. This adds a standings total only; it does not register the person or assign them to a team. Same-name matches that identify several people need a username or a unique number in that series. D2 continues to use its archived entrants.

Choose **Edit preview** to change positions, movement, numbers, display names, or points before applying. Matched rows keep their driver identity when their display name changes. **Check preview** recalculates the table; **Apply preview to draft** also validates the latest edits. Preview edits do not change the saved driver profile or draft until applied. On mobile, each editable row groups the five fields together.

Positions must agree with the points order. Leading zeros in car numbers are preserved; a blank Driver# uses the known number from the selected series, or stays blank. A number can also be cleared explicitly in the preview editor. Use `-` for unknown movement; otherwise enter a signed position change or `0`. Drivers omitted from an import and other divisions keep their totals.

For an individual correction, change their **Points** in the standings table and select **Save**. **Use race points** removes that driver’s points correction. Imported or manually corrected totals are stored as adjustments to the current race points: if a driver is set to 150 and earns 45 in the next race, their total becomes 195. Correcting or deleting a race also updates the total. Imported position changes use the previous positions supplied in that CSV; without an import, movement compares the two latest race totals.

Both imports are previewed before they change the draft, and applying an import is one **Undo** action. Editing the CSV or changing the draft requires a fresh preview. CSV text and previews are temporary; applied data is saved in the browser draft and reaches the public site when published. The standings tables show **Position, Change, Driver#, DriverName, Points**. Change shows a green ▲ with the positions gained, a red ▼ with the positions lost, or a dash for no change. CSV input still uses the `+/-` header and signed numbers. Muffin’s confirmed roster number is 2; the update applies to existing saved data and drafts without changing older race classifications.

## Recovery

- **Download backup** exports the complete website dataset as JSON.
- **Import backup** loads a backup into an unpublished draft for Owners and Admins.
- **Reload published** discards the current draft after confirmation.
- The original `data/uarl.json` remains the safe fallback until the first live publish.
