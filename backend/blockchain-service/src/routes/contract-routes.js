import express from 'express';
import { signRequest } from '@worldcoin/idkit-core';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CRE_WORKFLOW_DIR = join(__dirname, '../../../../cre-workflow');

// Parse cre-workflow/.env so secrets are available to the spawned CRE process.
function parseEnvFile(filePath) {
  try {
    return Object.fromEntries(
      readFileSync(filePath, 'utf8')
        .split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('='))
        .map(l => {
          const idx = l.indexOf('=');
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')];
        })
    );
  } catch { return {}; }
}

// Parse the JSON result line from `cre workflow simulate` stdout.
function parseCreResult(stdout) {
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Workflow Simulation Result:')) {
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j].trim();
        if (line) {
          try {
            const parsed = JSON.parse(line);
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch { return null; }
        }
      }
    }
  }
  return null;
}

// Writes the proof payload then runs `cre workflow simulate verify-vote`.
// CRE verifies the World ID proof off-chain (DON consensus) and calls
// /api/contract/cast-verified-vote to land the vote on Arbitrum Sepolia.
function runCreVerifyVote(payload) {
  const payloadPath = join(CRE_WORKFLOW_DIR, 'test/verify-vote-payload.json');
  writeFileSync(payloadPath, JSON.stringify(payload, null, 2));

  const creEnv = parseEnvFile(join(CRE_WORKFLOW_DIR, '.env'));
  const HOME = process.env.HOME || '/Users/vaibhav';

  return new Promise((resolve, reject) => {
    const proc = spawn(
      'cre',
      ['workflow', 'simulate', 'verify-vote', '-T', 'staging-settings',
       '--non-interactive', '--trigger-index', '0', '--http-payload', `@${payloadPath}`],
      {
        cwd: CRE_WORKFLOW_DIR,
        env: { ...process.env, ...creEnv, PATH: `${HOME}/.cre/bin:${process.env.PATH}` },
      }
    );

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; process.stdout.write(d); });
    proc.stderr.on('data', d => { stderr += d; process.stderr.write(d); });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('CRE simulate timed out after 120s'));
    }, 120_000);

    proc.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error(`CRE simulate exited ${code}: ${stderr.slice(-500)}`));
      const result = parseCreResult(stdout);
      if (!result) return reject(new Error('CRE simulate completed but returned no parseable result'));
      resolve(result);
    });
  });
}

export const contractRoutes = express.Router();

contractRoutes.get('/info', async (req, res, next) => {
  try {
    const svc = req.app.locals.blockchainService;
    res.json({
      success: true,
      network: 'arbitrum_sepolia',
      chainId: 421614,
      deployer: svc.wallet.address,
      contractAddress: svc.contractAddress || null,
      explorerUrl: 'https://sepolia.arbiscan.io'
    });
  } catch (error) {
    next(error);
  }
});

