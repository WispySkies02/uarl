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

If a substitute or one-off driver raced but is missing from the series dropdown, add them under **Event-only / guest drivers** inside that result. Enter their car number and name once, then use the normal dropdowns everywhere else. This does not add them to the permanent series roster.

Always include the Roblox username for a roster or event-only driver when it is known. Race Control uses that username as the permanent identity, so future display-name changes and older aliases continue contributing to the same standings row. Older results without a username are matched safely by display name, with car number used only when identity text is missing.

Sessions remain active for up to 12 hours. **Sign out** ends the current session immediately.

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

Use Roblox usernames or unique names from the selected division’s roster. Add substitutes under **Guests** before importing. Blank qualifying/stage positions mean no classification was entered; awards require **Yes** or **No**. Quote names containing commas (`"Driver, Jr."`).

An import replaces that race’s qualifying, stages, finish order, and Fastest lap/Most laps led awards. It keeps manually corrected car numbers and driver points eligibility. This CSV format has no DNF/DNQ column, so apply those statuses in the manual editor afterward. Existing practice awards are kept only for participants still in the finish order.

## Import or correct standings

Open **Standings**, choose the division, and expand **Import standings from CSV**:

```csv
Position,+/-,Driver#,DriverName,Points
1,+1,019,DriverUsername,150
2,-1,020,OtherUsername,140
```

Select **Preview CSV**, check the full points table, then **Apply preview to draft**. Positions must agree with the points order, and driver names must match roster or recorded race participants. For same-name drivers, use their matching car numbers or usernames. Leading zeros in car numbers are preserved. Use `-` for unknown movement; otherwise enter a signed position change or `0`. Drivers omitted from an import and other divisions keep their totals.

For an individual correction, change their **Points** in the standings table and select **Save**. **Use race points** removes that driver’s points correction. Imported or manually corrected totals are stored as adjustments to the current race points: if a driver is set to 150 and earns 45 in the next race, their total becomes 195. Correcting or deleting a race also updates the total. Imported position changes use the previous positions supplied in that CSV; without an import, movement compares the two latest race totals.

Both imports are previewed before they change the draft, and applying an import is one **Undo** action. Editing the CSV or changing the draft requires a fresh preview. CSV text and previews are temporary; applied data is saved in the browser draft and reaches the public site when published. The public standings table shows only **Position, +/-, Driver#, DriverName, Points**.

## Recovery

- **Download backup** exports the complete website dataset as JSON.
- **Import backup** loads a backup into an unpublished draft for Owners and Admins.
- **Reload published** discards the current draft after confirmation.
- The original `data/uarl.json` remains the safe fallback until the first live publish.
