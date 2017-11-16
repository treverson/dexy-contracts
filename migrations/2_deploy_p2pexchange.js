const P2PExchange = artifacts.require('./P2PExchange.sol');
const StandardToken = artifacts.require('./StandardToken.sol');
module.exports = function(deployer) {
    deployer.deploy(P2PExchange);
    deployer.deploy(StandardToken);
};
