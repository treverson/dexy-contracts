'use strict'

const P2PExchange = artifacts.require("./P2PExchange.sol")
const ABCToken = artifacts.require('./ABCToken.sol')
const XYZToken = artifacts.require('./XYZToken.sol')

const { expect } = require('chai')

contract('P2PExchange', function(accounts) {

    const maker = accounts[0]
    const taker = accounts[1]

    let exchange
    let abc
    let xyz

    before(() => {

        const TOKEN_MINT = web3.toWei(10000)

        return P2PExchange.deployed()
        .then(contract => {
            exchange = contract
            return ABCToken.deployed()
        })
        .then(contract => {
            abc = contract
            return Promise.all([
                abc.mint( TOKEN_MINT, { from: maker }),
                abc.mint( TOKEN_MINT, { from: taker })
            ])
        })
        .then(() => {
            return XYZToken.deployed()
        })
        .then(contract => {
            xyz = contract
            return Promise.all([
                xyz.mint( TOKEN_MINT, { from: maker }),
                xyz.mint( TOKEN_MINT, { from: taker })
            ])
        })
    })

    describe('fallback function', () => {
        it('stores deposits', () => {
            return exchange.sendTransaction({
                from: maker,
                value: web3.toWei(20)
            })
            .then(() => {
                expect(web3.eth.getBalance(exchange.address))
                .to.eql( web3.toBigNumber(web3.toWei(20)) )
                return exchange.wrappedETH.call(maker)
            })
            .then(balance => {
                expect(balance).to.eql( web3.toBigNumber(web3.toWei(20)) )
            })
        })
    })

    describe('withdraw', () => {
        it('prevents overdraft', () => {
            return exchange.withdraw.call('0x0', web3.toWei(21))
            .then(result => {
                expect(result).to.eq(false)
            })
            .then(() => {
                return exchange.withdraw('0x0', web3.toWei(21))
            })
            .then(() => {
                expect( web3.eth.getBalance(exchange.address ))
                .to.eql( web3.toBigNumber(web3.toWei(20)) )
                return exchange.wrappedETH.call(maker)
            })
            .then(balance => {
                // Ensure balance remains unchanged
                expect(balance).to.eql( web3.toBigNumber(web3.toWei(20)) )
            })
        })

        it('allows users to withdraw funds', () => {
            return exchange.withdraw('0x0', web3.toWei(20))
            .then(() => {
                return exchange.wrappedETH.call(maker)
            })
            .then(balance => {
                expect(balance.toNumber()).to.eq(0)
            })
        })

        it('returns false when a user withdraws more token than they have')

        it('allows users to withdraw a token')
    })

    describe('exchange', () => {
        it('emits TransactionFailed when order is cancelled')

        it('emits TransactionFailed when order is filled')

        it('emits TransactionFailed when signature is invalid')

        it('emits TransactionFailed when order is expired')

        it('emits TransactionFailed when order is unauthorized')

        it('emits InsufficientFunds when maker does not have enough ETH')

        it('emits InsufficientFunds when maker does not have enough Token')

        it('emits InsufficientFunds when taker does not send enough ETH')

        it('emits InsufficientFunds when taker does not have enough Token')

        it('can exchange ETH for Token')

        it('can exchange Token for Token')

        it('can exchnage Token for ETH')
    })
})

function makeSignedOrder(order, account) {
}

function _formatOrder(order) {

}

function _orderToArray(order) {
    return [
        order.buying,
        order.buyQuantity,
        order.expiration,
        order.maker,
        order.
    ]
}
