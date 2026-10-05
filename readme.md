UARL NETLIFY EDITION 19
========================

Interactive paddock build.

Drivers page
------------
- Rebuilt as a full interactive paddock with Team HQ, D1 Drivers, Free Agents, and Open Series views.
- Search and manufacturer filtering work across the active view.
- Team cards open detailed garage panels with owner, manufacturer, lineup, open seats, and special entries.
- Driver cards open career-profile panels.
- Confirmed team owners:
  - Dakota Sullivan Racing — Dale
  - XDrive Motorsports — John
  - Avery Motorsports — Payson (UARL league owner)
  - Goat Whitlock Motorsports — James
  - Goforth Motorsports — Cody
  - Aetherwing eMotorsports — Wispy

Latest D1 signings
------------------
- Taylor -> Goat Whitlock Motorsports #48
- BurgerTown2Good -> Aetherwing eMotorsports #32
- Frog -> Avery Motorsports #73
- Gk3r -> Aetherwing eMotorsports, number TBD (not invented)

D1 free agents remaining
------------------------
FueledByMayo, Nick, Jay, Jeremy, Muffin.

D2 remains discontinued; its Daytona opener is preserved in Race Center. The one-week-shifted D1 schedule and unchanged Open Series calendar from Edition 18 remain intact.

Deploy
------
Ready for Netlify drag-and-drop or repository deployment. index.html is at the ZIP root.


Edition 21 updates
------------------
- Full-site build based on Edition 19
- Aetherwing official logo + red/white Team HQ styling
- Aetherwing founded Season 3
- Aetherwing team description updated to supplied copy
- Aetherwing number images integrated from Aetherwing_Numbers.zip
- Recent signing badges automatically become SIGNED after 3 days
- Dakota Sullivan Racing: Max #19 and Opt #91 added


Edition 23 fix: restored the Drivers page render pipeline so Team HQ, D1 Drivers, Free Agents, and Open Series populate again.


Edition 24
----------
- Equalized Aetherwing number artwork footprints across team/driver UI.
- Mobile Team HQ close control is sticky and labeled CLOSE ×.
- Added an inline Close Team HQ button at the bottom of team details.


Edition 25
----------
Replaced Aetherwing number artwork with the standardized 1280x1280 transparent PNG set for #28, #32, #54, #62, #82, and #92. Removed stretch-to-fit sizing and now renders each number in equal square art slots.

Edition 26 adds direct team deep links and /embed/team/?team=<id> roster embeds. Aetherwing includes official logo, colors, standardized number art including #52, and the corrected six-charter structure.


Edition 28
----------
- Share Team links now use /team/<id>/ static pages with Discord Open Graph preview images.
- Aetherwing #62 PT and #82 Development are visually grouped as one shared sixth charter.
- Team HQ share button copies Discord-ready URL.


## Edition 28
- Team HQ no longer repeats share/preview controls inside the open modal.
- Team-card Share Team remains the single copy-link control.
- Rebuilt 1200×630 Discord/Open Graph roster images with safe margins, padded cards, and clearer text hierarchy.
- Aetherwing preview keeps #62 PT / #82 Development visibly grouped as one shared sixth charter.


## Edition 29 — UARL Race Control

- Added a detailed, mobile-ready `/admin/` control center.
- Schedule, results, teams/charters, profiles, Open entries, free agents, transactions, paints, history, and guide content are editable in separate sections.
- Browser drafts autosave and can be previewed without affecting visitors.
- A session-based Admin login protects publishing; only `UARL_ADMIN_KEY` is required in Netlify.
- Publishing writes directly to persistent Netlify site storage, so no GitHub repository or new deployment is needed for content changes.
- Public schedule/countdown, homepage next-event card, Race Center, Drivers, Paint Booth, and History use the canonical runtime data.
- Schedule events include one-click `Shift 1 week` controls.
- Paint records include an `SCR Affiliate` option and the public Paint Booth renders the tag when enabled.
- See `ADMIN-SETUP.md` for the one-time Netlify configuration.

