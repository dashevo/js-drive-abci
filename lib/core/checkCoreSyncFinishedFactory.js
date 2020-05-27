const wait = require('../util/wait');

/**
 * Check that core is synced (factory)
 *
 * @param {RpcClient} coreRpcClient
 *
 * @returns {checkCoreSyncFinished}
 */
function checkCoreSyncFinishedFactory(coreRpcClient) {
  /**
   * Check that core is synced
   *
   * @typedef checkCoreSyncFinished
   *
   * @param {function(number, number)} progressCallback
   *
   * @returns {Promise<void>}
   */
  async function checkCoreSyncFinished(progressCallback) {
    const { result: blockchainInfo } = await coreRpcClient.getBlockchainInfo();
    const { result: peerInfo } = await coreRpcClient.getPeerInfo();

    if (blockchainInfo.chain === 'regtest' && peerInfo.length === 0) {
      return;
    }

    while (true) {
      const {
        result: {
          IsBlockchainSynced: isBlockchainSynced,
        },
      } = await coreRpcClient.mnsync('status');

      if (isBlockchainSynced) {
        return;
      }

      const {
        result: {
          blocks: currentBlockHeight,
          headers: currentHeadersNumber,
        },
      } = await coreRpcClient.getBlockchainInfo();

      progressCallback(currentBlockHeight, currentHeadersNumber);

      await wait(10000);
    }
  }

  return checkCoreSyncFinished;
}

module.exports = checkCoreSyncFinishedFactory;