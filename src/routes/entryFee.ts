import express from 'express';
import EntryFeeManager from '../services/EntryFeeManager';

const router = express.Router();
const entryFeeManager = new EntryFeeManager();

// Get status
router.get('/status', (req, res) => {
  const status = entryFeeManager.getStatus();
  res.json({
    success: true,
    data: status,
    message: 'Entry fee manager status retrieved'
  });
});

// Force update for specific network
router.post('/force-update/:network', async (req, res) => {
  try {
    const { network } = req.params;
    await entryFeeManager.forceUpdate(network);
    
    res.json({
      success: true,
      message: `Entry fee updated for ${network}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start monitoring
router.post('/start', async (req, res) => {
  try {
    await entryFeeManager.start();
    
    res.json({
      success: true,
      message: 'Entry fee monitoring started'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Stop monitoring
router.post('/stop', async (req, res) => {
  try {
    await entryFeeManager.stop();
    
    res.json({
      success: true,
      message: 'Entry fee monitoring stopped'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get current entry fees for all networks
router.get('/current-fees', async (req, res) => {
  try {
    const fees = await entryFeeManager.getCurrentFees();
    
    res.json({
      success: true,
      data: fees,
      message: 'Current entry fees retrieved'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;