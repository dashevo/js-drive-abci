const {
  mocha: {
    startMongoDb,
    startIPFS,
  },
} = require('@dashevo/dp-services-ctl');

const DashPlatformProtocol = require('@dashevo/dpp');
const DPObject = require('@dashevo/dpp/lib/document/Document');

const sanitizer = require('../../../../lib/mongoDb/sanitizer');

const ReaderMediator = require('../../../../lib/blockchain/reader/BlockchainReaderMediator');

const Revision = require('../../../../lib/stateView/revisions/Revision');
const Reference = require('../../../../lib/stateView/revisions/Reference');
const SVObjectMongoDbRepository = require('../../../../lib/stateView/document/SVObjectMongoDbRepository');
const SVObject = require('../../../../lib/stateView/document/SVObject');

const revertSVObjectsForStateTransitionFactory = require('../../../../lib/stateView/document/revertSVObjectsForStateTransitionFactory');
const createSVObjectMongoDbRepositoryFactory = require('../../../../lib/stateView/document/createSVObjectMongoDbRepositoryFactory');
const updateSVObjectFactory = require('../../../../lib/stateView/document/updateSVObjectFactory');
const applyStateTransitionFactory = require('../../../../lib/stateView/applyStateTransitionFactory');
const applyStateTransitionFromReferenceFactory = require('../../../../lib/stateView/applyStateTransitionFromReferenceFactory');

const STPacketIpfsRepository = require('../../../../lib/storage/stPacket/STPacketIpfsRepository');

const RpcClientMock = require('../../../../lib/test/mock/RpcClientMock');
const ReaderMediatorMock = require('../../../../lib/test/mock/BlockchainReaderMediatorMock');

const getBlocksFixture = require('../../../../lib/test/fixtures/getBlocksFixture');
const getStateTransitionsFixture = require('../../../../lib/test/fixtures/getStateTransitionsFixture');
const getSTPacketsFixture = require('../../../../lib/test/fixtures/getSTPacketsFixture');
const getContractFixture = require('../../../../lib/test/fixtures/getContractFixture');

