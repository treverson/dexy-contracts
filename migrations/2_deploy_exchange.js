const Exchange = artifacts.require('./Exchange.sol');
const StandardToken = artifacts.require('./StandardToken.sol');
const ABCToken = artifacts.require('./ABCToken.sol');
const XYZToken = artifacts.require('./XYZToken.sol');

module.exports = function(deployer) {
    deployer.deploy(Exchange);
    deployer.deploy(StandardToken);
    deployer.deploy(XYZToken);
    deployer.deploy(ABCToken);
};
