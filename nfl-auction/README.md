# NFL Auction Draft

A standalone two-player game at `/nfl-auction/`. It is separate from the PAM app and shares only the server.

Spin a wheel of all 32 teams and take turns opening the bidding for that team's pick. The winner
then chooses any player on that team who fits their lineup. Fill QB · RB · 3 WR · TE · OL · K · DST with $22. Then the two lineups play a head-to-head game,
a 17-game season against the real league, and the playoffs.

## Files

- `data.mjs`: team metadata, logos, and both roster pools (`CURRENT`, `ALLTIME`).
- `engine.mjs`: rules, seeded randomness, game/season/playoff simulation, Elo-style legacy rating. Pure, so it runs in Node tests.
- `net.mjs`: online play over PeerJS (WebRTC). `?transport=bc` swaps in BroadcastChannel so two tabs on one machine can play (used for testing).
- `app.mjs`: UI and game flow.
- `share.mjs`: the 1080×1350 results graphic.
- `og.jpg`: link-preview image for challenge links.
- Tests: `tests/nfl-auction.test.mjs`.

## How online play works

The challenger's browser hosts the game. It runs the rules and sends the starting setup plus the
list of moves. The guest's browser rebuilds the game from those moves with the same engine instead of
trusting the host's copy, so both sides enforce the rules and get identical results from the shared seed.
There is no game server and no database. The host has to keep the page open.

Legacy ratings live in each player's browser (localStorage). That's fine for friends, but it is not
tamper-proof. A shared leaderboard would need a server-side table.

## Updating rosters

Edit `CURRENT` in `data.mjs`. Each position is a list of `[name, ovr]`; OL and DST are units:
`[unitName, ovr, "Notable · Players"]`. Every team needs at least one QB, RB, TE, OL, K, DST and three WRs
(the tests check this). OVR values are this game's own estimates on a 0–99 scale, not an official ratings source.

`CURRENT` reflects the 2026 season as researched in late November 2026, after the Nov. 10 trade deadline.
Starters ruled out for the season are left off. Where a starting QB job is contested, both QBs are listed.
Rosters change weekly, so refresh this before sharing widely.

## Logos

Team logos load from ESPN's CDN. If one fails, a colored team badge is shown instead.
NFL logos are trademarks: fine for a game among friends, but get permission before any commercial use.
