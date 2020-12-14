const MissingChainLockError = require('./errors/MissingChainLockError');
const LatestCoreChainLock = require('./LatestCoreChainLock');

/**
 *
 * @param {LatestCoreChainLock} latestCoreChainLock

 * @return {waitForChainlockedHeight}
 */
function waitForChainlockedHeightFactory(
  latestCoreChainLock,
) {
  /**
   * @typedef waitForChainlockedHeight
   * @param {number} coreHeight
   *
   * @return {Promise<void>}
   */
  async function waitForChainlockedHeight(coreHeight) {
    // ChainLock is required to get finalized SML that won't be reorged
    const chainLock = latestCoreChainLock.getChainLock();

    if (!chainLock) {
      throw new MissingChainLockError();
    }

    // Wait for core to be synced up to coreHeight
    if (coreHeight > chainLock.height) {
      await new Promise((resolve) => {
        latestCoreChainLock.once(`${LatestCoreChainLock.EVENTS.update}:${coreHeight}`, resolve);
      });
    }
  }

  return waitForChainlockedHeight;
}

module.exports = waitForChainlockedHeightFactory;