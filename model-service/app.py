from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd, numpy as np, ccxt, datetime as dt
from ta.momentum import RSIIndicator
from ta.trend import MACD
from typing import List, Dict

app = FastAPI(title="Cairn Model Service")

class SignalRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    limit: int = 500

def load_ohlcv(symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
    ex = ccxt.binance()
    data = ex.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    df = pd.DataFrame(data, columns=["ts","o","h","l","c","v"])
    df["ts"] = pd.to_datetime(df["ts"], unit="ms", utc=True)
    return df

def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ret"] = df["c"].pct_change()
    df["rsi"] = RSIIndicator(df["c"], window=14).rsi()
    macd = MACD(df["c"], window_slow=26, window_fast=12, window_sign=9)
    df["macd"] = macd.macd()
    df["macd_sig"] = macd.macd_signal()
    df["zscore"] = (df["c"] - df["c"].rolling(50).mean()) / (df["c"].rolling(50).std() + 1e-9)
    df["vol"] = df["ret"].rolling(24).std()
    return df

def detect_regime(df: pd.DataFrame) -> str:
    vol = df["vol"].iloc[-1]
    trend = df["macd"].iloc[-1] - df["macd_sig"].iloc[-1]
    if vol > df["vol"].quantile(0.9): return "vol-shock"
    if trend > 0: return "up-trend"
    if trend < 0: return "down-trend"
    return "chop"

@app.post("/signal")
def signal(req: SignalRequest):
    df = load_ohlcv(req.symbol, req.timeframe, req.limit)
    df = compute_features(df).dropna()
    regime = detect_regime(df)
    rsi = df["rsi"].iloc[-1]; z = df["zscore"].iloc[-1]
    # Simple rule set (replace with model later)
    if regime == "up-trend" and rsi < 65 and z > -0.5:
        direction, strength = "long", float(min(1.0, (65-rsi)/20 + max(0,z/2)))
        reason = {"regime": regime, "rsi": rsi, "z": z, "explain":"Up-trend with non-overbought RSI"}
    elif regime == "down-trend" and rsi > 35 and z < 0.5:
        direction, strength = "short", float(min(1.0, (rsi-35)/20 + max(0,-z/2)))
        reason = {"regime": regime, "rsi": rsi, "z": z, "explain":"Down-trend with non-oversold RSI"}
    else:
        direction, strength = "flat", 0.0
        reason = {"regime": regime, "explain":"No edge"}
    return {"symbol": req.symbol, "regime": regime, "direction": direction, "strength": strength, "reason": reason}
