require("dotenv").config();
const ccxt = require("ccxt");
const pino = require("pino");
const axios = require("axios");
const { z } = require("zod");

const log = pino();
const cfg = {
    modelUrl: process.env.MODEL_URL || "http://model-service:8001/signal",
    symbol: "BTC/USDT",
    maxPositionUSD: 1000,
    takeProfit: 0.01,   // 1%
    stopLoss: 0.006,    // 0.6%
    minStrength: 0.25,
};

const respSchema = z.object({
    direction: z.enum(["long","flat","short"]),
    strength: z.number(),
    regime: z.string(),
    reason: z.any(),
    symbol: z.string()
});

async function price(ex, symbol) {
    const t = await ex.fetchTicker(symbol);
    return t.last;
}

async function main() {
    const ex = new ccxt.binance({ enableRateLimit: true }); // Public endpoints only for paper
    let position = 0; // +qty (long), -qty (short), 0 = flat
    let entry = null;

    setInterval(async () => {
        try {
            const { data } = await axios.post(cfg.modelUrl, { symbol: cfg.symbol, timeframe:"1h", limit:500 });
            const sig = respSchema.parse(data);
            const px = await price(ex, cfg.symbol);

            // Risk checks + simple position sizing
            const usdSize = cfg.maxPositionUSD * Math.min(1, Math.max(0.2, sig.strength));
            const qty = usdSize / px;

            // Exit logic
            if (position !== 0 && entry) {
                const pnl = (px - entry) * Math.sign(position);
                if (pnl / entry >= cfg.takeProfit || pnl / entry <= -cfg.stopLoss) {
                    log.info({ action:"close", px, pnl, reason:"tp/sl"});
                    position = 0; entry = null;
                    return;
                }
            }

            // Entry logic
            if (sig.direction === "long" && sig.strength >= cfg.minStrength && position <= 0) {
                position = qty; entry = px;
                log.info({ action:"buy", qty, px, regime:sig.regime, reason:sig.reason });
            } else if (sig.direction === "short" && sig.strength >= cfg.minStrength && position >= 0) {
                position = -qty; entry = px;
                log.info({ action:"sell", qty, px, regime:sig.regime, reason:sig.reason });
            } else {
                log.info({ action:"hold", px, regime:sig.regime });
            }
        } catch (e) {
            log.error(e.toString());
        }
    }, 30_000); // poll every 30s for demo; cron in prod
}
main();
