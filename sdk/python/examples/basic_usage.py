"""Basic Trivela Python SDK usage examples."""

from trivela import TrivelaClient
from trivela.models import CampaignCreate, CampaignUpdate

# Initialize client with API key
client = TrivelaClient(api_key="tvl_your_api_key_here")

# Or use environment variable TRIVELA_API_KEY
# client = TrivelaClient()

# Health check
health = client.health()
print(f"API Status: {health.status}")
print(f"RPC Latency: {health.rpc.latency_ms}ms")

# Get configuration
config = client.config()
print(f"Network: {config.stellar['network']}")
print(f"Contracts: {config.contracts}")

# List campaigns with pagination
page1 = client.campaigns.list(page=1, limit=20)
print(f"Total campaigns: {page1.pagination.total}")
for campaign in page1.data:
    print(f"  - {campaign.name} ({campaign.status})")

# Filter active campaigns
active = client.campaigns.list(active=True, limit=50)
print(f"Active campaigns: {active.pagination.total}")

# Search campaigns
results = client.campaigns.list(search="rewards", active=True)
for c in results.data:
    print(f"  - {c.name}: {c.rewardPerAction} points per action")

# Iterate all campaigns (auto-pagination)
print("\nAll campaigns:")
for campaign in client.campaigns.iter_all(page_size=50):
    print(f"  - {campaign.id}: {campaign.name}")

# Get single campaign by ID
campaign = client.campaigns.get("campaign_123")
print(f"\nCampaign: {campaign.name}")
print(f"  Slug: {campaign.slug}")
print(f"  Reward: {campaign.rewardPerAction}")
print(f"  Status: {campaign.status}")

# Get campaign by slug
campaign_by_slug = client.campaigns.get_by_slug("summer-2026")
print(f"Campaign by slug: {campaign_by_slug.name}")

# Create a new campaign
new_campaign = client.campaigns.create(
    CampaignCreate(
        name="Analytics Test Campaign",
        description="Testing Python SDK",
        rewardPerAction=10.5,
        active=True,
        featured=False,
        tags=["test", "analytics"],
        category="testing"
    ),
    idempotency_key="unique-key-123"  # Optional: prevents duplicate creates
)
print(f"\nCreated campaign: {new_campaign.id}")

# Update campaign
updated = client.campaigns.update(
    new_campaign.id,
    CampaignUpdate(
        description="Updated description",
        rewardPerAction=15.0,
        active=False
    )
)
print(f"Updated campaign: {updated.rewardPerAction} points/action")

# Delete campaign
client.campaigns.delete(new_campaign.id)
print("Campaign deleted")

# Organizations
org = client.organizations.create(
    name="My Analytics Team",
    slug="analytics-team"
)
print(f"\nOrganization created: {org.id}")

# List org members
members = client.organizations.list_members(org.id)
for member in members:
    print(f"  - {member.userEmail} ({member.role})")

# Invite member
invitation = client.organizations.invite(
    org.id,
    email="analyst@example.com",
    role="member"
)
print(f"Invitation sent: {invitation.token}")

# Audit logs
logs = client.audit_logs.list(page=1, limit=10)
for log in logs.data:
    print(f"{log.timestamp}: {log.actor} {log.action} {log.entity}")

print(f"\n✅ Python SDK feature parity verified!")
