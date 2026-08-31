# trivela Python SDK

Official Python SDK for the [Trivela](https://github.com/FinesseStudioLab/Trivela) REST API.

Ideal for data teams, analytics workflows, and backend Python integrations.

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

## Features

### Full API Coverage

- ✅ Campaigns (CRUD, search, pagination)
- ✅ Organizations & team management
- ✅ Audit logs
- ✅ Admin operations (API keys, configuration)
- ✅ Health & monitoring endpoints

### Data-Friendly

- **Auto-pagination**: `iter_all()` automatically pages through large datasets
- **Type hints**: Full typing support for IDE autocomplete and type checking
- **Filtering**: Search, filter by status/category, and query campaigns efficiently
- **Export-ready**: Easy integration with pandas, CSV, JSON workflows

### Enterprise-Ready

- **Idempotency**: Prevent duplicate operations with idempotency keys
- **Rate limiting**: Built-in retry logic and backoff
- **Bearer tokens**: SEP-10 Stellar authentication support
- **Environment config**: Automatic `TRIVELA_API_KEY` detection

## Auth

Set `TRIVELA_API_KEY` in your environment or pass `api_key=` to `TrivelaClient`.

For SEP-10 bearer token auth, pass `bearer_token=` or call `client.set_bearer_token(token)` after
authentication.

## Examples

### Data Analytics

```python
# Export all campaigns to CSV
import csv

campaigns = list(client.campaigns.iter_all())
with open('campaigns.csv', 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['id', 'name', 'rewardPerAction', 'status'])
    writer.writeheader()
    for c in campaigns:
        writer.writerow({
            'id': c.id,
            'name': c.name,
            'rewardPerAction': c.rewardPerAction,
            'status': c.status
        })
```

### Monitoring & Alerts

```python
# Find campaigns with high rewards
high_value = [
    c for c in client.campaigns.iter_all()
    if c.rewardPerAction > 100 and c.active
]

for campaign in high_value:
    print(f"⚠️  High-value campaign: {campaign.name} ({campaign.rewardPerAction} pts)")
```

### Integration with pandas

```python
import pandas as pd

campaigns = list(client.campaigns.iter_all())
df = pd.DataFrame([c.__dict__ for c in campaigns])

# Analyze reward distribution
print(df['rewardPerAction'].describe())

# Group by category
print(df.groupby('category')['rewardPerAction'].mean())
```

See `examples/` directory for more complete examples including:

- `basic_usage.py`: Full API surface area demo
- `data_analytics.py`: Analytics workflows, CSV export, reporting

## Feature Parity with TypeScript SDK

The Python SDK provides feature parity with the TypeScript SDK:

| Feature          | Python | TypeScript             |
| ---------------- | ------ | ---------------------- |
| Campaign CRUD    | ✅     | ✅                     |
| Auto-pagination  | ✅     | ✅                     |
| Organizations    | ✅     | ✅                     |
| Audit logs       | ✅     | ✅                     |
| Admin operations | ✅     | ✅                     |
| Bearer auth      | ✅     | ✅                     |
| Idempotency      | ✅     | ✅                     |
| Type hints       | ✅     | ✅ (TypeScript native) |

## Development

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

## Publishing

The SDK is published to PyPI via GitHub Actions on tagged releases:

```bash
git tag python-sdk-v0.2.0
git push origin python-sdk-v0.2.0
```

CI will automatically:

1. Run tests on Python 3.9, 3.11, 3.12
2. Build distribution packages
3. Publish to PyPI using trusted publishing (OIDC)

## License

Apache-2.0
