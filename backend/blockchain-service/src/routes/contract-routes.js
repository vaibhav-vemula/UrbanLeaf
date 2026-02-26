import express from 'express';

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
