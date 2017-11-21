'use strict'

const contract = require('truffle-contract')
const web3 = require('web3')

module.exports = function(providerUrl) {
    const ExchangeJSON = require('./build/contracts/Exchange.json')

    const Exchange = contract(ExchangeJSON)
    const provider = new web3.providers.HttpProvider(providerUrl)
    Exchange.setProvider(provider)
    return Exchange
}

module.exports.ABCToken = function(providerUrl) {
    const JSON = require('./build/contracts/ABCToken.json')
    const ABCToken = contract(JSON)
    const provider = new web3.providers.HttpProvider(providerUrl)
    ABCToken.setProvider(provider)
    return ABCToken
}