export default function DevNetworkSwitcher({ network = 'testnet', onChange }) {
  if (!import.meta.env.DEV) return null;
  if (typeof onChange !== 'function') return null;

  const handleChange = (event) => {
    const nextNetwork = event.target.value;
    if (!nextNetwork || nextNetwork === network) return;

    if (nextNetwork === 'mainnet') {
      const ok = window.confirm(
        'Switch Stellar network to mainnet?\n\nThis can broadcast real transactions. Continue?',
      );
      if (!ok) {
        event.target.value = network;
        return;
      }
    }

    onChange(nextNetwork);
  };

  return (
    <label className="dev-network-switcher">
      <span className="dev-network-switcher-label">Dev network</span>
      <select className="dev-network-switcher-select" value={network} onChange={handleChange}>
        <option value="testnet">testnet</option>
        <option value="mainnet">mainnet</option>
      </select>
    </label>
  );
}
