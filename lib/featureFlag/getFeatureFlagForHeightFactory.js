const Long = require('long');

/**
 * @param {Identifier} featureFlagDataContractId
 * @param {fetchDocuments} fetchDocuments
 *
 * @return {getFeatureFlagForHeight}
 */
function getFeatureFlagForHeightFactory(
  featureFlagDataContractId,
  fetchDocuments,
) {
  /**
   * @typedef getFeatureFlagForHeight
   *
   * @param {string} flagType
   * @param {Long|number} blockHeight
   *
   * @return {Promise<Document|null>}
   */
  async function getFeatureFlagForHeight(flagType, blockHeight) {
    const query = {
      where: [
        ['enableAtHeight', '==', new Long(blockHeight).toInt()],
      ],
    };

    const [document] = await fetchDocuments(
      featureFlagDataContractId,
      flagType,
      query,
    );

    return document;
  }

  return getFeatureFlagForHeight;
}

module.exports = getFeatureFlagForHeightFactory;