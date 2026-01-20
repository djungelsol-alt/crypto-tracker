export default async function handler(req, res) {
  const { wallet } = req.query;
  const key = process.env.HELIUS_API_KEY;
  
  if (!wallet) return res.status(400).json({ error: 'Need wallet' });
  if (!key) return res.status(500).json({ error: 'No API key' });

  try {
    const r = await fetch(`https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${key}&limit=50`);
    const txs = await r.json();
    
    const trades = [];
    const tokens = {};
    
    for (const tx of txs) {
      if (tx.meta?.err) continue;
      const pre = tx.meta?.preTokenBalances || [];
      const post = tx.meta?.postTokenBalances || [];
      const changes = [];
      
      for (const p of post) {
        if (p.owner !== wallet) continue;
        const preAmt = pre.find(x => x.accountIndex === p.accountIndex && x.mint === p.mint);
        const diff = parseFloat(p.uiTokenAmount?.uiAmountString || 0) - parseFloat(preAmt?.uiTokenAmount?.uiAmountString || 0);
        if (Math.abs(diff) > 0.000001) changes.push({ mint: p.mint, change: diff });
      }
      
      if (changes.length < 2) continue;
      const sold = changes.find(c => c.change < 0);
      const bought = changes.find(c => c.change > 0);
      if (!sold || !bought) continue;
      
      const mint = bought.mint;
      if (!tokens[mint]) tokens[mint] = { buys: [], sells: [] };
      
      const data = {
        sig: tx.signature,
        date: new Date(tx.timestamp * 1000).toISOString().split('T')[0],
        ts: tx.timestamp * 1000,
        mint,
        amt: Math.abs(bought.change > 0 ? bought.change : sold.change),
        val: Math.abs(sold.change) * 100
      };
      
      if (bought.change > 0) tokens[mint].buys.push(data);
      else tokens[mint].sells.push(data);
    }
    
    for (const [mint, pairs] of Object.entries(tokens)) {
      const buys = pairs.buys.sort((a, b) => a.ts - b.ts);
      const sells = pairs.sells.sort((a, b) => a.ts - b.ts);
      for (let i = 0; i < Math.min(buys.length, sells.length); i++) {
        trades.push({ buy: buys[i], sell: sells[i], mint });
      }
    }
    
    res.json({ ok: true, trades });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