## Edition 31 — Personal staff accounts

- Replaced the universal Admin password with individual usernames and passwords.
- Added Owner, Admin, and Race Control roles with server-enforced permissions.
- Added staff account creation, password resets, account disabling, and recent activity history.
- Every live publish records the staff member responsible for the update.
- The first Owner account is created securely from `/admin/` using the one-time Netlify setup key.

## Edition 32 — Visual roster and result builders

- Replaced the normal JSON workflow for team entries, charters, qualifying, finishes, stages, bonuses, paint tags, and history records.
- Added driver dropdown suggestions, dedicated car-number and position fields, status/seat/charter selectors, points eligibility checkboxes, and add/remove row controls.
- Nested stages and historical seasons can be managed visually while preserving the exact public-site data format.
- Advanced JSON remains available as a power-user fallback for uncommon fields.

## Edition 33 — Series-locked Results drivers

- Winner, pole winner, qualifying, stages, finishing order, and bonus recipients now use driver dropdowns instead of free-typed names.
- Each dropdown is restricted to the selected result division: D1, archived D2, or Open.
- Selecting a driver automatically fills the verified car number.
- Drivers already present in official historical results remain available for corrections even if they are no longer active.

## Edition 34 — Automatic points and number sorting

- Results automatically calculate the universal UARL finishing table, stage points, pole bonus, most-laps-led bonus, fastest-lap bonus, and fastest-recorded-practice bonus.
- Finish rows include points eligibility and Finish/DNF/DNQ status; exhibitions and ineligible drivers automatically receive zero championship points.
- Total points are read-only and update as qualifying, stages, finishes, bonuses, or eligibility change.
- The public Drivers page sorts D1 and Open Series drivers numerically by car number, even when a new Admin entry was appended later.

## Edition 35 — Event-only and guest drivers

- Added an Event-only / guest drivers builder to every result record.
- A verified substitute or one-off entrant can be entered once with their name, number, optional Roblox username, and points eligibility.
- That driver then appears in the result's winner, pole, qualifying, stage, finish, and bonus dropdowns.
- Event-only drivers remain attached to that race and do not alter the permanent D1 or Open Series roster.

## Edition 36 — Canonical driver identities

- Roblox usernames are now the permanent identity used to combine standings records; display names remain presentation labels.
- Results recorded under a username or current display name resolve to the same driver; car number is used only as a safe fallback when identity text is missing.
- Event-only drivers receive stable race identities and can no longer appear as `undefined` in the standings.
- Race wins, top fives, top tens, starts, and average finish now read the Admin result-position field correctly.
- Older published result records are normalized automatically when the public site loads.

## Edition 37 — Identity and stage-points fix

- Results now warn when Hayden, Max, or any other participant is missing a canonical Roblox username.
- Event-only drivers require a Roblox username so one-off entries cannot silently split standings records.
- Adding a username to a roster or event-only entry automatically attaches it to qualifying, stages, finishes, bonuses, pole, and winner fields on recalculation.
- Publishing recalculates every race record instead of only the result currently open in Admin.
- Each finishing row shows its automatic stage-points subtotal separately from its total points.

## Edition 38 — Official race-results redesign

- Rebuilt the public result record so the official finish is the main full-width table.
- Qualifying and stages now appear in compact session cards sized to their content.
- Every classification is automatically sorted by position, including stage results entered out of order.
- The finish table displays race points, stage points, bonuses, and total points separately.
- Points eligibility is assumed by default; only exceptions receive a `NO POINTS` badge.
- Added cleaner event metadata and responsive horizontal scrolling for detailed mobile results.

## Edition 39 — Standings Roblox usernames

- Points standings show the canonical Roblox username in small blue text beneath each driver's display name.
- Team names remain visible on a separate line for quick identification.
- Internal guest identity keys stay hidden until an actual Roblox username is entered.
