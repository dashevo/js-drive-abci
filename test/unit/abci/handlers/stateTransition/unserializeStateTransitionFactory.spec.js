const getIdentityCreateTransitionFixture = require('@dashevo/dpp/lib/test/fixtures/getIdentityCreateTransitionFixture');

const ConsensusError = require('@dashevo/dpp/lib/errors/ConsensusError');
const InvalidStateTransitionError = require('@dashevo/dpp/lib/stateTransition/errors/InvalidStateTransitionError');
const BalanceNotEnoughError = require('@dashevo/dpp/lib/errors/BalanceIsNotEnoughError');
const ValidatorResult = require('@dashevo/dpp/lib/validation/ValidationResult');

const unserializeStateTransitionFactory = require('../../../../../lib/abci/handlers/stateTransition/unserializeStateTransitionFactory');

const AbciError = require('../../../../../lib/abci/errors/AbciError');
const InvalidArgumentAbciError = require('../../../../../lib/abci/errors/InvalidArgumentAbciError');
const InsufficientFundsError = require('../../../../../lib/abci/errors/InsufficientFundsError');

describe('unserializeStateTransitionFactory', () => {
  let unserializeStateTransition;
  let stateTransitionFixture;
  let dppMock;

  beforeEach(function beforeEach() {
    stateTransitionFixture = getIdentityCreateTransitionFixture().toBuffer();

    dppMock = {
      dispose: this.sinon.stub(),
      stateTransition: {
        createFromBuffer: this.sinon.stub(),
        validateFee: this.sinon.stub(),
      },
    };

    unserializeStateTransition = unserializeStateTransitionFactory(dppMock);
  });

  it('should throw InvalidArgumentAbciError if State Transition is not specified', async () => {
    try {
      await unserializeStateTransition();

      expect.fail('should throw InvalidArgumentAbciError error');
    } catch (e) {
      expect(e).to.be.instanceOf(InvalidArgumentAbciError);
      expect(e.getMessage()).to.equal('State Transition is not specified');
      expect(e.getCode()).to.equal(AbciError.CODES.INVALID_ARGUMENT);

      expect(dppMock.stateTransition.validateFee).to.not.be.called();
    }
  });

  it('should throw InvalidArgumentAbciError if State Transition is invalid', async () => {
    const consensusError = new ConsensusError('Invalid state transition');
    const error = new InvalidStateTransitionError(
      [consensusError],
      stateTransitionFixture,
    );

    dppMock.stateTransition.createFromBuffer.throws(error);

    try {
      await unserializeStateTransition(stateTransitionFixture);

      expect.fail('should throw InvalidArgumentAbciError error');
    } catch (e) {
      expect(e).to.be.instanceOf(InvalidArgumentAbciError);
      expect(e.getMessage()).to.equal('State Transition is invalid');
      expect(e.getCode()).to.equal(AbciError.CODES.INVALID_ARGUMENT);
      expect(e.getData()).to.deep.equal({
        errors: [consensusError],
      });

      expect(dppMock.stateTransition.createFromBuffer).to.be.calledOnce();
      expect(dppMock.stateTransition.validateFee).to.not.be.called();
    }
  });

  it('should throw the error from createFromBuffer if throws not InvalidStateTransitionError', async () => {
    const error = new Error('Custom error');
    dppMock.stateTransition.createFromBuffer.throws(error);

    try {
      await unserializeStateTransition(stateTransitionFixture);

      expect.fail('should throw an error');
    } catch (e) {
      expect(e).to.be.equal(error);

      expect(dppMock.stateTransition.createFromBuffer).to.be.calledOnce();
      expect(dppMock.stateTransition.validateFee).to.not.be.called();
    }
  });

  it('should throw InsufficientFundsError in case if identity has not enough credits', async () => {
    const balance = 1000;
    const error = new BalanceNotEnoughError(balance);

    dppMock.stateTransition.validateFee.resolves(
      new ValidatorResult([error]),
    );

    try {
      await unserializeStateTransition(stateTransitionFixture);

      expect.fail('should throw an InsufficientFundsError');
    } catch (e) {
      expect(e).to.be.instanceOf(InsufficientFundsError);
      expect(e.getData().balance).to.equal(balance);

      expect(dppMock.stateTransition.createFromBuffer).to.be.calledOnce();
      expect(dppMock.stateTransition.validateFee).to.be.calledOnce();
    }
  });

  it('should return stateTransition', async () => {
    const stateTransition = getIdentityCreateTransitionFixture();

    dppMock.stateTransition.createFromBuffer.resolves(stateTransition);

    dppMock.stateTransition.validateFee.resolves(new ValidatorResult());

    const result = await unserializeStateTransition(stateTransitionFixture);

    expect(result).to.deep.equal(stateTransition);

    expect(dppMock.stateTransition.validateFee).to.be.calledOnceWith(stateTransition);
  });
});
