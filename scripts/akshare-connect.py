#!/usr/bin/env python3
"""
Fetch Stock Connect (northbound) holdings data using AkShare.
Outputs JSON to stdout for Node.js consumption.

Usage:
    python3 akshare-connect.py

Dependencies:
    pip install akshare pandas
"""

import json
import sys

def main():
    try:
        import akshare as ak
        import pandas as pd
    except ImportError as e:
        print(json.dumps({"error": f"Missing dependency: {e}"}), file=sys.stderr)
        sys.exit(1)

    try:
        # Fetch today's northbound holdings ranking
        # indicator options: "今日排行", "近3日排行", "近5日排行", "近10日排行", "近月排行", "近季排行", "近年排行"
        df = ak.stock_hsgt_hold_stock_em(indicator="今日排行")
        
        if df is None or df.empty:
            print(json.dumps([]))
            return

        # Rename columns to English
        column_map = {
            "代码": "code",
            "名称": "name",
            "今日收盘价": "closePrice",
            "今日涨跌幅": "changePercent",
            "今日持股-股数": "holdingShares",
            "今日持股-市值": "holdingValue",
            "今日持股-占流通股比": "percentOfFloat",
            "今日持股-占总股本比": "percentOfTotal",
            "今日增持估计-股数": "dailyChangeShares",
            "今日增持估计-市值": "dailyChangeValue",
            "所属板块": "sector"
        }
        
        # Select and rename columns that exist
        available_cols = [col for col in column_map.keys() if col in df.columns]
        df = df[available_cols].rename(columns={k: column_map[k] for k in available_cols})
        
        # Convert numeric columns
        numeric_cols = ["closePrice", "changePercent", "holdingShares", "holdingValue", 
                       "percentOfFloat", "percentOfTotal", "dailyChangeShares", "dailyChangeValue"]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
        
        # Convert to JSON
        records = df.to_dict(orient="records")
        print(json.dumps(records, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
