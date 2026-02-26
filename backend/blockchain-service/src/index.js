import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { BlockchainService } from './services/blockchain-service.js';
import { contractRoutes } from './routes/contract-routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

const blockchainService = new BlockchainService();
app.locals.blockchainService = blockchainService;

app.get('/', (req, res) => {
  res.json({
    name: 'UrbanLeaf AI Blockchain Service',
    version: '1.0.0',
    description: 'Arbitrum Sepolia microservice for UrbanLeaf AI',
    network: 'arbitrum_sepolia',
    endpoints: {
      contract: '/api/contract - Smart contract operations',
      health: '/health - Health check'
    }
  });
});

app.get('/health', async (req, res) => {
  try {
    const balance = await blockchainService.getBalance();
    res.json({
      status: 'ok',
      network: 'arbitrum_sepolia',
      chainId: 421614,
      deployer: blockchainService.wallet.address,
      balance: `${balance} ETH`,
      contract: blockchainService.contractAddress || 'Not deployed'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.use('/api/contract', contractRoutes);

app.get('/api/balances/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const result = await blockchainService.getUserBalances(address);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Blockchain Service running on port ${PORT}`);
  console.log(`Network: Arbitrum Sepolia`);
  console.log(`Contract: ${process.env.CONTRACT_ADDRESS || 'Not deployed'}`);
});
