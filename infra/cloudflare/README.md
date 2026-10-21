# Cloudflare cache rules

`cache-rules.json` is the Cloudflare Rulesets payload for the zone's `http_request_cache_settings`
phase (issue #1345):

| Path                             | Behaviour                                   |
| -------------------------------- | ------------------------------------------- |
| `/assets/*`                      | Cached 1 year (content-hashed build files)  |
| `/uploads/*`                     | Edge 1 day, browser 1 hour (campaign media) |
| `/api/*`, `/health*`, `/metrics` | Bypass cache                                |

## Apply

Requires an API token with the _Zone → Cache Rules → Edit_ permission.

```sh
curl -X PUT "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/http_request_cache_settings/entrypoint" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data @infra/cloudflare/cache-rules.json
```

The PUT replaces the zone's entrypoint ruleset for that phase, so keep this file as the source of
truth.