describe('revertSVObjectsForStateTransitionFactory', () => {
  let userId;
  let stPacketRepository;
  let createSVObjectMongoDbRepository;
  let updateSVObject;
  let applyStateTransition;
  let rpcClientMock;
  let readerMediatorMock;
  let revertSVObjectsForStateTransition;
  let mongoClient;
  let ipfsAPI;
  let stPacket;

  startMongoDb().then((mongoDb) => {
    mongoClient = mongoDb.getClient();
  });

  startIPFS().then((ipfs) => {
    ipfsAPI = ipfs.getApi();
  });

  beforeEach(function beforeEach() {
    userId = '3557b9a8dfcc1ef9674b50d8d232e0e3e9020f49fa44f89cace622a01f43d03e';

    [, stPacket] = getSTPacketsFixture();

    const contract = getContractFixture();

    const dataProviderMock = {
      fetchContract: this.sinon.stub().returns(contract),
    };

    const dpp = new DashPlatformProtocol({
      dataProvider: dataProviderMock,
    });

    stPacketRepository = new STPacketIpfsRepository(
      ipfsAPI,
      dpp,
      1000,
    );

    createSVObjectMongoDbRepository = createSVObjectMongoDbRepositoryFactory(
      mongoClient,
      SVObjectMongoDbRepository,
      sanitizer,
    );

    updateSVObject = updateSVObjectFactory(createSVObjectMongoDbRepository);

    readerMediatorMock = new ReaderMediatorMock(this.sinon);

    applyStateTransition = applyStateTransitionFactory(
      stPacketRepository,
      null,
      updateSVObject,
      readerMediatorMock,
    );

    rpcClientMock = new RpcClientMock(this.sinon);

    const applyStateTransitionFromReference = applyStateTransitionFromReferenceFactory(
      applyStateTransition,
      rpcClientMock,
    );

    revertSVObjectsForStateTransition = revertSVObjectsForStateTransitionFactory(
      stPacketRepository,
      rpcClientMock,
      createSVObjectMongoDbRepository,
      applyStateTransition,
      applyStateTransitionFromReference,
      readerMediatorMock,
    );
  });

  it('should mark SV Objects as deleted if there is no previous version', async () => {
    const [block] = getBlocksFixture();
    const [stateTransition] = getStateTransitionsFixture();
    const [dpObject] = stPacket.getDPObjects();

    stateTransition.extraPayload.regTxId = userId;
    stateTransition.extraPayload.hashSTPacket = stPacket.hash();

    await stPacketRepository.store(stPacket);

    const svObjectRepository = createSVObjectMongoDbRepository(
      stPacket.getContractId(),
      dpObject.getType(),
    );

    const reference = new Reference({
      blockHash: block.hash,
      blockHeight: block.height,
      stHash: stateTransition.hash,
      stPacketHash: stPacket.hash(),
      hash: dpObject.hash(),
    });

    await updateSVObject(
      stPacket.getContractId(),
      userId,
      reference,
      dpObject,
    );

    const svObjects = await svObjectRepository.fetch();

    expect(svObjects).to.be.not.empty();

    await revertSVObjectsForStateTransition({
      stateTransition,
    });

    const svObjectsAfterReverting = await svObjectRepository.fetch();

    expect(svObjectsAfterReverting).to.be.empty();

    expect(readerMediatorMock.emitSerial).to.have.been.calledWith(
      ReaderMediator.EVENTS.DP_OBJECT_MARKED_DELETED,
      {
        userId,
        objectId: dpObject.getId(),
        reference,
        object: dpObject.toJSON(),
      },
    );
  });

  it('should revert SV Object to its previous revision if any', async () => {
    // TODO Revert several objects

    // 1. Store 3 revisions of DP Object in IPFS
    const dpObjectRevisions = [];

    const blocks = getBlocksFixture();
    const stateTransitions = getStateTransitionsFixture();

    const [dpObject] = stPacket.getDPObjects();

    for (let i = 0; i < 3; i++) {
      const block = blocks[i];
      const stateTransition = stateTransitions[i];

      const updatedDPObject = new DPObject(dpObject.toJSON());

      if (i > 0) {
        updatedDPObject.setAction(DPObject.ACTIONS.UPDATE);
      }

      updatedDPObject.setRevision(i);

      stPacket.setDPObjects([updatedDPObject]);

      await stPacketRepository.store(stPacket);

      stateTransition.extraPayload.regTxId = userId;
      stateTransition.extraPayload.hashSTPacket = stPacket.hash();

      const reference = new Reference({
        blockHash: block.hash,
        blockHeight: block.height,
        stHash: stateTransition.hash,
        stPacketHash: stPacket.hash(),
        hash: updatedDPObject.hash(),
      });

      dpObjectRevisions.push({
        revision: i,
        dpObject: updatedDPObject,
        block,
        stateTransition,
        stPacket,
        reference,
      });

      rpcClientMock.getRawTransaction
        .withArgs(stateTransition.hash)
        .resolves({
          result: stateTransition,
        });
    }

    // 2. Create ans store SV Object
    const previousRevisions = dpObjectRevisions.slice(0, 2)
      .map(({ revision, reference }) => (
        new Revision(revision, reference)
      ));

    const thirdDPObjectRevision = dpObjectRevisions[dpObjectRevisions.length - 1];

    const svObject = new SVObject(
      userId,
      thirdDPObjectRevision.dpObject,
      thirdDPObjectRevision.reference,
      false,
      previousRevisions,
    );

    const svObjectRepository = createSVObjectMongoDbRepository(
      stPacket.getContractId(),
      dpObject.getType(),
    );

    await svObjectRepository.store(svObject);

    // 3. Revert 3rd version of contract to 2nd
    await revertSVObjectsForStateTransition({
      stateTransition: thirdDPObjectRevision.stateTransition,
      block: thirdDPObjectRevision.block,
    });

    const revertedSVObjects = await svObjectRepository.fetch(dpObject.getId());

    expect(revertedSVObjects).to.be.an('array');

    const [revertedSVObject] = revertedSVObjects;

    expect(revertedSVObject).to.be.an.instanceOf(SVObject);

    expect(revertedSVObject.getDPObject().getRevision()).to.equal(1);

    expect(revertedSVObject.getPreviousRevisions()).to.deep.equal([
      previousRevisions[0],
    ]);

    expect(readerMediatorMock.emitSerial.getCall(1)).to.have.been.calledWith(
      ReaderMediator.EVENTS.DP_OBJECT_REVERTED,
      {
        userId: svObject.getUserId(),
        objectId: svObject.getDPObject().getId(),
        reference: svObject.getReference(),
        object: svObject.getDPObject().toJSON(),
        previousRevision: previousRevisions[1],
      },
    );
  });

  it('should not do anything if packet have no Contract ID');
});