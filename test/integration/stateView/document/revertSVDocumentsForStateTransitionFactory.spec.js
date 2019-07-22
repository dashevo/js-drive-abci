const {
  mocha: {
    startMongoDb,
    startIPFS,
  },
} = require('@dashevo/dp-services-ctl');

const DashPlatformProtocol = require('@dashevo/dpp');
const Document = require('@dashevo/dpp/lib/document/Document');

const ReaderMediator = require('../../../../lib/blockchain/reader/BlockchainReaderMediator');

const Revision = require('../../../../lib/stateView/revisions/Revision');
const Reference = require('../../../../lib/stateView/revisions/Reference');
const SVDocumentMongoDbRepository = require('../../../../lib/stateView/document/mongoDbRepository/SVDocumentMongoDbRepository');
const SVDocument = require('../../../../lib/stateView/document/SVDocument');
const convertWhereToMongoDbQuery = require('../../../../lib/stateView/document/mongoDbRepository/convertWhereToMongoDbQuery');
const validateQueryFactory = require('../../../../lib/stateView/document/query/validateQueryFactory');
const findConflictingConditions = require('../../../../lib/stateView/document/query/findConflictingConditions');

const revertSVDocumentsForStateTransitionFactory = require('../../../../lib/stateView/document/revertSVDocumentsForStateTransitionFactory');
const createSVDocumentMongoDbRepositoryFactory = require('../../../../lib/stateView/document/mongoDbRepository/createSVDocumentMongoDbRepositoryFactory');
const updateSVDocumentFactory = require('../../../../lib/stateView/document/updateSVDocumentFactory');
const applyStateTransitionFactory = require('../../../../lib/stateView/applyStateTransitionFactory');
const applyStateTransitionFromReferenceFactory = require('../../../../lib/stateView/applyStateTransitionFromReferenceFactory');

const STPacketIpfsRepository = require('../../../../lib/storage/stPacket/STPacketIpfsRepository');

const RpcClientMock = require('../../../../lib/test/mock/RpcClientMock');
const ReaderMediatorMock = require('../../../../lib/test/mock/BlockchainReaderMediatorMock');

const getBlocksFixture = require('../../../../lib/test/fixtures/getBlocksFixture');
const getStateTransitionsFixture = require('../../../../lib/test/fixtures/getStateTransitionsFixture');
const getSTPacketsFixture = require('../../../../lib/test/fixtures/getSTPacketsFixture');
const getContractFixture = require('../../../../lib/test/fixtures/getContractFixture');

