const fetchDPContractMethodFactory = require('../../../../lib/api/methods/fetchDPContractMethodFactory');

const getDPContractFixture = require('../../../../lib/test/fixtures/getDPContractFixture');

const InvalidParamsError = require('../../../../lib/api/InvalidParamsError');

describe('fetchDPContractMethod', () => {
  let dpContract;
  let contractId;
  let fetchDPContractMethod;
  let fetchDPContractMock;

  beforeEach(function beforeEach() {
    dpContract = getDPContractFixture();
    contractId = dpContract.getId();

    fetchDPContractMock = this.sinon.stub();
    fetchDPContractMethod = fetchDPContractMethodFactory(fetchDPContractMock);
  });

  it('should throw InvalidParamsError if Contract ID is not provided', async () => {
    let error;
    try {
      await fetchDPContractMethod({});
    } catch (e) {
      error = e;
    }

    expect(error).to.be.instanceOf(InvalidParamsError);

    expect(fetchDPContractMock).not.to.be.called();
  });

  it('should throw error if DAP Contract not found', async () => {
    fetchDPContractMock.returns(null);

    let error;
    try {
      await fetchDPContractMethod({ contractId });
    } catch (e) {
      error = e;
    }

    expect(error).to.be.instanceOf(InvalidParamsError);

    expect(fetchDPContractMock).to.be.calledOnceWith(contractId);
  });

  it('should return DAP contract', async () => {
    const rawDPContract = dpContract.toJSON();

    fetchDPContractMock.returns(rawDPContract);

    const result = await fetchDPContractMethod({ contractId });

    expect(result).to.be.deep.equal(rawDPContract);

    expect(fetchDPContractMock).to.be.calledOnceWith(contractId);
  });
});