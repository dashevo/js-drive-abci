const {
  tendermint: {
    abci: {
      ResponseInitChain,
      ValidatorSetUpdate,
    },
    crypto: {
      PublicKey,
    },
  },
} = require('@dashevo/abci/types');

const initChainHandlerFactory = require('../../../../lib/abci/handlers/initChainHandlerFactory');

const getValidatorSetInfoFactory = require('../../../../lib/core/getValidatorSetInfoFactory');

const getSmlFixture = require('../../../../lib/test/fixtures/getSmlFixture');

const ValidatorSet = require('../../../../lib/validatorSet/ValidatorSet');

describe('initChainHandlerFactory', () => {
  let simplifiedMasternodeListMock;
  let initChainHandler;
  let updateSimplifiedMasternodeListMock;
  let initialCoreChainLockedHeight;
  let getValidatorSetInfo;
  let containerMock;
  let smlStoreMock;
  let smlMock;
  let simplifiedMNListDiffMock;
  let coreRpcClientMock;
  let loggerMock;
  let validatorsFixture;
  let validatorsUpdateFixture;

  beforeEach(function beforeEach() {
    initialCoreChainLockedHeight = 1;

    updateSimplifiedMasternodeListMock = this.sinon.stub();

    containerMock = {
      register: this.sinon.stub(),
    };

    simplifiedMNListDiffMock = {
      blockHash: '000002df62636a47af1046c0f5ece8e1d5fde9b18d572059fe00621668727a26',
    };

    smlMock = {
      getValidatorLLMQType: this.sinon.stub().returns(4),
      getQuorums: this.sinon.stub().returns(getSmlFixture()[0].newQuorums.filter(quorum => quorum.llmqType === 1)),
      getQuorum: this.sinon.stub().returns(getSmlFixture()[0].newQuorums.filter(quorum => quorum.llmqType === 1)[0]),
      getQuorumsOfType: this.sinon.stub().returns(getSmlFixture()[0].newQuorums.filter(quorum => quorum.llmqType === 1)),
      toSimplifiedMNListDiff: this.sinon.stub().returns(simplifiedMNListDiffMock),
    };

    smlStoreMock = {
      getSMLbyHeight: this.sinon.stub().returns(smlMock),
      getCurrentSML: this.sinon.stub().returns(smlMock),
    };

    simplifiedMasternodeListMock = {
      getStore: this.sinon.stub().returns(smlStoreMock),
    };

    loggerMock = {
      debug: this.sinon.stub(),
      info: this.sinon.stub(),
      trace: this.sinon.stub(),
    };

    validatorsFixture = [
      { proTxHash: 'c286807d463b06c7aba3b9a60acf64c1fc03da8c1422005cd9b4293f08cf0562',
        pubKeyOperator: '06abc1c890c9da4e513d52f20da1882228bfa2db4bb29cbd064e1b2a61d9dcdadcf0784fd1371338c8ad1bf323d87ae6',
        valid: true },
      { proTxHash: 'a3e1edc6bd352eeaf0ae58e30781ef4b127854241a3fe7fddf36d5b7e1dc2b3f',
        pubKeyOperator: '04d748ba0efeb7a8f8548e0c22b4c188c293a19837a1c5440649279ba73ead0c62ac1e840050a10a35e0ae05659d2a8d',
        valid: true },
    ];

    validatorsUpdateFixture = ValidatorSet.fillValidatorUpdates(validatorsFixture);

    coreRpcClientMock = {
      quorum: this.sinon.stub().resolves({
        result: {
          members: validatorsFixture,
        },
        error: null,
        id: 5,
      })
    };

    getValidatorSetInfo = getValidatorSetInfoFactory(coreRpcClientMock, loggerMock);

    initChainHandler = initChainHandlerFactory(
      simplifiedMasternodeListMock,
      updateSimplifiedMasternodeListMock,
      initialCoreChainLockedHeight,
      getValidatorSetInfo,
      loggerMock,
      containerMock,
    );
  });

  it('should update height, start transactions return ResponseBeginBlock and ValidatorSetUpdate', async () => {
    const response = await initChainHandler();

    expect(updateSimplifiedMasternodeListMock).to.be.calledOnceWithExactly(
      initialCoreChainLockedHeight,
    );
    expect(simplifiedMasternodeListMock.getStore).to.have.been.calledOnce();
    expect(response).to.be.an.instanceOf(ResponseInitChain);
    expect(response.validatorSetUpdate).to.be.an.instanceOf(ValidatorSetUpdate);
    expect(response.validatorSetUpdate.thresholdPublicKey).to.be.an.instanceOf(PublicKey);
  });
});
