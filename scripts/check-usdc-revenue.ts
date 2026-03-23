import { ethers } from "ethers";

const WALLET = "0x46D4f9f23948fBbeF6b104B0cB571b3F6e551B6F";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_RPC = "https://mainnet.base.org";
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const BATCH_SIZE = 9000; // Under 10k limit

async function main() {
  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const currentBlock = await provider.getBlockNumber();
  
  // ACP launched ~late Feb 2025, query from ~Feb 1 2025
  // Block ~35M was around late Jan 2025
  const startBlock = 35000000;
  
  console.log(`Querying USDC transfers from block ${startBlock} to ${currentBlock}...`);
  console.log(`Wallet: ${WALLET}`);
  console.log(`Batch size: ${BATCH_SIZE} blocks\n`);
  
  let allTransfers: { date: string; tx: string; amount: number }[] = [];
  let totalUsdc = 0;
  
  for (let fromBlock = startBlock; fromBlock < currentBlock; fromBlock += BATCH_SIZE) {
    const toBlock = Math.min(fromBlock + BATCH_SIZE - 1, currentBlock);
    
    process.stdout.write(`  Scanning ${fromBlock}...${toBlock}\r`);
    
    const filter = {
      address: USDC_BASE,
      topics: [
        TRANSFER_TOPIC,
        null,
        ethers.zeroPadValue(WALLET.toLowerCase(), 32),
      ],
      fromBlock,
      toBlock,
    };
    
    try {
      const logs = await provider.getLogs(filter);
      
      for (const log of logs) {
        const value = Number(BigInt(log.data)) / 1e6;
        totalUsdc += value;
        
        const block = await provider.getBlock(log.blockNumber);
        const date = block ? new Date(block.timestamp * 1000).toISOString().split('T')[0] : 'unknown';
        
        allTransfers.push({
          date,
          tx: log.transactionHash,
          amount: value,
        });
        
        console.log(`\n  Found: ${date} | $${value.toFixed(2)} USDC | TX: ${log.transactionHash.slice(0, 20)}...`);
      }
    } catch (err: any) {
      console.error(`\n  Error at block ${fromBlock}:`, err.message?.slice(0, 100));
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n\n========================================`);
  console.log(`Found ${allTransfers.length} transfers`);
  console.log(`TOTAL REVENUE: $${totalUsdc.toFixed(2)} USDC`);
  console.log(`========================================`);
}

main();
