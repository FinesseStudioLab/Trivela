export default function CampaignList({ campaigns = [] }) {
  if (campaigns.length === 0) {
    return <p className="campaign-list-empty">No campaigns found.</p>;
  }

  return (
    <ul className="campaign-list">
      {campaigns.map((campaign) => (
        <li key={campaign.id} className="campaign-list-item">
          {campaign.title}
        </li>
      ))}
    </ul>
  );
}
