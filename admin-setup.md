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
- **Race Control:** schedule and results editing/publishing only.

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

## Recovery

- **Download backup** exports the complete website dataset as JSON.
- **Import backup** loads a backup into an unpublished draft for Owners and Admins.
- **Reload published** discards the current draft after confirmation.
- The original `data/uarl.json` remains the safe fallback until the first live publish.
