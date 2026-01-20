import { useState } from 'react';
import Head from 'next/head';

export default function App() {
  const [step, setStep] = useState(1);
  const [start, setStart] = useState('');
  const [salary, setSalary] = useState('');
  const [wallet, setWallet] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [days, setDays] = useState(Array(365).fill(null).map(() => ({ p: 0, h: 0, t: [] })));
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState('day');
  const [hours, setHours] = useState('');
  const [alert, setAlert] = useState(false);
  const [amount, setAmount] = useState(0);
  const [trade, setTrade] = useState({ entry: '', exit: '', max: '', min: '', size: '', date: '' });

  const sync = async () => {
    if (!wallet) { setStatus('Enter wallet'); return; }
    setSyncing(true);
    setStatus('Syncing...');
    try {
      const r = await fetch(`/api/sync?wallet=${wallet}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (!d.trades?.length) { setStatus('No trades'); setSyncing(false); return; }
      
      const newDays = [...days];
      let n = 0;
      for (const tr of d.trades) {
        const sellDate = new Date(tr.sell.ts);
        const startDate = new Date(start);
        const idx = Math.floor((sellDate - startDate) / 86400000);
        if (idx < 0 || idx >= 365) continue;
        
        const e = tr.buy.val / (tr.buy.amt || 1);
        const x = tr.sell.val / (tr.sell.amt || 1);
        const s = tr.buy.val;
        const max = Math.max(e, x) * 1.2;
        const min = Math.min(e, x) * 0.8;
        const ap = ((x - e) / e) * s;
        const pp = ((max - e) / e) * s;
        const mp = max > x ? ((max - x) / x) * s : 0;
        const mpc = max > x ? ((max - x) / x) * 100 : 0;
        const app = ((x - e) / e) * 100;
        const ppp = ((max - e) / e) * 100;
        const md = ((min - e) / e) * 100;
        const wep = max > e;
        const rt = ap < 0 && wep;
        const se = ap > 0 && x < max && mpc > 10;
        
        newDays[idx].t.push({
          id: Date.now() + n,
          date: tr.sell.date,
          entry: e,
          exit: x,
          maxPrice: max,
          minPrice: min,
          positionSize: s,
          actualProfit: ap,
          potentialProfit: pp,
          missedProfit: mp,
          missedPercent: mpc,
          actualProfitPercent: app,
          potentialProfitPercent: ppp,
          maxDrawdown: md,
          wasEverProfitable: wep,
          tokenSymbol: tr.mint.substring(0, 4) + '...',
          signature: tr.sell.sig.substring(0, 8) + '...',
          roundtripped: rt,
          savedByEarlyExit: se
        });
        newDays[idx].p = newDays[idx].t.reduce((s, t) => s + t.actualProfit, 0);
        n++;
      }
      setDays(newDays);
      setStatus(`✅ Imported ${n} trades!`);
    } catch (e) {
      setStatus(`❌ ${e.message}`);
    }
    setSyncing(false);
  };

  const add = () => {
    if (!trade.entry || !trade.exit || !trade.max || !trade.min || !trade.size || edit === null) return;
    const e = parseFloat(trade.entry);
    const x = parseFloat(trade.exit);
    const max = parseFloat(trade.max);
    const min = parseFloat(trade.min);
    const s = parseFloat(trade.size);
    const ap = (x - e) * s;
    const pp = (max - e) * s;
    const mp = max > x ? (max - x) * s : 0;
    const mpc = max > x ? ((max - x) / x) * 100 : 0;
    const app = ((x - e) / e) * 100;
    const ppp = ((max - e) / e) * 100;
    const md = ((min - e) / e) * 100;
    const wep = max > e;
    const rt = ap < 0 && wep;
    const se = ap > 0 && x < max;
    
    const newDays = [...days];
    newDays[edit].t.push({
      id: Date.now(),
      date: trade.date || new Date().toISOString().split('T')[0],
      entry: e,
      exit: x,
      maxPrice: max,
      minPrice: min,
      positionSize: s,
      actualProfit: ap,
      potentialProfit: pp,
      missedProfit: mp,
      missedPercent: mpc,
      actualProfitPercent: app,
      potentialProfitPercent: ppp,
      maxDrawdown: md,
      wasEverProfitable: wep,
      roundtripped: rt,
      savedByEarlyExit: se
    });
    newDays[edit].p = newDays[edit].t.reduce((s, t) => s + t.actualProfit, 0);
    setDays(newDays);
    setTrade({ entry: '', exit: '', max: '', min: '', size: '', date: '' });
    if (newDays[edit].p > 1000) { setAmount(newDays[edit].p); setAlert(true); }
  };

  const del = (idx, id) => {
    const newDays = [...days];
    newDays[idx].t = newDays[idx].t.filter(t => t.id !== id);
    newDays[idx].p = newDays[idx].t.reduce((s, t) => s + t.actualProfit, 0);
    setDays(newDays);
  };

  const calc = () => {
    const all = days.flatMap(d => d.t);
    if (!all.length) return null;
    const tap = all.reduce((s, t) => s + t.actualProfit, 0);
    const tpp = all.reduce((s, t) => s + t.potentialProfit, 0);
    const tmp = all.reduce((s, t) => s + t.missedProfit, 0);
    const aap = all.reduce((s, t) => s + t.actualProfitPercent, 0) / all.length;
    const app = all.reduce((s, t) => s + t.potentialProfitPercent, 0) / all.length;
    const otp = app * 0.85;
    const losing = all.filter(t => t.actualProfit < 0);
    const amd = losing.length ? losing.reduce((s, t) => s + Math.abs(t.maxDrawdown), 0) / losing.length : 0;
    const rsl = Math.min(amd * 0.5, 15);
    const pasp = all.filter(t => t.wasEverProfitable).length;
    const hr = (pasp / all.length) * 100;
    return { tap, tpp, tmp, aap, app, otp, tt: all.length, mpp: tpp ? (tmp / tpp) * 100 : 0, amd, rsl, hr, pasp };
  };

  const stats = () => {
    const tp = days.reduce((s, d) => s + d.p, 0);
    const th = days.reduce((s, d) => s + d.h, 0);
    const pd = days.filter(d => d.p > 0).length;
    const ld = days.filter(d => d.p < 0).length;
    const adp = tp / 365;
    const ehr = th > 0 ? tp / th : 0;
    const oyi = parseFloat(salary) * 40 * 52;
    const d1k = days.filter(d => d.p > 1000).length;
    const dw = days.filter(d => d.h > 0).length;
    const ahpd = dw > 0 ? th / dw : 0;
    const hpdp = Math.max(8, ahpd);
    const tap = ehr * hpdp * 365;
    const pn = oyi - tp;
    const deacr = ehr * hpdp;
    const dtsoj = deacr > 0 ? Math.ceil(pn / deacr) : Infinity;
    return { tp, th, pd, ld, adp, ehr, oyi, d1k, tap, hpdp, dtsoj, dw };
  };

  const quote = (s) => {
    if (s.adp > 1000) return { q: "You're making over $1,000 per day. Let that sink in.", s: "Most people work a full week to make what you're averaging daily." };
    if (s.pd > s.ld) return { q: "It's not a race. You're profitable, and that means you're on track.", s: "More winning days than losing days." };
    if (s.tp > 0) return { q: "Progress isn't linear. You're still net positive.", s: "Every profitable trader has rough patches." };
    return { q: "This is part of the journey. Every master was once a beginner.", s: "Focus on learning and protecting capital." };
  };

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const s = stats();
  const q = quote(s);
  const o = calc();
  const sc = ((s.ehr / parseFloat(salary)) * 100 - 100).toFixed(1);

  return (<>
    <Head><title>Crypto Tracker</title></Head>
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6 pt-16 pb-24">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Crypto Trading Journey</h1>
        <p className="text-gray-600 mb-8">Track your progress</p>
        {step === 1 ? (
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-6 text-gray-800">Get Started</h2>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-2">Start date</label><input type="date" className="w-full p-3 border rounded-md" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-2">Old hourly salary ($)</label><input type="number" className="w-full p-3 border rounded-md" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g., 25" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-2">Solana Wallet (Optional)</label><input type="text" className="w-full p-3 border rounded-md text-sm" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Your wallet address" /></div>
              <button onClick={() => start && salary && setStep(2)} className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-semibold" disabled={!start || !salary}>Start</button>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white p-6 rounded-lg shadow-md mb-6">
              <h2 className="text-lg font-semibold mb-4">🔗 Sync</h2>
              <div className="flex gap-3">
                <input type="text" className="flex-1 p-3 border rounded-md text-sm" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Wallet address" />
                <button onClick={sync} disabled={syncing || !wallet} className={`px-6 py-3 rounded-md font-semibold ${syncing ? 'bg-gray-400' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}>{syncing ? 'Syncing...' : 'Sync'}</button>
              </div>
              {status && <div className={`mt-3 p-3 rounded text-sm ${status.includes('❌') ? 'bg-red-50 text-red-700' : status.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>{status}</div>}
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-6">365-Day Grid</h2>
              <div className="flex flex-col gap-1">
                {[...Array(5)].map((_, r) => (<div key={r} className="flex justify-center">{[...Array(73)].map((_, c) => {
                  const i = r * 73 + c;
                  if (i >= 365) return null;
                  const d = days[i];
                  let cl = "w-2 h-2 m-0.5 rounded-sm cursor-pointer hover:scale-150 ";
                  if (d.p > 1000) cl += "bg-emerald-600";
                  else if (d.p > 0) cl += "bg-green-500";
                  else if (d.p < 0) cl += "bg-red-500";
                  else cl += "bg-gray-200";
                  return <div key={i} className={cl} onClick={() => { setEdit(i); setView('day'); setHours(d.h.toString()); }} title={`Day ${i+1}: ${fmt(d.p)}`} />;
                })}</div>))}
              </div>
              <div className="flex justify-center gap-6 mt-6 text-sm">
                <div className="flex items-center"><div className="w-4 h-4 bg-emerald-600 mr-2 rounded"></div><span>$1K+</span></div>
                <div className="flex items-center"><div className="w-4 h-4 bg-green-500 mr-2 rounded"></div><span>Profit</span></div>
                <div className="flex items-center"><div className="w-4 h-4 bg-red-500 mr-2 rounded"></div><span>Loss</span></div>
              </div>
            </div>
            <div className="mt-8 space-y-6">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-8 rounded-lg text-white">
                <div className="text-2xl font-bold mb-2">{q.q}</div>
                <div className="text-blue-100 text-sm">{q.s}</div>
              </div>
              {o && o.tt > 0 && (
                <div className="bg-gradient-to-br from-red-500 to-rose-600 p-6 rounded-lg text-white">
                  <h2 className="text-xl font-semibold mb-4">🛑 Stop Loss</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div><div className="text-sm opacity-90">Avg Drawdown</div><div className="text-3xl font-bold">{o.amd.toFixed(2)}%</div></div>
                    <div><div className="text-sm opacity-90">Recommended SL</div><div className="text-3xl font-bold">{o.rsl.toFixed(2)}%</div></div>
                  </div>
                </div>
              )}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4">Performance</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded"><div className="text-sm text-gray-600">Total P&L</div><div className={`text-2xl font-bold ${s.tp >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(s.tp)}</div></div>
                  <div className="bg-gray-50 p-4 rounded"><div className="text-sm text-gray-600">Win Rate</div><div className="text-2xl font-bold">{((s.pd / 365) * 100).toFixed(1)}%</div></div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4">Old Job vs Trading</h2>
                <div className="space-y-4">
                  <div className="flex justify-between pb-3 border-b"><span>Old rate:</span><span className="font-semibold">{fmt(parseFloat(salary))}/hr</span></div>
                  <div className="flex justify-between pb-3 border-b"><span>Trading rate:</span><span className={`font-semibold ${s.ehr >= parseFloat(salary) ? 'text-green-600' : 'text-red-600'}`}>{fmt(s.ehr)}/hr</span></div>
                  <div className="flex justify-between pb-3 border-b"><span>Difference:</span><span className={`font-bold text-lg ${sc >= 0 ? 'text-green-600' : 'text-red-600'}`}>{sc >= 0 ? '+' : ''}{sc}%</span></div>
                  {s.dtsoj !== Infinity && s.dtsoj > 0 && (
                    <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
                      <div className="text-sm mb-2">📅 Days to surpass old salary:</div>
                      <div className="text-3xl font-bold text-purple-600">{s.dtsoj}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {alert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-green-400 to-emerald-600 p-8 rounded-lg max-w-md w-full text-white">
            <div className="text-center">
              <div className="text-6xl mb-4">🎉💰🎉</div>
              <h2 className="text-3xl font-bold mb-4">GREAT JOB!</h2>
              <div className="text-5xl font-bold mb-6">{fmt(amount)}</div>
              <div className="bg-white bg-opacity-20 p-6 rounded-lg mb-6">
                <p className="text-xl font-semibold mb-3">📤 WITHDRAW 100%!</p>
              </div>
              <button onClick={() => setAlert(false)} className="w-full bg-white text-emerald-600 py-3 rounded-md font-bold text-lg">Got it! 💪</button>
            </div>
          </div>
        </div>
      )}
      {edit !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full">
            <div className="flex gap-2 mb-4">
              <button onClick={() => setView('day')} className={`px-4 py-2 rounded ${view === 'day' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Day</button>
              <button onClick={() => setView('trades')} className={`px-4 py-2 rounded ${view === 'trades' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Trades</button>
            </div>
            {view === 'day' ? (
              <>
                <h3 className="text-lg font-semibold mb-4">Day {edit + 1}</h3>
                <div className="space-y-4">
                  <div><label className="block text-sm mb-2">P&L</label><div className="w-full p-3 bg-gray-100 rounded font-semibold">{fmt(days[edit].p)}</div></div>
                  <div><label className="block text-sm mb-2">Hours</label><input type="number" className="w-full p-2 border rounded" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
                  <div className="flex gap-2">
                    <button onClick={() => { const nd = [...days]; nd[edit].h = parseFloat(hours) || 0; setDays(nd); setEdit(null); }} className="flex-1 bg-blue-600 text-white py-2 rounded">Save</button>
                    <button onClick={() => setEdit(null)} className="flex-1 bg-gray-300 py-2 rounded">Close</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-4">Day {edit + 1} - Trades</h3>
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <h4 className="font-semibold mb-3">Add Trade</h4>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div><label className="block text-xs mb-1">Date</label><input type="date" className="w-full p-2 border rounded text-sm" value={trade.date} onChange={(e) => setTrade({...trade, date: e.target.value})} /></div>
                    <div><label className="block text-xs mb-1">Size ($)</label><input type="number" className="w-full p-2 border rounded text-sm" value={trade.size} onChange={(e) => setTrade({...trade, size: e.target.value})} /></div>
                    <div><label className="block text-xs mb-1">Entry ($)</label><input type="number" step="0.01" className="w-full p-2 border rounded text-sm" value={trade.entry} onChange={(e) => setTrade({...trade, entry: e.target.value})} /></div>
                    <div><label className="block text-xs mb-1">Exit ($)</label><input type="number" step="0.01" className="w-full p-2 border rounded text-sm" value={trade.exit} onChange={(e) => setTrade({...trade, exit: e.target.value})} /></div>
                    <div><label className="block text-xs mb-1">Max ($)</label><input type="number" step="0.01" className="w-full p-2 border rounded text-sm" value={trade.max} onChange={(e) => setTrade({...trade, max: e.target.value})} /></div>
                    <div><label className="block text-xs mb-1">Min ($)</label><input type="number" step="0.01" className="w-full p-2 border rounded text-sm" value={trade.min} onChange={(e) => setTrade({...trade, min: e.target.value})} /></div>
                  </div>
                  <button onClick={add} className="w-full bg-green-600 text-white py-2 rounded text-sm">Add</button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <h4 className="font-semibold mb-2">History ({days[edit].t.length})</h4>
                  {days[edit].t.length === 0 ? <p className="text-gray-500 text-sm">No trades</p> : (
                    <div className="space-y-2">
                      {days[edit].t.map((t) => (
                        <div key={t.id} className="border p-3 rounded">
                          <div className="flex justify-between mb-2">
                            <div className="text-sm font-medium">{t.date}</div>
                            <button onClick={() => del(edit, t.id)} className="text-red-600 text-xs">Delete</button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>Entry: ${t.entry.toFixed(2)}</div>
                            <div>Exit: ${t.exit.toFixed(2)}</div>
                          </div>
                          <div className="mt-2 pt-2 border-t">
                            <div className={`text-sm font-semibold ${t.actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>P&L: {fmt(t.actualProfit)}</div>
                            {t.roundtripped && <div className="text-xs text-red-600 font-semibold mt-1">🔄 ROUNDTRIP!</div>}
                            {t.savedByEarlyExit && <div className="text-xs text-green-600 font-semibold mt-1">✅ EARLY EXIT SAVED YOU!</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setEdit(null)} className="mt-4 w-full bg-gray-300 py-2 rounded">Close</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  </>);
}