describe('revertSVDocumentsForStateTransitionFactory', () => {
  let userId;
  let stPacketRepository;
  let createSVDocumentMongoDbRepository;
  let updateSVDocument;
  let applyStateTransition;
  let rpcClientMock;
  let readerMediatorMock;
  let revertSVDocumentsForStateTransition;
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

    const validateQuery = validateQueryFactory(findConflictingConditions);

    createSVDocumentMongoDbRepository = createSVDocumentMongoDbRepositoryFactory(
      mongoClient,
      SVDocumentMongoDbRepository,
      convertWhereToMongoDbQuery,
      validateQuery,
    );

    updateSVDocument = updateSVDocumentFactory(createSVDocumentMongoDbRepository);

    readerMediatorMock = new ReaderMediatorMock(this.sinon);

    applyStateTransition = applyStateTransitionFactory(
      stPacketRepository,
      null,
      updateSVDocument,
      readerMediatorMock,
    );

    rpcClientMock = new RpcClientMock(this.sinon);

    const applyStateTransitionFromReference = applyStateTransitionFromReferenceFactory(
      applyStateTransition,
      rpcClientMock,
    );

    revertSVDocumentsForStateTransition = revertSVDocumentsForStateTransitionFactory(
      stPacketRepository,
      rpcClientMock,
      createSVDocumentMongoDbRepository,
      applyStateTransition,
      applyStateTransitionFromReference,
      readerMediatorMock,
    );
  });

  it('should mark SVDocuments as deleted if there is no previous version', async () => {
    const [block] = getBlocksFixture();
    const [stateTransition] = getStateTransitionsFixture();
    const [document] = stPacket.getDocuments();

    stateTransition.extraPayload.regTxId = userId;
    stateTransition.extraPayload.hashSTPacket = stPacket.hash();

    await stPacketRepository.store(stPacket);

    const svDocumentRepository = createSVDocumentMongoDbRepository(
      stPacket.getContractId(),
      document.getType(),
    );

    const reference = new Reference({
      blockHash: block.hash,
      blockHeight: block.height,
      stHash: stateTransition.hash,
      stPacketHash: stPacket.hash(),
      hash: document.hash(),
    });

    await updateSVDocument(
      stPacket.getContractId(),
      userId,
      reference,
      document,
    );

    const svDocuments = await svDocumentRepository.fetch();

    expect(svDocuments).to.be.not.empty();

    await revertSVDocumentsForStateTransition({
      stateTransition,
    });

    const svDocumentsAfterReverting = await svDocumentRepository.fetch();

    expect(svDocumentsAfterReverting).to.be.empty();

    const documentJson = document.toJSON();
    documentJson.$meta = {
      userId,
      stReference: {
        blockHash: reference.getBlockHash(),
        blockHeight: reference.getBlockHeight(),
        stHeaderHash: reference.getSTHash(),
        stPacketHash: reference.getSTPacketHash(),
      },
    };

    expect(readerMediatorMock.emitSerial).to.have.been.calledWith(
      ReaderMediator.EVENTS.DOCUMENT_MARKED_DELETED,
      {
        userId,
        documentId: document.getId(),
        reference,
        document: documentJson,
      },
    );
  });

  it('should revert SVDocument to its previous revision if any', async () => {
    // TODO Revert several documents

    // 1. Store 3 revisions of Document in IPFS
    const documentRevisions = [];

    const blocks = getBlocksFixture();
    const stateTransitions = getStateTransitionsFixture();

    const [document] = stPacket.getDocuments();

    for (let i = 0; i < 3; i++) {
      const block = blocks[i];
      const stateTransition = stateTransitions[i];

      const updatedDocument = new Document(document.toJSON());

      if (i > 0) {
        updatedDocument.setAction(Document.ACTIONS.UPDATE);
      }

      updatedDocument.setRevision(i);

      stPacket.setDocuments([updatedDocument]);

      await stPacketRepository.store(stPacket);

      stateTransition.extraPayload.regTxId = userId;
      stateTransition.extraPayload.hashSTPacket = stPacket.hash();

      const reference = new Reference({
        blockHash: block.hash,
        blockHeight: block.height,
        stHash: stateTransition.hash,
        stPacketHash: stPacket.hash(),
        hash: updatedDocument.hash(),
      });

      documentRevisions.push({
        revision: i,
        document: updatedDocument,
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

    // 2. Create ans store SVDocument
    const previousRevisions = documentRevisions.slice(0, 2)
      .map(({ revision, reference }) => (
        new Revision(revision, reference)
      ));

    const thirdDocumentRevision = documentRevisions[documentRevisions.length - 1];

    const svDocument = new SVDocument(
      userId,
      thirdDocumentRevision.document,
      thirdDocumentRevision.reference,
      false,
      previousRevisions,
    );

    const svDocumentRepository = createSVDocumentMongoDbRepository(
      stPacket.getContractId(),
      document.getType(),
    );

    await svDocumentRepository.store(svDocument);

    // 3. Revert 3rd version of contract to 2nd
    await revertSVDocumentsForStateTransition({
      stateTransition: thirdDocumentRevision.stateTransition,
      block: thirdDocumentRevision.block,
    });

    const revertedSVDocuments = await svDocumentRepository.fetch();

    expect(revertedSVDocuments).to.be.an('array');

    const [revertedSVDocument] = revertedSVDocuments;

    expect(revertedSVDocument).to.be.an.instanceOf(SVDocument);

    expect(revertedSVDocument.getDocument().getRevision()).to.equal(1);

    expect(revertedSVDocument.getPreviousRevisions()).to.deep.equal([
      previousRevisions[0],
    ]);

    const currentReference = svDocument.getCurrentRevision()
      .getReference();

    const documentJson = svDocument.getDocument().toJSON();
    documentJson.$meta = {
      userId: svDocument.getUserId(),
      stReference: {
        blockHash: currentReference.getBlockHash(),
        blockHeight: currentReference.getBlockHeight(),
        stHeaderHash: currentReference.getSTHash(),
        stPacketHash: currentReference.getSTPacketHash(),
      },
    };

    expect(readerMediatorMock.emitSerial.getCall(1)).to.have.been.calledWith(
      ReaderMediator.EVENTS.DOCUMENT_REVERTED,
      {
        userId: svDocument.getUserId(),
        documentId: svDocument.getDocument().getId(),
        reference: svDocument.getReference(),
        document: documentJson,
        previousRevision: previousRevisions[1],
      },
    );
  });

  it('should not do anything if packet have no Contract ID');
});