contractRoutes.post('/create-proposal', async (req, res, next) => {
  try {
    const svc = req.app.locals.blockchainService;
    const proposalData = req.body;
    const required = ['parkName', 'parkId', 'description', 'endDate', 'environmentalData', 'demographics'];
    for (const field of required) {
      if (!proposalData[field]) {
        return res.status(400).json({ success: false, error: `Missing required field: ${field}` });
      }
    }
    const result = await svc.createProposal(proposalData);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.post('/vote', async (req, res, next) => {
  try {
    const svc = req.app.locals.blockchainService;
    const { proposalId, vote, voter } = req.body;
    if (proposalId === undefined || vote === undefined || !voter) {
      return res.status(400).json({ success: false, error: 'Missing required fields: proposalId, vote, voter' });
    }
    const result = await svc.submitVote(
      parseInt(proposalId),
      vote === true || vote === 'true' || vote === 'yes',
      voter
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.get('/proposal/:id', async (req, res, next) => {
  try {
    const svc = req.app.locals.blockchainService;
    const proposalId = parseInt(req.params.id);
    if (isNaN(proposalId)) {
      return res.status(400).json({ success: false, error: 'Invalid proposal ID' });
    }
    const result = await svc.getProposal(proposalId);
    if (result === null) {
      return res.status(404).json({ success: false, error: 'Proposal does not exist' });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.get('/proposals/active', async (req, res, next) => {
  try {
    const result = await req.app.locals.blockchainService.getAllActiveProposals();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.get('/proposals/accepted', async (req, res, next) => {
  try {
    const result = await req.app.locals.blockchainService.getAllAcceptedProposals();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.get('/proposals/rejected', async (req, res, next) => {
  try {
    const result = await req.app.locals.blockchainService.getAllRejectedProposals();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.get('/has-voted/:proposalId/:address', async (req, res, next) => {
  try {
    const svc = req.app.locals.blockchainService;
    const proposalId = parseInt(req.params.proposalId);
    const address = req.params.address;
    if (isNaN(proposalId) || !address) {
      return res.status(400).json({ success: false, error: 'Invalid proposal ID or address' });
    }
    const result = await svc.hasUserVoted(proposalId, address);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Returns a signed World ID v4 rp_context for the frontend to include in the IDKit request.
contractRoutes.get('/world-id/request', (req, res, next) => {
  try {
    const signingKey = process.env.WORLD_ID_SIGNING_KEY;
    const rpId = process.env.WORLD_ID_RP_ID || process.env.WORLD_ID_APP_ID;
    if (!signingKey || !rpId) {
      return res.status(500).json({ success: false, error: 'World ID RP not configured. Set WORLD_ID_RP_ID and WORLD_ID_SIGNING_KEY.' });
    }
    const action = req.query.action || 'urbanleaf-vote';
    const { sig, nonce, createdAt, expiresAt } = signRequest(String(action), signingKey);
    res.json({
      success: true,
      rp_context: { rp_id: rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig },
    });
  } catch (error) {
    next(error);
  }
});

// Called by the frontend after World ID proof is obtained.
// Delegates to the Chainlink CRE verify-vote workflow (via cre simulate) which:
//   1. Verifies the World ID v4 proof off-chain using DON consensus
//   2. Calls /cast-verified-vote to land the sybil-resistant vote on Arbitrum Sepolia
// This bridges World ID to Arbitrum Sepolia, which has no native World ID contract.
contractRoutes.post('/vote-world-id', async (req, res, next) => {
  try {
    const { proposalId, vote, voter, idkitResult, rp_id } = req.body;
    if (proposalId === undefined || vote === undefined || !voter || !idkitResult || !rp_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: proposalId, vote, voter, idkitResult, rp_id',
      });
    }

    console.log(`[CRE] Delegating World ID verification to CRE simulate — proposal #${proposalId}`);

    const result = await runCreVerifyVote({
      proposalId: String(proposalId),
      vote: vote === true || vote === 'true' || vote === 'yes',
      voter,
      idkitResult,
      rp_id,
    });

    res.json({ success: true, transactionHash: result.txHash, ...result });
  } catch (error) {
    next(error);
  }
});

// Called by the Chainlink CRE verify-vote workflow AFTER it has verified the
// World ID proof off-chain. CRE is the trusted verifier — this endpoint only
// casts the vote with the nullifier CRE extracted; no re-verification here.
contractRoutes.post('/cast-verified-vote', async (req, res, next) => {
  try {
    const svc = req.app.locals.blockchainService;
    const { proposalId, vote, voter, nullifier } = req.body;
    if (proposalId === undefined || vote === undefined || !voter || !nullifier) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: proposalId, vote, voter, nullifier',
      });
    }
    const result = await svc.voteVerified(
      parseInt(proposalId),
      vote === true || vote === 'true' || vote === 'yes',
      voter,
      nullifier,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.post('/set-environmental-score', async (req, res, next) => {
  try {
    const { proposalId, score, urgencyLevel, insight } = req.body;
    if (proposalId === undefined || score === undefined || !urgencyLevel || !insight) {
      return res.status(400).json({ success: false, error: 'Missing required fields: proposalId, score, urgencyLevel, insight' });
    }
    const result = await req.app.locals.blockchainService.setEnvironmentalScore(
      parseInt(proposalId), parseInt(score), urgencyLevel, insight
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.post('/close-proposal', async (req, res, next) => {
  try {
    const { proposalId } = req.body;
    if (proposalId === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required field: proposalId' });
    }
    const result = await req.app.locals.blockchainService.closeProposal(parseInt(proposalId));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.post('/set-funding-goal', async (req, res, next) => {
  try {
    const { proposalId, goal } = req.body;
    if (proposalId === undefined || goal === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields: proposalId, goal' });
    }
    const result = await req.app.locals.blockchainService.setFundingGoal(parseInt(proposalId), parseFloat(goal));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.post('/donate', async (req, res, next) => {
  try {
    const { proposalId, amount } = req.body;
    if (proposalId === undefined || amount === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields: proposalId, amount' });
    }
    const result = await req.app.locals.blockchainService.donateToProposal(parseInt(proposalId), parseFloat(amount));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.get('/donation-progress/:proposalId', async (req, res, next) => {
  try {
    const proposalId = parseInt(req.params.proposalId);
    if (isNaN(proposalId)) {
      return res.status(400).json({ success: false, error: 'Invalid proposal ID' });
    }
    const result = await req.app.locals.blockchainService.getDonationProgress(proposalId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

contractRoutes.post('/withdraw-funds', async (req, res, next) => {
  try {
    const { proposalId, recipient } = req.body;
    if (proposalId === undefined || !recipient) {
      return res.status(400).json({ success: false, error: 'Missing required fields: proposalId, recipient' });
    }
    const result = await req.app.locals.blockchainService.withdrawFunds(parseInt(proposalId), recipient);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
