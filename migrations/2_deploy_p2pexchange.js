const P2PExchange = artifacts.require('./P2PExchange.sol');

module.exports = function(deployer) {
  deployer.deploy(P2PExchange);
};
