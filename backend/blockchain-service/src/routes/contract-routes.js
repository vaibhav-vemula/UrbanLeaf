import express from 'express';
import { signRequest } from '@worldcoin/idkit-core';

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
// Verifies proof against the World ID v4 API, then casts a sybil-resistant vote on-chain.
contractRoutes.post('/vote-world-id', async (req, res, next) => {
  try {
    const svc = req.app.locals.blockchainService;
    const { proposalId, vote, voter, idkitResult, rp_id } = req.body;
    if (proposalId === undefined || vote === undefined || !voter || !idkitResult || !rp_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: proposalId, vote, voter, idkitResult, rp_id',
      });
    }

    // Step 1: Verify the World ID proof via the v4 API
    const verifyUrl = `https://developer.world.org/api/v4/verify/${encodeURIComponent(rp_id)}`;
    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(idkitResult),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.success) {
      return res.status(400).json({
        success: false,
        error: `World ID verification failed: ${verifyData.detail || verifyData.code || verifyRes.status}`,
      });
    }

    // Step 2: Extract nullifier (top-level in v4 response, hex string)
    const nullifier = verifyData.nullifier;
    if (!nullifier) {
      return res.status(400).json({ success: false, error: 'World ID did not return a nullifier' });
    }

    // Step 3: Cast the verified vote on-chain
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
