const addSTPacketFactory = require('../../../lib/storage/ipfs/addSTPacketFactory');
const { mocha: { startIPFS } } = require('@dashevo/js-evo-services-ctl');
const getTransitionPacketFixtures = require('../../../lib/test/fixtures/getTransitionPacketFixtures');
const getTransitionHeaderFixtures = require('../../../lib/test/fixtures/getTransitionHeaderFixtures');
const doubleSha256 = require('../../../lib/util/doubleSha256');

describe('StateTransitionHeader', () => {
  const packet = getTransitionPacketFixtures()[0];
  const header = getTransitionHeaderFixtures()[0];

  let addSTPacket;
  startIPFS().then((instance) => {
    addSTPacket = addSTPacketFactory(instance.getApi());
  });

  it('should StateTransitionHeader CID equal to IPFS CID', async () => {
    const packetHash = doubleSha256(packet.toJSON({ skipMeta: true }));

    header.extraPayload.setHashSTPacket(packetHash);

    const stHeaderCid = header.getPacketCID();
    const ipfsCid = await addSTPacket(packet);

    expect(stHeaderCid).to.equal(ipfsCid);
  });
});
