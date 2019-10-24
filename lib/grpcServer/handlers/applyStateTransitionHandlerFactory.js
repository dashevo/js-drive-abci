const { ApplyStateTransitionResponse } = require('@dashevo/drive-grpc');
const InvalidStateTransitionError = require(
  '@dashevo/dpp/lib/stateTransition/errors/InvalidStateTransitionError',
);

const {
  server: {
    error: {
      InternalGrpcError,
      InvalidArgumentGrpcError,
      FailedPreconditionGrpcError,
    },
  },
} = require('@dashevo/grpc-common');

/**
 * @param {MongoDBTransaction} stateViewTransaction
 * @param {DashPlatformProtocol} dpp
 * @param {applyStateTransition} applyStateTransition
 * @param {BlockExecutionState} blockExecutionState
 * @returns {applyStateTransitionHandler}
 */
module.exports = function applyStateTransitionHandlerFactory(
  stateViewTransaction,
  dpp,
  applyStateTransition,
  blockExecutionState,
) {
  /**
   * Apply received stPacket and stHeader to database inside transaction, opened earlier
   *
   * @typedef applyStateTransitionHandler
   * @param {Object} call
   * @returns {Promise<CommitTransactionResponse>}
   */
  async function applyStateTransitionHandler({ request }) {
    if (!stateViewTransaction.isTransactionStarted) {
      throw new FailedPreconditionGrpcError('Transaction is not started');
    }

    const blockHeight = request.getBlockHeight();
    const blockHashBinaryArray = request.getBlockHash();
    const stateTransitionBinaryArray = request.getStateTransition();

    if (stateTransitionBinaryArray === undefined) {
      throw new InvalidArgumentGrpcError('stateTransition is not specified');
    }

    if (blockHeight === undefined) {
      throw new InvalidArgumentGrpcError('blockHeight is not specified');
    }

    if (blockHashBinaryArray === undefined) {
      throw new InvalidArgumentGrpcError('blockHash is not specified');
    }

    let stateTransition;

    try {
      const stateTransitionHex = Buffer.from(stateTransitionBinaryArray).toString('hex');

      stateTransition = await dpp.stateTransition.createFromSerialized(stateTransitionHex);
    } catch (e) {
      if (e instanceof InvalidStateTransitionError) {
        throw new InvalidArgumentGrpcError(e.message, { errors: e.getErrors() });
      }

      throw e;
    }

    let svContract;

    try {
      ({ svContract } = await applyStateTransition(
        stateTransition,
        Buffer.from(blockHashBinaryArray).toString('hex'),
        blockHeight,
        stateViewTransaction,
      ));
    } catch (error) {
      throw new InternalGrpcError(error);
    }

    if (svContract) {
      blockExecutionState.addContract(svContract);
    }

    return new ApplyStateTransitionResponse();
  }

  return applyStateTransitionHandler;
};