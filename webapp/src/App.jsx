import { useEffect, useState } from "react";

export default function App() {
    const [sig, setSig] = useState(null);
    const fetchSig = async () => {
        const res = await fetch("http://localhost:8001/signal", {method:"POST",
            headers:{ "Content-Type":"application/json" },
            body: JSON.stringify({ symbol:"BTC/USDT", timeframe:"1h", limit:500 })
        });
        setSig(await res.json());
    };
    useEffect(() => { fetchSig(); const id=setInterval(fetchSig, 60000); return ()=>clearInterval(id); }, []);
    if (!sig) return <div className="p-8">Loading…</div>;

    const riskText = sig.direction === "flat" ? "Stand aside" :
        `${sig.direction.toUpperCase()} — strength ${(sig.strength*100).toFixed(0)}%`;

    return (
        <div className="min-h-screen p-8 bg-gray-50">
            <div className="max-w-xl mx-auto rounded-2xl shadow p-6 bg-white">
                <h1 className="text-2xl font-bold">Cairn — Signal</h1>
                <p className="text-sm text-gray-500 mt-1">{sig.symbol} • Regime: {sig.regime}</p>
                <div className="mt-4 p-4 rounded-xl bg-gray-100">
                    <div className="text-xl font-semibold">{riskText}</div>
                    <pre className="text-xs mt-2 bg-white p-3 rounded">{JSON.stringify(sig.reason, null, 2)}</pre>
                    <p className="text-xs text-gray-500 mt-3">Educational only. Not financial advice. Paper trading by default.</p>
                </div>
            </div>
        </div>
    );
}
