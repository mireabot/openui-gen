# Player images in API datasets

The backend resolves player portraits through FotMob and includes them in the existing sports dataset response. Clients continue to load `POST /tools/sports_dataset` with a run ID. The stream's `data` event contains the same saved dataset.

A resolved player appears in the top-level `players` array:

```json
{
  "fotmobId": 1096353,
  "name": "Cole Palmer",
  "team": "Chelsea",
  "position": "Attacking Midfielder",
  "imageUrl": "https://images.fotmob.com/image_resources/playerimages/1096353.png"
}
```

Matching named player objects inside answers also receive `fotmobId` and `imageUrl`. Their `logo` field uses the same portrait URL, so existing StatsCard and Leaderboard templates pass it to Avatar. The server applies this join after dataset shaping. A model that omits the image or supplies a guessed URL cannot replace the verified portrait.

## Identity resolution

`src/sports/fotmob.ts` searches `https://apigw.fotmob.com/searchapi/suggest` and verifies the selected player through `https://www.fotmob.com/api/data/playerData`. A full normalized name must match. Club context disambiguates names when available. Coaches, ambiguous matches, and inconsistent profile IDs produce no portrait.

The portrait URL uses the verified FotMob ID. ESPN IDs are never substituted. The profile response does not contain an image URL field.

Player prompts and explicit ESPN player lists resolve before dataset shaping. Named StatsCard and Leaderboard records can resolve afterward. Generic web table labels are not automatically treated as players. The verified player directory survives fallback to raw answer data.

## Failure and follow-up behavior

Image lookup is optional. Known player records that cannot resolve use `fotmobId: null`, `imageUrl: ""`, and `logo: ""`. The clients retain their initials fallback. A component entry that has not been identified as a player retains its existing imagery, including club crests. If no profiles resolve, the dataset omits the top-level `players` array.

The resolver allows up to twenty new identities per generation, in batches of four. A shared five-second budget covers image resolution across both shaping phases. The model call between phases does not consume that budget. Late responses can warm the provider cache but cannot alter an already returned dataset.

Successful lookups cache for one day. Missing or ambiguous identities cache for five minutes. Transient request failures are not cached as missing players. The provider cache holds at most one thousand entries and shares concurrent requests for the same name and club.

Follow-ups preserve saved player order and reuse known profiles. Kept answers retain their original portrait data.

## Verification

Run `npm run check:players` for offline identity, cache, failure, deadline, field metadata, API response, Avatar binding, and follow-up checks. The check uses the actual Hono route and snapshot store with scripted external transports. `npm run check:all` includes it.

A live request through the backend adapter verified Cole Palmer's ID, club, position, and image URL shown above. The image endpoint returned a 192-by-192 PNG.
