import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('Deploying UrbanLeafCommunity contract to Arbitrum Sepolia...\n');

  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const network = await provider.getNetwork();
  console.log(`Network: Arbitrum Sepolia (chainId: ${network.chainId})`);
  console.log(`Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

  const contractPath = path.join(__dirname, '../artifacts/contracts/UrbanLeafCommunity.sol/UrbanLeafCommunity.json');

  if (!fs.existsSync(contractPath)) {
    throw new Error(`Contract artifact not found at ${contractPath}\nRun 'npm run compile' first`);
  }

  const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const { abi, bytecode } = contractJson;

  if (!bytecode || bytecode === '0x') {
    throw new Error('Contract bytecode is empty. Make sure the contract compiled successfully.');
  }

  console.log('Deploying contract...\n');

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  console.log('Contract deployed successfully!');
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Transaction Hash: ${deployTx.hash}`);
  console.log(`Explorer: https://sepolia.arbiscan.io/address/${contractAddress}`);

  const deploymentInfo = {
    contractAddress,
    network: 'arbitrum_sepolia',
    chainId: 421614,
    deployedAt: new Date().toISOString(),
    deployer: wallet.address,
    transactionHash: deployTx.hash,
    explorerUrl: `https://sepolia.arbiscan.io/address/${contractAddress}`
  };

  const deploymentPath = path.join(__dirname, '../deployments-arbitrum.json');
  let deployments = {};

  if (fs.existsSync(deploymentPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  }

  deployments['arbitrum_sepolia'] = deploymentInfo;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));

  console.log('\nDeployment info saved to blockchain-service/deployments-arbitrum.json');
  console.log('\nNext steps:');
  console.log('1. Update blockchain-service/.env:');
  console.log(`   CONTRACT_ADDRESS=${contractAddress}`);
  console.log('\n2. Update urbanleaffe/.env.local:');
  console.log(`   NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
  console.log('\n3. Restart the blockchain service');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });
