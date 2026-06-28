# trivela Python SDK

Official Python SDK for the [Trivela](https://github.com/FinesseStudioLab/Trivela) REST API.

## Install

```bash
pip install trivela
```

## Quick start

```python
from trivela import TrivelaClient

client = TrivelaClient(api_key="tvl_...")

# List campaigns (paginated)
result = client.campaigns.list(page=1, limit=20)
for c in result.data:
    print(c.name, c.status)

# Iterate all campaigns across all pages
for c in client.campaigns.iter_all(active=True):
    print(c.id, c.rewardPerAction)

# Create a campaign
from trivela.models import CampaignCreate
new = client.campaigns.create(CampaignCreate(name="My Campaign", rewardPerAction=10))
print(new.id)

# Health check
h = client.health()
print(h.status)
```

## Auth

Set `TRIVELA_API_KEY` in your environment or pass `api_key=` to `TrivelaClient`.

For SEP-10 bearer token auth, pass `bearer_token=` or call `client.set_bearer_token(token)` after authentication.

## Development

```bash
pip install -e ".[dev]"
pytest tests/
```
